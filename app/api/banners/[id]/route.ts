import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json();
  const updated = await prisma.banner.update({
    where: { id },
    data: {
      title: body.title,
      order: body.order,
      active: body.active,
    },
    select: { id: true, title: true, order: true, active: true, mimeType: true },
  });
  return NextResponse.json({ banner: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  await prisma.banner.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
