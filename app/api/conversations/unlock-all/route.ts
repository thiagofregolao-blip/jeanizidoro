import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

// Destrava todas as conversas que estão com status HANDLED_BY_HUMAN ou aiPaused
// Útil pra limpar conversas travadas indevidamente
export async function POST() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await prisma.conversation.updateMany({
    where: {
      OR: [{ aiPaused: true }, { status: "HANDLED_BY_HUMAN" }],
    },
    data: {
      aiPaused: false,
      aiPausedUntil: null,
      status: "OPEN",
    },
  });
  return NextResponse.json({ ok: true, unlocked: result.count });
}
