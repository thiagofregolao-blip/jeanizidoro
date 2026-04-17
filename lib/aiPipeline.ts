import { prisma } from "./prisma";
import { sendText, setTyping } from "./zapi";
import { classifyLead, generateReply, detectTone, extractProfileLearnings, type ContactProfile } from "./claude";

const DEFAULT_PERSONA = `Você é Sofia, recepcionista virtual de Jean Izidoro. Tom acolhedor, elegante, atenta e calorosa. Sempre prioriza entender o cliente antes de oferecer algo. Nunca soa robótica — fala como uma profissional atenciosa conversaria.`;
const DEFAULT_CONTEXT = `Jean Izidoro é arquiteto e cenógrafo de eventos de alto padrão em São Paulo. Atua há mais de 10 anos com casamentos, eventos corporativos, cenografia autoral e debutantes. Atendimentos comerciais são feitos pessoalmente no escritório do Jean — a Sofia qualifica leads e agenda reuniões.`;

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

function isWithinHours(start: number, end: number) {
  const h = new Date().getHours();
  return h >= start && h < end;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function rand(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min));
}

export async function processInboundMessage(args: {
  phone: string;
  text: string;
  senderName?: string;
  zapiMessageId?: string;
}) {
  const { phone, text, senderName, zapiMessageId } = args;

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
  if (contact.isVip) return { skipped: "vip" };
  if (cfg.pauseAll) return { skipped: "global_pause" };
  if (conv.aiPaused) return { skipped: "conv_pause" };
  if (conv.status === "HANDLED_BY_HUMAN") return { skipped: "human" };
  if (!cfg.autoReply) return { skipped: "auto_reply_off" };
  if (!isWithinHours(cfg.workStartHour, cfg.workEndHour)) return { skipped: "off_hours" };

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

  // persist tone on contact (most recent wins slightly)
  if (contact.tone !== detectedTone) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { tone: detectedTone },
    });
  }

  // 6. history (últimas 30 msgs)
  const history = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "asc" },
    take: 30,
  });
  const formatted = history.map((m) => ({
    role: (m.direction === "IN" ? "user" : "assistant") as "user" | "assistant",
    content: m.content,
  }));

  // 7. initial micro-delay (2-5s) — tempo pra "ver" a mensagem
  await sleep(rand(2000, 5000));

  // 8. generate reply (pode retornar 1-3 msgs)
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
    });
  } catch (e) {
    console.error("Claude reply error", e);
    return { error: "claude_reply_failed" };
  }

  if (chunks.length === 0) return { error: "empty_reply" };

  // 9. enviar cada chunk com delay humanizado entre eles
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    // typing por ~2-4s (proporcional ao tamanho da msg, simulando digitação)
    const typingMs = Math.min(Math.max(chunk.length * 40, 1500), 5000);
    await setTyping(phone, typingMs);

    try {
      const sent = await sendText(phone, chunk);
      await prisma.message.create({
        data: {
          conversationId: conv.id,
          direction: "OUT",
          sender: "AI",
          content: chunk,
          zapiMessageId: sent?.messageId ?? null,
        },
      });
    } catch (e) {
      console.error("Z-API send error", e);
      return { error: "zapi_send_failed" };
    }

    // delay entre mensagens (se houver próxima)
    if (i < chunks.length - 1) {
      await sleep(rand(2500, 4500));
    }
  }

  // 10. classify + update profile em paralelo (fire-and-forget)
  (async () => {
    try {
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

      const profileUpdate: {
        name?: string;
        profile?: object;
      } = {};
      if (extraction.contactName && !contact.name) {
        profileUpdate.name = extraction.contactName;
      }
      if (updatedProfile) {
        profileUpdate.profile = { ...updatedProfile, detectedTone } as object;
      }
      if (Object.keys(profileUpdate).length > 0) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: profileUpdate,
        });
      }

      if (extraction.shouldEscalate) {
        await prisma.conversation.update({
          where: { id: conv.id },
          data: { status: "HANDLED_BY_HUMAN" },
        });
      }
    } catch (e) {
      console.error("Classify/profile error", e);
    }
  })();

  return { ok: true, chunks: chunks.length };
}
