import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [errors, breaker, stats] = await Promise.all([
    prisma.errorLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.circuitBreakerState.findUnique({ where: { id: "singleton" } }),
    prisma.errorLog.groupBy({
      by: ["source"],
      _count: true,
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) },
      },
    }),
  ]);

  return NextResponse.json({ errors, breaker, stats });
}
