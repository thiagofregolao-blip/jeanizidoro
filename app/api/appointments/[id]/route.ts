import { NextRequest, NextResponse } from "next/server";
import type { Prisma, SlotType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const data: Prisma.AppointmentUpdateInput = {};
  if (body.date !== undefined) data.date = new Date(body.date + "T00:00:00");
  if (body.slot !== undefined) data.slot = body.slot as SlotType;
  if (body.allowsMore !== undefined) data.allowsMore = !!body.allowsMore;
  if (body.title !== undefined) data.title = body.title;
  if (body.notes !== undefined) data.notes = body.notes;
  const item = await prisma.appointment.update({ where: { id }, data });
  return NextResponse.json({ appointment: item });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await prisma.appointment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
