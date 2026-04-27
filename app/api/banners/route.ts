import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

// Seed automático na primeira chamada
async function seedIfEmpty() {
  const count = await prisma.banner.count();
  if (count > 0) return;

  const initialDir = path.join(process.cwd(), "public", "banner", "initial");
  try {
    const files = await fs.readdir(initialDir);
    const ordered = files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    for (let i = 0; i < ordered.length && i < 3; i++) {
      const filePath = path.join(initialDir, ordered[i]);
      const buf = await fs.readFile(filePath);
      const mimeType = ordered[i].toLowerCase().endsWith(".png")
        ? "image/png"
        : ordered[i].toLowerCase().endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
      await prisma.banner.create({
        data: {
          mimeType,
          data: buf,
          order: i,
          active: true,
          title: ordered[i].replace(/\.[^.]+$/, ""),
        },
      });
    }
    console.log(`[banners] seed inicial: ${ordered.length} banners criados`);
  } catch (e) {
    console.warn("[banners] seed skip:", e instanceof Error ? e.message : e);
  }
}

// GET público: lista banners ativos sem o blob (só id pra carregar imagem via outra rota)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1";

  // Se for admin pedindo "all", precisa estar logado
  if (all) {
    try {
      await requireSession();
    } catch {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  await seedIfEmpty();

  const banners = await prisma.banner.findMany({
    where: all ? undefined : { active: true },
    orderBy: { order: "asc" },
    select: {
      id: true,
      title: true,
      mimeType: true,
      order: true,
      active: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ banners });
}

// POST: upload de novo banner (multipart/form-data)
export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const title = (form.get("title") as string | null) || null;

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "arquivo obrigatório" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "imagem maior que 5MB" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "arquivo não é imagem" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const last = await prisma.banner.findFirst({ orderBy: { order: "desc" } });
  const nextOrder = (last?.order ?? -1) + 1;

  const banner = await prisma.banner.create({
    data: {
      title,
      mimeType: file.type,
      data: buffer,
      order: nextOrder,
      active: true,
    },
    select: { id: true, title: true, order: true, active: true, mimeType: true },
  });

  return NextResponse.json({ banner });
}
