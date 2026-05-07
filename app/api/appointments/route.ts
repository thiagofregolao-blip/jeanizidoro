import { NextRequest, NextResponse } from "next/server";
import type { Prisma, SlotType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");

  const where: Prisma.AppointmentWhereInput = {};
  if (fromStr || toStr) {
    where.date = {};
    if (fromStr) (where.date as Prisma.DateTimeFilter).gte = new Date(fromStr + "T00:00:00");
    if (toStr) (where.date as Prisma.DateTimeFilter).lte = new Date(toStr + "T23:59:59");
  }

  const items = await prisma.appointment.findMany({
    where,
    orderBy: { date: "asc" },
    include: { contact: { select: { id: true, name: true, phone: true } } },
  });
  return NextResponse.json({ appointments: items });
}

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();

  // Bulk create — array de dates com mesmo slot/config
  if (Array.isArray(body.dates) && body.dates.length > 0) {
    const data = body.dates.map((d: string) => ({
      date: new Date(d + "T00:00:00"),
      slot: (body.slot as SlotType) || "FULL_DAY",
      allowsMore: !!body.allowsMore,
      title: body.title || "Evento",
      notes: body.notes || null,
      contactId: body.contactId || null,
      leadId: body.leadId || null,
      startTime: body.startTime || null,
      endTime: body.endTime || null,
    }));
    const result = await prisma.appointment.createMany({ data, skipDuplicates: false });
    return NextResponse.json({ ok: true, created: result.count });
  }

  // Create single
  if (!body.date || !body.slot) {
    return NextResponse.json({ error: "date e slot obrigatórios" }, { status: 400 });
  }
  const item = await prisma.appointment.create({
    data: {
      date: new Date(body.date + "T00:00:00"),
      slot: body.slot as SlotType,
      allowsMore: !!body.allowsMore,
      title: body.title || "Evento",
      notes: body.notes || null,
      contactId: body.contactId || null,
      leadId: body.leadId || null,
      startTime: body.startTime || null,
      endTime: body.endTime || null,
      kind: body.kind === "MEETING" ? "MEETING" : "EVENT",
    },
  });

  // Alerta imediato pro Jean ao criar evento via painel
  try {
    const { alertOwner } = await import("@/lib/reliability");
    const dateLabel = item.date.toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo",
    });
    const timeLabel = item.startTime ? ` às ${item.startTime}` : "";
    await alertOwner(`📅 Novo na agenda: "${item.title}" em ${dateLabel}${timeLabel}.`);
  } catch (e) {
    console.error("alertOwner failed", e);
  }

  return NextResponse.json({ appointment: item });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const data: Prisma.AppointmentUpdateInput = {};
  if (body.date !== undefined) data.date = new Date(body.date + "T00:00:00");
  if (body.slot !== undefined) data.slot = body.slot as SlotType;
  if (body.allowsMore !== undefined) data.allowsMore = !!body.allowsMore;
  if (body.title !== undefined) data.title = body.title;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.startTime !== undefined) data.startTime = body.startTime;
  if (body.endTime !== undefined) data.endTime = body.endTime;
  if (body.kind !== undefined) data.kind = body.kind === "MEETING" ? "MEETING" : "EVENT";

  const item = await prisma.appointment.update({ where: { id: body.id }, data });
  return NextResponse.json({ appointment: item });
}

export async function DELETE(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  await prisma.appointment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
