import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

// Aceita Eventos (allowsMore = true) — Marina pode oferecer essa data
const ALLOWS_MORE: Record<number, number[]> = {
  5: [2],
  6: [6, 20],
  7: [4, 11, 25],
  8: [],
  9: [4, 5, 7],
  10: [17, 24, 31],
  11: [7, 14, 21, 27, 28],
  12: [10, 11, 12, 26],
};

// Agenda Cheia (allowsMore = false) — Marina NÃO sugere
const FULL_NO_MORE: Record<number, number[]> = {
  5: [],
  6: [12, 13, 21, 24, 25, 26, 27, 28, 29, 30],
  7: [1, 13, 31],
  8: [1, 2, 3, 4, 5, 6],
  9: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 27, 28, 29, 30],
  10: [18, 19, 20, 21, 22, 25, 26, 27, 28, 29],
  11: [8, 9, 10, 11, 12, 22, 23, 24, 25, 26, 29, 30],
  12: [1, 2, 3, 4, 22, 29],
};

const YEAR = 2026;

function makeDate(year: number, month: number, day: number): Date {
  // month vem 1-12 aqui
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`);
}

export async function POST() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const data: { date: Date; slot: "FULL_DAY"; allowsMore: boolean; title: string }[] = [];

  for (const monthStr of Object.keys(ALLOWS_MORE)) {
    const month = Number(monthStr);
    for (const day of ALLOWS_MORE[month]) {
      data.push({
        date: makeDate(YEAR, month, day),
        slot: "FULL_DAY",
        allowsMore: true,
        title: "Evento",
      });
    }
  }

  for (const monthStr of Object.keys(FULL_NO_MORE)) {
    const month = Number(monthStr);
    for (const day of FULL_NO_MORE[month]) {
      data.push({
        date: makeDate(YEAR, month, day),
        slot: "FULL_DAY",
        allowsMore: false,
        title: "Evento",
      });
    }
  }

  // Apaga eventos pré-existentes em 2026 com title="Evento" pra não duplicar
  await prisma.appointment.deleteMany({
    where: {
      title: "Evento",
      date: {
        gte: new Date(`${YEAR}-01-01T00:00:00`),
        lt: new Date(`${YEAR + 1}-01-01T00:00:00`),
      },
    },
  });

  const result = await prisma.appointment.createMany({ data });
  return NextResponse.json({ ok: true, created: result.count });
}
