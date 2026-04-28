import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const last30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const last90 = new Date(now.getTime() - 90 * 24 * 3600 * 1000);

  // 1. Leads parados (HOT/WARM/IN_SERVICE com lastMsgAt > 1 dia)
  const stalledRaw = await prisma.lead.findMany({
    where: {
      AND: [
        {
          OR: [{ temperature: { in: ["HOT", "WARM"] } }, { status: "IN_SERVICE" }],
        },
        { conversation: { lastMsgAt: { lt: oneDayAgo } } },
        { status: { notIn: ["WON", "LOST"] } },
      ],
    },
    include: {
      contact: { select: { name: true, phone: true } },
      conversation: { select: { lastMsgAt: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });

  const stalled = stalledRaw.map((l) => ({
    id: l.id,
    name: l.contact.name,
    phone: l.contact.phone,
    eventType: l.eventType,
    temperature: l.temperature,
    status: l.status,
    daysSince: Math.floor(
      (now.getTime() - new Date(l.conversation.lastMsgAt).getTime()) / (24 * 3600 * 1000)
    ),
  }));

  // 2. Funil — qty por status
  const funnelRaw = await prisma.lead.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const funnel = Object.fromEntries(
    funnelRaw.map((f) => [f.status, f._count._all])
  );

  // 3. Conversão últimos 30/90 dias
  const [total30, won30, total90, won90, totalAll, wonAll] = await Promise.all([
    prisma.lead.count({ where: { createdAt: { gte: last30 } } }),
    prisma.lead.count({ where: { createdAt: { gte: last30 }, status: "WON" } }),
    prisma.lead.count({ where: { createdAt: { gte: last90 } } }),
    prisma.lead.count({ where: { createdAt: { gte: last90 }, status: "WON" } }),
    prisma.lead.count(),
    prisma.lead.count({ where: { status: "WON" } }),
  ]);

  // 4. Tempo médio de atendimento (created → updated dos WON+LOST)
  const closed = await prisma.lead.findMany({
    where: { status: { in: ["WON", "LOST"] } },
    select: { createdAt: true, updatedAt: true },
    take: 200,
    orderBy: { updatedAt: "desc" },
  });
  const avgMs =
    closed.length > 0
      ? closed.reduce(
          (sum, l) =>
            sum + (new Date(l.updatedAt).getTime() - new Date(l.createdAt).getTime()),
          0
        ) / closed.length
      : 0;
  const avgDays = avgMs / (24 * 3600 * 1000);

  return NextResponse.json({
    stalled,
    funnel,
    conversion: {
      last30: { total: total30, won: won30, rate: total30 > 0 ? won30 / total30 : 0 },
      last90: { total: total90, won: won90, rate: total90 > 0 ? won90 / total90 : 0 },
      allTime: { total: totalAll, won: wonAll, rate: totalAll > 0 ? wonAll / totalAll : 0 },
    },
    avgServiceDays: Number(avgDays.toFixed(1)),
    closedSampleSize: closed.length,
  });
}
