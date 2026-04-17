import { prisma } from "./prisma";
import { sendText, setTyping } from "./zapi";
import {
  classifyLead,
  generateReply,
  detectTone,
  extractProfileLearnings,
  type ContactProfile,
} from "./claude";
import { getFreeBusy } from "./google";
import {
  logError,
  validateReply,
  FALLBACK_REPLIES,
  recordError,
  resetCircuitSuccess,
  isCircuitOpen,
  alertOwner,
} from "./reliability";

const DEFAULT_PERSONA = `Você é Sofia, recepcionista virtual de Jean Izidoro. Tom acolhedor, elegante, atenta e calorosa. Sempre prioriza entender o cliente antes de oferecer algo. Nunca soa robótica — fala como uma profissional atenciosa conversaria.`;
const DEFAULT_CONTEXT = `Jean Izidoro é arquiteto e cenógrafo de eventos de alto padrão em São Paulo. Atua há mais de 10 anos com casamentos, eventos corporativos, cenografia autoral e debutantes. Atendimentos comerciais são feitos pessoalmente no escritório do Jean — a Sofia qualifica leads e agenda reuniões.`;

async function getBusyDaysSummary(): Promise<string> {
  try {
    const { busy } = await getFreeBusy(120);
    if (!busy.length) return "Não há compromissos no Google Calendar nos próximos 120 dias.";
    const days = new Set<string>();
    for (const b of busy) {
      if (!b.start || !b.end) continue;
      const s = new Date(b.start);
      const e = new Date(b.end);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        days.add(d.toISOString().slice(0, 10));
      }
    }
    const sorted = [...days].sort();
    return `Datas OCUPADAS no calendar do Jean (NÃO sugerir estas): ${sorted.slice(0, 30).join(", ")}${sorted.length > 30 ? "..." : ""}`;
  } catch {
    return "";
  }
}

async function getOrCreateConfig() {
  let cfg = await prisma.aiConfig.findFirst();
  if (!cfg) {
    cfg = await prisma.aiConfig.create({
      data: {
        personaPrompt: DEFAULT_PERSONA,
        businessContext: DEFAULT_CONTEXT,
        autoReply: true,
        workStartHour: 8,
        workEndHour: 22,
        escalateKeywords: ["falar com jean", "humano", "atendente", "reclamação", "reclamar"],
      },
    });
  }
  return cfg;
}

function getHourInBR() {
  return parseInt(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
    10
  );
}

function isWithinHours(start: number, end: number) {
  const h = getHourInBR();
  return h >= start && h < end;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function rand(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min));
}

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

async function sendChunksSafely(phone: string, chunks: string[], conversationId: string, sender: "AI" | "HUMAN" = "AI") {
  const sent: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const typingMs = Math.min(Math.max(chunk.length * 40, 1500), 5000);
    await setTyping(phone, typingMs);
    try {
      const res = await sendText(phone, chunk);
      await prisma.message.create({
        data: {
          conversationId,
          direction: "OUT",
          sender,
          content: chunk,
          zapiMessageId: res?.messageId ?? null,
        },
      });
      sent.push(chunk);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logError("zapi:send", msg, { phone, chunk });
      throw e;
    }
    if (i < chunks.length - 1) await sleep(rand(2500, 4500));
  }
  return sent;
}

