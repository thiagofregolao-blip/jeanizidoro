import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      contact: true,
      conversation: { include: { messages: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const lead = await prisma.lead.update({
    where: { id },
    data: {
      status: body.status,
      temperature: body.temperature,
      eventType: body.eventType,
      eventDate: body.eventDate ? new Date(body.eventDate) : undefined,
      guestCount: body.guestCount,
      location: body.location,
      budget: body.budget,
      style: body.style,
    },
  });
  return NextResponse.json({ lead });
}
