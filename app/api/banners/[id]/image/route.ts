import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Endpoint público que serve a imagem binária
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const banner = await prisma.banner.findUnique({
    where: { id },
    select: { data: true, mimeType: true, updatedAt: true },
  });
  if (!banner) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(banner.data), {
    status: 200,
    headers: {
      "Content-Type": banner.mimeType,
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Last-Modified": banner.updatedAt.toUTCString(),
    },
  });
}
