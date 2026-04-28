import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractTextFromZapi, type ZapiInbound } from "@/lib/zapi";
import { processInboundMessage } from "@/lib/aiPipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let payload: ZapiInbound;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // log raw webhook
  const log = await prisma.webhookLog.create({
    data: { source: "zapi", payload: payload as object },
  });

  try {
    // fromMe = ou a Marina mandando (echo do Z-API) ou o Jean respondendo direto pelo celular
    if (payload.fromMe) {
      if (payload.phone && !payload.isGroup) {
        const text = extractTextFromZapi(payload);
        const contact = await prisma.contact.findUnique({ where: { phone: payload.phone } });
        if (contact && text) {
          // Dedup: se já temos essa msg salva (Marina enviou), é echo do Z-API → ignora
          if (payload.messageId) {
            const existing = await prisma.message.findUnique({
              where: { zapiMessageId: payload.messageId },
            });
            if (existing) {
              await prisma.webhookLog.update({
                where: { id: log.id },
                data: { processed: true, error: "fromMe_echo_ai" },
              });
              return NextResponse.json({ ok: true, skipped: "fromMe_echo_ai" });
            }
          }

          // Não é echo → é o Jean respondendo direto pelo celular
          const conv = await prisma.conversation.findFirst({
            where: { contactId: contact.id, status: { not: "CLOSED" } },
            orderBy: { createdAt: "desc" },
          });
          if (conv) {
            // Antes de gravar a msg do Jean, avisa o cliente se Marina foi a última a falar
            const { maybeSendTakeoverNotice } = await import("@/lib/takeover");
            await maybeSendTakeoverNotice(conv.id);

            await prisma.message.create({
              data: {
                conversationId: conv.id,
                direction: "OUT",
                sender: "HUMAN",
                content: text,
                zapiMessageId: payload.messageId ?? null,
              },
            });
            const now = new Date();
            const pausedUntil = new Date(now.getTime() + 4 * 3600 * 1000); // 4 horas
            await prisma.conversation.update({
              where: { id: conv.id },
              data: {
                lastMsgAt: now,
                status: "HANDLED_BY_HUMAN",
                aiPaused: true,
                aiPausedUntil: pausedUntil,
                humanTakeoverAt: now,
              },
            });
            console.log(`[WEBHOOK] Jean assumiu conv=${conv.id}, IA pausada até ${pausedUntil.toISOString()}`);
          }
        }
      }
      await prisma.webhookLog.update({
        where: { id: log.id },
        data: { processed: true, error: "fromMe_human_takeover" },
      });
      return NextResponse.json({ ok: true, skipped: "fromMe_human_takeover" });
    }
    if (payload.isGroup) {
      await prisma.webhookLog.update({ where: { id: log.id }, data: { processed: true, error: "group" } });
      return NextResponse.json({ ok: true, skipped: "group" });
    }
    if (!payload.phone) {
      await prisma.webhookLog.update({ where: { id: log.id }, data: { processed: true, error: "no_phone" } });
      return NextResponse.json({ ok: true, skipped: "no_phone" });
    }

    let text = extractTextFromZapi(payload);

    // Áudio: baixa + transcreve via Groq Whisper
    if (payload.audio?.audioUrl) {
      console.log(`[WEBHOOK] áudio recebido, transcrevendo...`);
      const { transcribeAudio } = await import("@/lib/transcribe");
      const transcription = await transcribeAudio(payload.audio.audioUrl);
      if (transcription && transcription.length > 0) {
        text = `🎙️ ${transcription}`;
        console.log(`[WEBHOOK] transcrição: "${transcription.slice(0, 100)}"`);
      } else {
        text = "[áudio — não foi possível transcrever]";
      }
    }

    if (!text) {
      await prisma.webhookLog.update({ where: { id: log.id }, data: { processed: true, error: "no_text" } });
      return NextResponse.json({ ok: true, skipped: "no_text" });
    }

    // process async-style (don't block webhook). Z-API expects 200 fast.
    processInboundMessage({
      phone: payload.phone,
      text,
      senderName: payload.senderName,
      zapiMessageId: payload.messageId,
      rawPayload: payload,
    })
      .then(async () => {
        await prisma.webhookLog.update({ where: { id: log.id }, data: { processed: true } });
      })
      .catch(async (e) => {
        console.error("pipeline error", e);
        await prisma.webhookLog.update({
          where: { id: log.id },
          data: { processed: true, error: String(e?.message || e) },
        });
      });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.webhookLog.update({ where: { id: log.id }, data: { error: msg } });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST only" });
}
