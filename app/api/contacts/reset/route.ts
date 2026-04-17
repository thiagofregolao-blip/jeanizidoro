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
  const { phone } = await req.json();
  if (!phone) return NextResponse.json({ error: "phone required" }, { status: 400 });

  const contact = await prisma.contact.findUnique({ where: { phone } });
  if (!contact) return NextResponse.json({ ok: true, skipped: "not_found" });

  // cascata delete via onDelete: Cascade nas conversas e messages
  await prisma.contact.delete({ where: { id: contact.id } });
  return NextResponse.json({ ok: true, deleted: contact.phone });
}
