import { prisma } from "./prisma";
import { sendText, setTyping } from "./zapi";
import {
  classifyLead,
  generateReply,
  detectTone,
  extractProfileLearnings,
  updateRecentInteractions,
  type ContactProfile,
} from "./claude";
import { getAppointmentsContext } from "./appointments";
import { buildLeadDossier } from "./leadDossier";
import { captureFromMessage, messageHasInspirationHint } from "./inspirations";
import type { ZapiInbound } from "./zapi";
import {
  logError,
  validateReply,
  FALLBACK_REPLIES,
  recordError,
  resetCircuitSuccess,
  isCircuitOpen,
  alertOwner,
} from "./reliability";

const DEFAULT_PERSONA = `Você é Marina, recepcionista virtual de Jean Izidoro. Tom acolhedor, elegante, atenta e calorosa. Sempre prioriza entender o cliente antes de oferecer algo. Nunca soa robótica — fala como uma profissional atenciosa conversaria.`;
const DEFAULT_CONTEXT = `Jean Izidoro é arquiteto de eventos de alto padrão. Atua há mais de 10 anos nas três frentes: Decoração de Casamentos, Assessoria Cerimonial de Eventos (planejamento e coordenação completa) e Decoração de Festas Infantis. Atendimentos comerciais são feitos pessoalmente no escritório do Jean — a Marina qualifica leads e agenda reuniões.`;


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
  } else {
    // Migrações one-shot na persona/contexto:
    let needsUpdate = false;
    let newPersona = cfg.personaPrompt;
    let newContext = cfg.businessContext;

    // 1. Sofia → Marina
    if (/\bSofia\b/.test(newPersona) || /\bSofia\b/.test(newContext)) {
      newPersona = newPersona.replace(/\bSofia\b/g, "Marina");
      newContext = newContext.replace(/\bSofia\b/g, "Marina");
      needsUpdate = true;
    }

    // 2. Escopo antigo (cenografia/corporativo/debutantes) → escopo novo
    if (/cenografia|corporativ|debutante|15 anos/i.test(newContext)) {
      newContext = DEFAULT_CONTEXT;
      needsUpdate = true;
    }

    if (needsUpdate) {
      cfg = await prisma.aiConfig.update({
        where: { id: cfg.id },
        data: { personaPrompt: newPersona, businessContext: newContext },
      });
      console.log("[AI-CONFIG] persona/contexto atualizado");
    }
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

async function generateAttendCode(phone: string): Promise<string> {
  const last4 = phone.replace(/\D/g, "").slice(-4) || "0000";
  const year = new Date().getFullYear();
  const base = `ATD-${year}-${last4}`;
  // Verifica colisão e adiciona sufixo (B, C, D...) se necessário
  const existing = await prisma.lead.findFirst({ where: { attendCode: base } });
  if (!existing) return base;
  for (const suffix of "BCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const candidate = `${base}${suffix}`;
    const dup = await prisma.lead.findFirst({ where: { attendCode: candidate } });
    if (!dup) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
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
  rawPayload?: ZapiInbound;
}) {
  const { phone, text, senderName, zapiMessageId, rawPayload } = args;
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

  // 3.5 Checa se pausa temporária expirou → reativa automaticamente
  if (conv.aiPausedUntil && conv.aiPausedUntil.getTime() <= Date.now()) {
    console.log(`[PIPELINE] pausa expirou para conv=${conv.id}, reativando IA`);
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { aiPaused: false, aiPausedUntil: null, status: "OPEN" },
    });
    conv.aiPaused = false;
    conv.aiPausedUntil = null;
    conv.status = "OPEN";
  }

  // 4. guards
  if (contact.isVip) { console.log("[PIPELINE] skip vip"); return { skipped: "vip" }; }
  if (cfg.pauseAll) { console.log("[PIPELINE] skip pauseAll"); return { skipped: "global_pause" }; }
  if (conv.aiPaused) {
    const remaining = conv.aiPausedUntil ? Math.round((conv.aiPausedUntil.getTime() - Date.now()) / 60000) : null;
    console.log(`[PIPELINE] skip aiPaused (volta em ${remaining ?? "permanente"} min)`);
    return { skipped: "conv_pause" };
  }
  if (conv.status === "HANDLED_BY_HUMAN") { console.log("[PIPELINE] skip human"); return { skipped: "human" }; }
  if (!cfg.autoReply) { console.log("[PIPELINE] skip autoReply=false"); return { skipped: "auto_reply_off" }; }
  if (!isWithinHours(cfg.workStartHour, cfg.workEndHour)) {
    console.log(`[PIPELINE] off_hours (cfg=${cfg.workStartHour}-${cfg.workEndHour} nowBR=${getHourInBR()} utc=${new Date().getHours()})`);

    // Auto-resposta fora do horário (cooldown só conta OUTRAS off_hours_replies)
    if (cfg.offHoursAutoReply && !!cfg.offHoursMessage) {
      // Busca só a última off_hours_reply anterior (não qualquer msg out)
      const lastOffHours = await prisma.message.findFirst({
        where: {
          conversationId: conv.id,
          direction: "OUT",
          meta: { path: ["offHoursReply"], equals: true },
        },
        orderBy: { createdAt: "desc" },
      });
      const lastOffHoursMinsAgo = lastOffHours
        ? (Date.now() - new Date(lastOffHours.createdAt).getTime()) / 60000
        : Infinity;

      if (lastOffHoursMinsAgo > 240) {
        try {
          await sleep(rand(3000, 8000));
          await setTyping(phone, 2000);
          const sent = await sendText(phone, cfg.offHoursMessage);
          await prisma.message.create({
            data: {
              conversationId: conv.id,
              direction: "OUT",
              sender: "AI",
              content: cfg.offHoursMessage,
              zapiMessageId: sent?.messageId ?? null,
              meta: { offHoursReply: true } as object,
            },
          });
          console.log(`[PIPELINE] off_hours auto-reply enviada ✓`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await logError("zapi:off_hours_reply", msg);
        }
      } else {
        console.log(`[PIPELINE] off_hours auto-reply skipped (última auto-reply há ${Math.round(lastOffHoursMinsAgo)}min)`);
      }
    }

    // Mesmo fora do horário, classifica o lead pra aparecer no Kanban
    try {
      const fullHistory = await prisma.message.findMany({
        where: { conversationId: conv.id },
        orderBy: { createdAt: "asc" },
      });
      const fullFormatted = fullHistory.map((m) => ({
        role: (m.direction === "IN" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      }));
      const extraction = await classifyLead(fullFormatted);
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
      console.log(`[PIPELINE] off_hours lead classificado: ${extraction.temperature}`);
    } catch (e) {
      await logError("off_hours:classify", e instanceof Error ? e.message : String(e));
    }

    return { skipped: "off_hours", autoReplyed: true };
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

  // 6. history — APENAS últimas 5 msgs (buffer conversacional).
  // O contexto real vem do DOSSIÊ do lead, atualizado em background pelo Haiku.
  // Isso elimina "mode collapse" (Claude imitando respostas ruins antigas).
  const hadHumanTakeover = !!conv.humanTakeoverAt;
  const historyRaw = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  historyRaw.reverse(); // volta pra ordem cronológica
  // Filtra auto-replies de off-hours do histórico — Marina não deve
  // interpretar suas próprias mensagens genéricas como contexto de conversa
  const history = historyRaw.filter((m) => {
    const meta = m.meta as { offHoursReply?: boolean } | null;
    return !meta?.offHoursReply;
  });
  // Anota quem escreveu cada msg pro Claude distinguir Jean de Marina
  const formatted = history.map((m) => {
    let content = m.content;
    if (m.direction === "OUT" && m.sender === "HUMAN") {
      content = `[JEAN (o dono) respondeu pessoalmente]: ${m.content}`;
    }
    return {
      role: (m.direction === "IN" ? "user" : "assistant") as "user" | "assistant",
      content,
    };
  });

  // Contexto extra pra Marina entender que o Jean já esteve na conversa
  const resumeAfterHumanContext = hadHumanTakeover
    ? `\n⚠️ ATENÇÃO: o JEAN (dono do negócio) respondeu pessoalmente nesta conversa em ${conv.humanTakeoverAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Suas mensagens estão marcadas com [JEAN respondeu pessoalmente]. ANALISE O QUE ELE DISSE e continue a partir dali. NÃO repita informações que o Jean já passou. NÃO contradiga o que ele combinou. Se ele marcou uma reunião, você NÃO remarca. Se ele combinou valor, você NÃO fala de outro. Seu papel agora é COMPLEMENTAR o que o Jean já fez.`
    : "";

  // 7. initial micro-delay
  await sleep(rand(2000, 5000));

  // 7.5 agenda + dossiê do lead (non-blocking failure)
  const [calendarContext, leadDossier] = await Promise.all([
    getAppointmentsContext(365),
    buildLeadDossier(conv.id),
  ]);

  // 8. generate reply (with retry + timeout já nos wrappers)
  // Pré-gera attendCode se for primeira interação (pra Marina poder enviar na saudação)
  let attendCode: string | null = null;
  if (isFirstInteraction) {
    const existing = await prisma.lead.findFirst({
      where: { conversationId: conv.id },
      select: { attendCode: true },
    });
    attendCode = existing?.attendCode || (await generateAttendCode(phone));
  } else {
    const existing = await prisma.lead.findFirst({
      where: { conversationId: conv.id },
      select: { attendCode: true },
    });
    attendCode = existing?.attendCode || null;
  }

  const hasInspiration = rawPayload ? messageHasInspirationHint(rawPayload) : false;

  console.log(`[PIPELINE] calling claude, tone=${detectedTone}, firstInteraction=${isFirstInteraction}, hasInspiration=${hasInspiration}`);
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
      humanTakeoverContext: resumeAfterHumanContext,
      leadDossier,
      attendCode,
      hasInspiration,
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

  // 10. classify + profile + dossier update (SÍNCRONO pra Kanban + próxima resposta)
  try {
    console.log(`[PIPELINE] classifying + updating dossier`);
    // Pega últimas 10 msgs pra resumo (mais barato que histórico inteiro)
    const recentMessages = await prisma.message.findMany({
      where: { conversationId: conv.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    recentMessages.reverse();
    const recentFormatted = recentMessages.map((m) => ({
      role: (m.direction === "IN" ? "user" : "assistant") as "user" | "assistant",
      content: m.content,
    }));

    const [extraction, updatedProfile, recentUpdate] = await Promise.all([
      classifyLead(recentFormatted),
      extractProfileLearnings(recentFormatted, profile),
      updateRecentInteractions(recentFormatted, profile),
    ]);

    console.log(`[PIPELINE] lead extracted: temp=${extraction.temperature} type=${extraction.eventType} date=${extraction.eventDate}`);

    const scoreInt = toInt(extraction.score) ?? 0;
    const guestCountInt = toInt(extraction.guestCount);
    const eventDateObj = extraction.eventDate ? new Date(extraction.eventDate) : null;
    const eventDateValid = eventDateObj && !isNaN(eventDateObj.getTime()) ? eventDateObj : null;

    // Reutiliza attendCode gerado na seção 8 (já consultado/criado)
    const upsertedLead = await prisma.lead.upsert({
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
        attendCode: attendCode || undefined,
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
        attendCode: attendCode || undefined,
      },
    });

    // Captura inspirações se a msg tiver imagem ou link
    if (rawPayload && upsertedLead) {
      try {
        await captureFromMessage(rawPayload, upsertedLead.id);
      } catch (e) {
        await logError("inspirations", e instanceof Error ? e.message : String(e));
      }
    }
    console.log(`[PIPELINE] lead upserted for conv=${conv.id}`);

    const profileUpdate: { name?: string; profile?: object } = {};
    if (extraction.contactName && !contact.name) profileUpdate.name = extraction.contactName;
    // Merge: profile longo (learnings) + recentUpdate (memória curta dinâmica)
    const mergedProfile: ContactProfile = {
      ...(profile || {}),
      ...(updatedProfile || {}),
      ...recentUpdate,
      detectedTone,
    };
    profileUpdate.profile = mergedProfile as object;
    await prisma.contact.update({ where: { id: contact.id }, data: profileUpdate });

    if (extraction.shouldEscalate) {
      // IA continua ativa. Só notifica o Jean que o cliente pode precisar de atenção direta.
      console.log(`[PIPELINE] shouldEscalate=true — avisando Jean sem pausar Marina`);
      await alertOwner(
        `Lead pedindo atenção especial: ${contact.name || phone}\n\nResumo: ${extraction.summary}\n\nA Marina continua respondendo, mas pode ser bom você assumir pelo celular.`
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[PIPELINE] classify FAILED:`, msg);
    await logError("claude:classify", msg);
  }

  return { ok: true, chunks: chunks.length };
}
