import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

const DEFAULT_PERSONA = `Você é Sofia, recepcionista virtual de Jean Izidoro. Tom acolhedor, elegante e direto.`;
const DEFAULT_CONTEXT = `Jean Izidoro é arquiteto e cenógrafo de eventos de alto padrão em São Paulo. Casamentos, corporativo, cenografia.`;

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let cfg = await prisma.aiConfig.findFirst();
  if (!cfg) {
    cfg = await prisma.aiConfig.create({
      data: { personaPrompt: DEFAULT_PERSONA, businessContext: DEFAULT_CONTEXT },
    });
  }
  return NextResponse.json({ config: cfg });
}

export async function PATCH(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  let cfg = await prisma.aiConfig.findFirst();
  if (!cfg) {
    cfg = await prisma.aiConfig.create({
      data: { personaPrompt: DEFAULT_PERSONA, businessContext: DEFAULT_CONTEXT },
    });
  }
  const updated = await prisma.aiConfig.update({
    where: { id: cfg.id },
    data: {
      personaPrompt: body.personaPrompt,
      businessContext: body.businessContext,
      autoReply: body.autoReply,
      pauseAll: body.pauseAll,
      workStartHour: body.workStartHour,
      workEndHour: body.workEndHour,
      escalateKeywords: body.escalateKeywords,
    },
  });
  return NextResponse.json({ config: updated });
}
