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
    },
  });
  return NextResponse.json({ appointment: item });
}
