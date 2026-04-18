import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

// POST /api/contacts/reset { phone: "595986848326" }
// Apaga contato + conversas + mensagens + leads (pra testar "primeira interação")
export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const phone = body.phone as string | undefined;
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const contact = await prisma.contact.findUnique({ where: { phone } });
  if (!contact) return NextResponse.json({ ok: true, skipped: "not_found" });

  // Modo "unlock": só reativa IA sem apagar histórico
  if (body.mode === "unlock") {
    await prisma.conversation.updateMany({
      where: { contactId: contact.id },
      data: { aiPaused: false, aiPausedUntil: null, status: "OPEN" },
    });
    return NextResponse.json({ ok: true, unlocked: contact.phone });
  }

  // Modo default: apaga tudo (cascata delete)
  await prisma.contact.delete({ where: { id: contact.id } });
  return NextResponse.json({ ok: true, deleted: contact.phone });
}
