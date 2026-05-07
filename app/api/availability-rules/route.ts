import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { ensureDefaultAvailabilityRules } from "@/lib/appointments";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureDefaultAvailabilityRules();
  const rules = await prisma.availabilityRule.findMany({
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  if (
    typeof body.weekday !== "number" ||
    body.weekday < 0 ||
    body.weekday > 6 ||
    !body.startTime ||
    !body.endTime
  ) {
    return NextResponse.json({ error: "weekday (0-6), startTime, endTime obrigatórios" }, { status: 400 });
  }
  const rule = await prisma.availabilityRule.create({
    data: {
      weekday: body.weekday,
      startTime: body.startTime,
      endTime: body.endTime,
      label: body.label || "Reuniões com clientes",
      active: body.active !== false,
    },
  });
  return NextResponse.json({ rule });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (typeof body.weekday === "number") data.weekday = body.weekday;
  if (body.startTime !== undefined) data.startTime = body.startTime;
  if (body.endTime !== undefined) data.endTime = body.endTime;
  if (body.label !== undefined) data.label = body.label;
  if (body.active !== undefined) data.active = !!body.active;
  const rule = await prisma.availabilityRule.update({ where: { id: body.id }, data });
  return NextResponse.json({ rule });
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
  await prisma.availabilityRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
