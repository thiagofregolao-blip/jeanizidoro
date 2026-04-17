import { prisma } from "./prisma";

// ─────────────────────────────────────────────
// TIMEOUT
// ─────────────────────────────────────────────
export async function withTimeout<T>(promise: Promise<T>, ms: number, label = "task"): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}:${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

// ─────────────────────────────────────────────
// RETRY COM EXPONENTIAL BACKOFF
// ─────────────────────────────────────────────
export async function retry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const { retries = 3, baseDelayMs = 1500, label = "op" } = opts;
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === retries - 1) break;
      const delay = baseDelayMs * Math.pow(2, i) + Math.random() * 500;
      console.warn(`[retry:${label}] attempt ${i + 1}/${retries} failed, waiting ${delay}ms`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────
// ERROR LOG
// ─────────────────────────────────────────────
export async function logError(source: string, message: string, context?: Record<string, unknown>) {
  try {
    await prisma.errorLog.create({
      data: {
        source,
        level: "error",
        message: message.slice(0, 2000),
        context: context as object,
      },
    });
  } catch (e) {
    console.error("Failed to log error to DB", e);
  }
}

// ─────────────────────────────────────────────
// VALIDADOR ANTI-ALUCINAÇÃO
// Bloqueia respostas que violam regras invioláveis
// ─────────────────────────────────────────────
const FORBIDDEN_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /r\$\s*\d{2,}\.?\d*,?\d*|(\d{2,})\s*reais?|valor\s+(é|será|fica)\s+\d/i, reason: "menciona valor em reais" },
  { pattern: /dat[ao]\s+(está|foi)\s+(reservad|confirmad|garantid)/i, reason: "confirma reserva de data" },
  { pattern: /agend(ei|ado|amos)\s+(com|sua)\s+(sucesso|reserva)/i, reason: "confirma agendamento" },
  { pattern: /(pode|vou)\s+(transfer|depósit|pix)/i, reason: "pede pagamento" },
  { pattern: /desconto\s+(especial\s+)?de\s+\d+%/i, reason: "oferece desconto específico" },
];

export function validateReply(reply: string): { ok: boolean; reason?: string } {
  if (!reply || reply.trim().length < 2) return { ok: false, reason: "resposta vazia" };
  if (reply.length > 1500) return { ok: false, reason: "resposta longa demais (>1500 chars)" };
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(reply)) return { ok: false, reason };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────
// FALLBACKS SEGUROS
// Usados quando Claude falha ou resposta é rejeitada
// ─────────────────────────────────────────────
export const FALLBACK_REPLIES = {
  firstContact: [
    "Oi! Que felicidade ter você aqui ✨",
    "Me dá só um instante que já volto com a atenção que você merece 💫",
  ],
  generic: [
    "Oi! Deixa eu verificar uma informação aqui",
    "Volto em instantes com tudo certinho pra você 💫",
  ],
  aiDown: [
    "Oi! Recebi sua mensagem 💫",
    "O Jean ou alguém da equipe vai te responder em breve, tá?",
  ],
} as const;

// ─────────────────────────────────────────────
// CIRCUIT BREAKER
// Se ≥3 erros em 5 min, pausa IA automaticamente
// ─────────────────────────────────────────────
const BREAKER_THRESHOLD = 3;
const BREAKER_WINDOW_MS = 5 * 60 * 1000;
const BREAKER_COOLDOWN_MS = 15 * 60 * 1000;

export async function recordError() {
  const now = new Date();
  const state = await prisma.circuitBreakerState.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", errorCount: 1, lastError: now },
    update: {},
  });

  const withinWindow =
    state.lastError && now.getTime() - state.lastError.getTime() < BREAKER_WINDOW_MS;
  const newCount = withinWindow ? state.errorCount + 1 : 1;

  const shouldTrip = newCount >= BREAKER_THRESHOLD && !state.trippedAt;

  await prisma.circuitBreakerState.update({
    where: { id: "singleton" },
    data: {
      errorCount: newCount,
      lastError: now,
      trippedAt: shouldTrip ? now : state.trippedAt,
    },
  });

  if (shouldTrip) {
    await prisma.aiConfig.updateMany({ data: { pauseAll: true } });
    return { tripped: true };
  }
  return { tripped: false, count: newCount };
}

export async function isCircuitOpen(): Promise<boolean> {
  const state = await prisma.circuitBreakerState.findUnique({ where: { id: "singleton" } });
  if (!state?.trippedAt) return false;
  const elapsed = Date.now() - state.trippedAt.getTime();
  if (elapsed > BREAKER_COOLDOWN_MS) {
    await prisma.circuitBreakerState.update({
      where: { id: "singleton" },
      data: { trippedAt: null, errorCount: 0 },
    });
    await prisma.aiConfig.updateMany({ data: { pauseAll: false } });
    return false;
  }
  return true;
}

export async function resetCircuitSuccess() {
  const state = await prisma.circuitBreakerState.findUnique({ where: { id: "singleton" } });
  if (!state || state.errorCount === 0) return;
  await prisma.circuitBreakerState.update({
    where: { id: "singleton" },
    data: { errorCount: 0, trippedAt: null },
  });
}

// ─────────────────────────────────────────────
// ALERTA WHATSAPP PARA O JEAN
// ─────────────────────────────────────────────
let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 15 * 60 * 1000;

export async function alertOwner(message: string) {
  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  if (!ownerPhone) return;

  const now = Date.now();
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAt = now;

  try {
    const { sendText } = await import("./zapi");
    await sendText(ownerPhone, `🔔 Sistema Jean Izidoro CRM\n\n${message}\n\nAcesse o painel pra ver mais.`);
  } catch (e) {
    console.error("Failed to alert owner", e);
  }
}
