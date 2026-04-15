import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q");
  const vip = url.searchParams.get("vip");
  const contacts = await prisma.contact.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
      ...(vip === "1" ? { isVip: true } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ contacts });
}

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const contact = await prisma.contact.create({
    data: {
      phone: body.phone,
      name: body.name,
      email: body.email,
      isVip: body.isVip ?? false,
      notes: body.notes,
    },
  });
  return NextResponse.json({ contact });
}
