import { prisma } from "./prisma";
import { sendText, setTyping } from "./zapi";
import { classifyLead, generateReply } from "./claude";

const DEFAULT_PERSONA = `Você é Sofia, recepcionista virtual de Jean Izidoro. Tom acolhedor, elegante e direto. Sempre se apresenta na primeira mensagem.`;
const DEFAULT_CONTEXT = `Jean Izidoro é arquiteto e cenógrafo de eventos de alto padrão em São Paulo. Atua há mais de 10 anos com casamentos, eventos corporativos e cenografia autoral. Atendimentos comerciais são feitos pessoalmente no escritório do Jean.`;

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
        escalateKeywords: ["falar com jean", "humano", "atendente", "reclamação"],
      },
    });
  }
  return cfg;
}

function isWithinHours(start: number, end: number) {
  const h = new Date().getHours();
  return h >= start && h < end;
}

export async function processInboundMessage(args: {
  phone: string;
  text: string;
  senderName?: string;
  zapiMessageId?: string;
}) {
  const { phone, text, senderName, zapiMessageId } = args;

  // 1. upsert contact
  const contact = await prisma.contact.upsert({
    where: { phone },
    update: { name: senderName ?? undefined },
    create: { phone, name: senderName ?? null },
  });

  // 2. open conversation
  let conv = await prisma.conversation.findFirst({
    where: { contactId: contact.id, status: { not: "CLOSED" } },
    orderBy: { createdAt: "desc" },
  });
  if (!conv) {
    conv = await prisma.conversation.create({ data: { contactId: contact.id } });
  }

  // 3. save inbound message
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

  // 4. guards: VIP, paused, human handling, off hours
  if (contact.isVip) return { skipped: "vip" };
  if (cfg.pauseAll) return { skipped: "global_pause" };
  if (conv.aiPaused) return { skipped: "conv_pause" };
  if (conv.status === "HANDLED_BY_HUMAN") return { skipped: "human" };
  if (!cfg.autoReply) return { skipped: "auto_reply_off" };
  if (!isWithinHours(cfg.workStartHour, cfg.workEndHour)) return { skipped: "off_hours" };

  // escalation keywords
  const lower = text.toLowerCase();
  const keywords = (cfg.escalateKeywords as string[]) || [];
  if (keywords.some((k: string) => lower.includes(k.toLowerCase()))) {
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { status: "HANDLED_BY_HUMAN", aiPaused: true },
    });
    return { skipped: "escalated" };
  }

  // 5. fetch history
  const history = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  const formatted = history.map((m) => ({
    role: (m.direction === "IN" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  // 6. generate reply (Sonnet)
  let reply = "";
  try {
    reply = await generateReply(cfg.personaPrompt, cfg.businessContext, formatted);
  } catch (e) {
    console.error("Claude reply error", e);
    return { error: "claude_reply_failed" };
  }

  // 7. humanized delay + send
  const delayMs = 12000 + Math.random() * 18000; // 12-30s
  await new Promise((r) => setTimeout(r, Math.min(delayMs, 25000)));
  await setTyping(phone, 1500);

  try {
    const sent = await sendText(phone, reply);
    await prisma.message.create({
      data: {
        conversationId: conv.id,
        direction: "OUT",
        sender: "AI",
        content: reply,
        zapiMessageId: sent?.messageId ?? null,
      },
    });
  } catch (e) {
    console.error("Z-API send error", e);
    return { error: "zapi_send_failed" };
  }

  // 8. classify lead (Haiku) — async-ish, but let's await for MVP simplicity
  try {
    const extraction = await classifyLead(formatted);
    await prisma.lead.upsert({
      where: { conversationId: conv.id },
      create: {
        contactId: contact.id,
        conversationId: conv.id,
        temperature: extraction.temperature,
        score: extraction.score,
        eventType: extraction.eventType,
        eventDate: extraction.eventDate ? new Date(extraction.eventDate) : null,
        guestCount: extraction.guestCount,
        location: extraction.location,
        budget: extraction.budget,
        style: extraction.style,
        summary: extraction.summary,
        rawData: extraction as object,
      },
      update: {
        temperature: extraction.temperature,
        score: extraction.score,
        eventType: extraction.eventType ?? undefined,
        eventDate: extraction.eventDate ? new Date(extraction.eventDate) : undefined,
        guestCount: extraction.guestCount ?? undefined,
        location: extraction.location ?? undefined,
        budget: extraction.budget ?? undefined,
        style: extraction.style ?? undefined,
        summary: extraction.summary,
        rawData: extraction as object,
      },
    });
    if (extraction.contactName && !contact.name) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { name: extraction.contactName },
      });
    }
    if (extraction.shouldEscalate) {
      await prisma.conversation.update({
        where: { id: conv.id },
        data: { status: "HANDLED_BY_HUMAN" },
      });
    }
  } catch (e) {
    console.error("Classify error", e);
  }

  return { ok: true };
}
