import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * RESETA o atendimento de um Lead:
 * - Apaga o Lead (cascata: inspirações)
 * - Apaga a Conversation (cascata: messages)
 * - Reseta profile e tone do Contact
 *
 * Próxima mensagem do contato vai criar tudo do zero (firstInteraction=true,
 * novo attendCode, sem histórico, sem dossiê).
 *
 * Mantém o Contact pra preservar nome/telefone.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    select: { id: true, contactId: true, conversationId: true },
  });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 1. Apaga Lead (cascateia inspirations)
  await prisma.lead.delete({ where: { id: lead.id } });

  // 2. Apaga Conversation (cascateia messages)
  await prisma.conversation.delete({ where: { id: lead.conversationId } });

  // 3. Reseta perfil e tone do contato
  await prisma.contact.update({
    where: { id: lead.contactId },
    data: { profile: undefined, tone: null },
  });
  // profile undefined no Prisma não limpa — precisamos setar JSON null explicitamente:
  await prisma.$executeRaw`UPDATE "Contact" SET "profile" = NULL WHERE "id" = ${lead.contactId}`;

  return NextResponse.json({ ok: true });
}
