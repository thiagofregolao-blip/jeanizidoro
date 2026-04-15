import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { sendText } from "@/lib/zapi";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const conv = await prisma.conversation.findUnique({
    where: { id },
    include: {
      contact: true,
      messages: { orderBy: { createdAt: "asc" } },
      lead: true,
    },
  });
  if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ conversation: conv });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "empty" }, { status: 400 });

  const conv = await prisma.conversation.findUnique({ where: { id }, include: { contact: true } });
  if (!conv) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const sent = await sendText(conv.contact.phone, text);
  const msg = await prisma.message.create({
    data: {
      conversationId: id,
      direction: "OUT",
      sender: "HUMAN",
      content: text,
      zapiMessageId: sent?.messageId ?? null,
    },
  });
  await prisma.conversation.update({
    where: { id },
    data: { lastMsgAt: new Date(), status: "HANDLED_BY_HUMAN", aiPaused: true },
  });
  return NextResponse.json({ message: msg });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const conv = await prisma.conversation.update({
    where: { id },
    data: {
      status: body.status,
      aiPaused: body.aiPaused,
    },
  });
  return NextResponse.json({ conversation: conv });
}