export async function processInboundMessage(args: {
  phone: string;
  text: string;
  senderName?: string;
  zapiMessageId?: string;
}) {
  const { phone, text, senderName, zapiMessageId } = args;
  console.log(`[PIPELINE] start phone=${phone} text="${text.slice(0, 50)}" sender=${senderName}`);

  // 0. circuit breaker check
  if (await isCircuitOpen()) {
    console.log(`[PIPELINE] circuit_open`);
    await logError("circuit", "circuit open, skipping AI reply", { phone });
    return { skipped: "circuit_open" };
  }

  // 1. upsert contact
  const existing = await prisma.contact.findUnique({ where: { phone } });
  const contact = await prisma.contact.upsert({
    where: { phone },
    update: {
      name: senderName && !existing?.name ? senderName : undefined,
      lastSeenAt: new Date(),
    },
    create: {
      phone,
      name: senderName ?? null,
      firstMsgAt: new Date(),
      lastSeenAt: new Date(),
    },
  });

  const isFirstInteraction = !existing;

  // 2. open conversation
  let conv = await prisma.conversation.findFirst({
    where: { contactId: contact.id, status: { not: "CLOSED" } },
    orderBy: { createdAt: "desc" },
  });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { contactId: contact.id } });
  }

  // 3. save inbound
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      direction: "IN",
      sender: "CONTACT",
      content: text,
      zapiMessageId: zapiMessageId ?? null,
    },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: { lastMsgAt: new Date() },
  });

  const cfg = await getOrCreateConfig();

  // 4. guards
  if (contact.isVip) { console.log("[PIPELINE] skip vip"); return { skipped: "vip" }; }
  if (cfg.pauseAll) { console.log("[PIPELINE] skip pauseAll"); return { skipped: "global_pause" }; }
  if (conv.aiPaused) { console.log("[PIPELINE] skip aiPaused"); return { skipped: "conv_pause" }; }
  if (conv.status === "HANDLED_BY_HUMAN") { console.log("[PIPELINE] skip human"); return { skipped: "human" }; }
  if (!cfg.autoReply) { console.log("[PIPELINE] skip autoReply=false"); return { skipped: "auto_reply_off" }; }
  if (!isWithinHours(cfg.workStartHour, cfg.workEndHour)) {
    console.log(`[PIPELINE] skip off_hours (cfg=${cfg.workStartHour}-${cfg.workEndHour} nowBR=${getHourInBR()} utc=${new Date().getHours()})`);
    return { skipped: "off_hours" };
  }

  const keywords = (cfg.escalateKeywords as string[]) || [];
  const lower = text.toLowerCase();
  if (keywords.some((k: string) => lower.includes(k.toLowerCase()))) {
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { status: "HANDLED_BY_HUMAN", aiPaused: true },
    });
    return { skipped: "escalated" };
  }

  // 5. detect tone + load profile
  const detectedTone = await detectTone(text);
  const profile = (contact.profile as ContactProfile | null) || null;

  if (contact.tone !== detectedTone) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { tone: detectedTone },
    });
  }

  // 6. history
  const history = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  const formatted = history.map((m) => ({
    role: (m.direction === "IN" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  // 7. initial micro-delay
  await sleep(rand(2000, 5000));

  // 7.5 calendar context (non-blocking failure)
  const calendarContext = await getBusyDaysSummary();

  // 8. generate reply (with retry + timeout já nos wrappers)
  console.log(`[PIPELINE] calling claude, tone=${detectedTone}, firstInteraction=${isFirstInteraction}`);
  let chunks: string[] = [];
  try {
    chunks = await generateReply({
      persona: cfg.personaPrompt,
      businessContext: cfg.businessContext,
      history: formatted,
      contactName: contact.name,
      contactProfile: profile,
      detectedTone,
      isFirstInteraction,
      calendarContext,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[PIPELINE] claude FAILED:`, msg);
    await logError("claude:reply", msg, { phone, contactId: contact.id });
    const breaker = await recordError();
    if (breaker.tripped) {
      await alertOwner(
        `IA foi PAUSADA automaticamente após múltiplos erros. Entre no painel, cheque /app/ia e reative quando resolver.`
      );
    } else {
      await alertOwner(`Erro ao gerar resposta. Último contato: ${phone}. Erro: ${msg.slice(0, 200)}`);
    }
    // fallback seguro
    chunks = [...FALLBACK_REPLIES.aiDown];
  }

  if (chunks.length === 0) {
    chunks = [...FALLBACK_REPLIES.generic];
  }

  // 8.5 validação anti-alucinação
  const joined = chunks.join(" ");
  const validation = validateReply(joined);
  if (!validation.ok) {
    await logError("claude:hallucination", validation.reason || "inválida", {
      phone,
      content: joined.slice(0, 300),
    });
    await alertOwner(
      `Resposta da IA bloqueada por violação de regra: "${validation.reason}". Conversa: ${phone}. Revisão manual necessária.`
    );
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { status: "HANDLED_BY_HUMAN", aiPaused: true },
    });
    // envia só a confirmação neutra (não arrisca o texto alucinado)
    chunks = [...FALLBACK_REPLIES.generic];
  }

  console.log(`[PIPELINE] sending ${chunks.length} chunks`);
  // 9. send
  try {
    await sendChunksSafely(phone, chunks, conv.id);
    console.log(`[PIPELINE] sent OK`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[PIPELINE] zapi send FAILED:`, msg);
    await logError("zapi:send_final", msg, { phone });
    const breaker = await recordError();
    if (breaker.tripped) {
      await alertOwner(`IA PAUSADA automaticamente — falhas consecutivas no Z-API. Cheque sua instância Z-API.`);
    } else {
      await alertOwner(`Erro ao enviar resposta pelo Z-API pra ${phone}. Erro: ${msg.slice(0, 200)}`);
    }
    return { error: "zapi_send_failed" };
  }

  // sucesso → reset contador do breaker
  await resetCircuitSuccess();

  // 10. classify + profile (SÍNCRONO pra garantir que o Lead apareça no Kanban)
  try {
    console.log(`[PIPELINE] classifying + extracting profile`);
    const fullHistory = await prisma.message.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: "asc" },
    });
    const fullFormatted = fullHistory.map((m) => ({
      role: (m.direction === "IN" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

    const [extraction, updatedProfile] = await Promise.all([
      classifyLead(fullFormatted),
      extractProfileLearnings(fullFormatted, profile),
    ]);

    console.log(`[PIPELINE] lead extracted: temp=${extraction.temperature} type=${extraction.eventType} date=${extraction.eventDate}`);

    const scoreInt = toInt(extraction.score) ?? 0;
    const guestCountInt = toInt(extraction.guestCount);
    const eventDateObj = extraction.eventDate ? new Date(extraction.eventDate) : null;
    const eventDateValid = eventDateObj && !isNaN(eventDateObj.getTime()) ? eventDateObj : null;

    await prisma.lead.upsert({
      where: { conversationId: conv.id },
      create: {
        contactId: contact.id,
        conversationId: conv.id,
        temperature: extraction.temperature,
        score: scoreInt,
        eventType: extraction.eventType,
        eventDate: eventDateValid,
        guestCount: guestCountInt,
        location: extraction.location,
        budget: extraction.budget,
        style: extraction.style,
        summary: extraction.summary,
        rawData: extraction as object,
      },
      update: {
        temperature: extraction.temperature,
        score: scoreInt,
        eventType: extraction.eventType ?? undefined,
        eventDate: eventDateValid ?? undefined,
        guestCount: guestCountInt ?? undefined,
        location: extraction.location ?? undefined,
        budget: extraction.budget ?? undefined,
        style: extraction.style ?? undefined,
        summary: extraction.summary,
        rawData: extraction as object,
      },
    });
    console.log(`[PIPELINE] lead upserted for conv=${conv.id}`);

    const profileUpdate: { name?: string; profile?: object } = {};
    if (extraction.contactName && !contact.name) profileUpdate.name = extraction.contactName;
    if (updatedProfile) profileUpdate.profile = { ...updatedProfile, detectedTone } as object;
    if (Object.keys(profileUpdate).length > 0) {
      await prisma.contact.update({ where: { id: contact.id }, data: profileUpdate });
    }

    if (extraction.shouldEscalate) {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { status: "HANDLED_BY_HUMAN" },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[PIPELINE] classify FAILED:`, msg);
    await logError("claude:classify", msg);
  }

  return { ok: true, chunks: chunks.length };
}
