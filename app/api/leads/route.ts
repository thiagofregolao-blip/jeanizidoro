import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const leads = await prisma.lead.findMany({
    include: {
      contact: true,
      conversation: { select: { id: true, lastMsgAt: true, status: true } },
      inspirations: { orderBy: { createdAt: "desc" }, take: 12 },
    },
    orderBy: [{ temperature: "asc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({ leads });
}
