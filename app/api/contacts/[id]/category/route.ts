import { NextRequest, NextResponse } from "next/server";
import type { ContactCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

const VALID: ContactCategory[] = ["UNKNOWN", "CLIENT", "SUPPLIER", "TEAM", "FAMILY", "PARTNER", "WORKS", "OTHER"];

/**
 * Reclassifica manualmente um contato.
 * Quando Jean move via drag-drop, marca categoryLockedByJean=true pra Marina
 * NUNCA sobrescrever a decisão dele em classificações futuras.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = await req.json();
  const cat = body.category as ContactCategory;
  if (!VALID.includes(cat)) {
    return NextResponse.json({ error: "categoria inválida" }, { status: 400 });
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      category: cat,
      categoryLockedByJean: true,
      categoryConfidence: "high",
      categoryReason: "Reclassificado manualmente pelo Jean",
      categoryUpdatedAt: new Date(),
    },
  });
  return NextResponse.json({ contact });
}
