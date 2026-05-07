import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * RESETA por contactId — funciona pra qualquer contato, com ou sem Lead.
 * - Apaga todos os Leads do contato (cascateia inspirações)
 * - Apaga todas as Conversations do contato (cascateia messages)
 * - Reseta profile, tone, category do Contact
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 1. Apaga todos os Leads (cascateia inspirations)
  await prisma.lead.deleteMany({ where: { contactId: id } });

  // 2. Apaga todas as Conversations (cascateia messages)
  await prisma.conversation.deleteMany({ where: { contactId: id } });

  // 3. Reseta perfil, tone e categoria do Contact
  await prisma.contact.update({
    where: { id },
    data: {
      tone: null,
      category: "UNKNOWN",
      categoryConfidence: null,
      categoryReason: null,
      categoryLockedByJean: false,
      categoryUpdatedAt: null,
    },
  });
  await prisma.$executeRaw`UPDATE "Contact" SET "profile" = NULL WHERE "id" = ${id}`;

  return NextResponse.json({ ok: true });
}
