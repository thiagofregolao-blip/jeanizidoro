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
    // ignore outgoing (sent by us) and group messages
    if (payload.fromMe) {
      await prisma.webhookLog.update({ where: { id: log.id }, data: { processed: true, error: "fromMe" } });
      return NextResponse.json({ ok: true, skipped: "fromMe" });
    }
    if (payload.isGroup) {
      await prisma.webhookLog.update({ where: { id: log.id }, data: { processed: true, error: "group" } });
      return NextResponse.json({ ok: true, skipped: "group" });
    }
    if (!payload.phone) {
      await prisma.webhookLog.update({ where: { id: log.id }, data: { processed: true, error: "no_phone" } });
      return NextResponse.json({ ok: true, skipped: "no_phone" });
    }

    const text = extractTextFromZapi(payload);
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
