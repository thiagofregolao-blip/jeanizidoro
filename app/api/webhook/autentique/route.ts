import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type AutentiquePayload = {
  event?: { type?: string };
  document?: { id?: string; files?: { signed?: string; pades?: string } };
  signature?: { signed_at?: string; viewed_at?: string };
};

export async function POST(req: NextRequest) {
  let payload: AutentiquePayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  await prisma.webhookLog.create({
    data: { source: "autentique", payload: payload as object },
  });

  const autentiqueId = payload.document?.id;
  if (!autentiqueId) return NextResponse.json({ ok: true, skipped: "no_doc_id" });

  const contract = await prisma.contract.findFirst({ where: { autentiqueId } });
  if (!contract) return NextResponse.json({ ok: true, skipped: "not_found" });

  const eventType = payload.event?.type?.toLowerCase() || "";
  const update: {
    status?: "VIEWED" | "SIGNED" | "CANCELLED";
    viewedAt?: Date;
    signedAt?: Date;
    signedPdfUrl?: string;
  } = {};

  if (eventType.includes("viewed")) {
    update.status = "VIEWED";
    update.viewedAt = new Date();
  } else if (eventType.includes("signed") || eventType.includes("completed")) {
    update.status = "SIGNED";
    update.signedAt = new Date();
    update.signedPdfUrl = payload.document?.files?.signed || payload.document?.files?.pades;
  } else if (eventType.includes("cancel") || eventType.includes("reject")) {
    update.status = "CANCELLED";
  }

  if (Object.keys(update).length > 0) {
    await prisma.contract.update({
      where: { id: contract.id },
      data: update,
    });
    if (update.status === "SIGNED" && contract.leadId) {
      await prisma.lead.update({
        where: { id: contract.leadId },
        data: { status: "WON" },
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
