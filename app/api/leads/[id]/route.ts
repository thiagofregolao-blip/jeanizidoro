import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
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
  const data: Prisma.LeadUpdateInput = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.temperature !== undefined) data.temperature = body.temperature;
  if (body.eventType !== undefined) data.eventType = body.eventType;
  if (body.eventDate !== undefined) data.eventDate = body.eventDate ? new Date(body.eventDate) : undefined;
  if (body.guestCount !== undefined) data.guestCount = body.guestCount;
  if (body.location !== undefined) data.location = body.location;
  if (body.budget !== undefined) data.budget = body.budget;
  if (body.style !== undefined) data.style = body.style;
  if (body.attendDraft !== undefined) data.attendDraft = body.attendDraft ?? undefined;

  const lead = await prisma.lead.update({ where: { id }, data });
  return NextResponse.json({ lead });
}
