import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

// Apaga mensagens de uma conversa sem apagar o lead/contato.
// Útil quando a conversa ficou "poluída" com respostas ruins da Sofia e
// a gente quer começar fresco (o dossier permanece com a memória estruturada).
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const result = await prisma.message.deleteMany({ where: { conversationId: id } });
  await prisma.conversation.update({
    where: { id },
    data: {
      aiPaused: false,
      aiPausedUntil: null,
      status: "OPEN",
    },
  });
  return NextResponse.json({ ok: true, deletedMessages: result.count });
}
