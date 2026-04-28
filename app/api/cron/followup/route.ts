import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateReply, detectTone, type ContactProfile } from "@/lib/claude";
import { buildLeadDossier } from "@/lib/leadDossier";
import { getAppointmentsContext } from "@/lib/appointments";
import { sendText, setTyping } from "@/lib/zapi";
import { logError, alertOwner } from "@/lib/reliability";

export const runtime = "nodejs";
export const maxDuration = 60;

const FOLLOWUP_INTERVAL_DAYS = 3;
const MAX_FOLLOWUPS = 3;
const MIN_DAYS_SINCE_LAST_MSG = 3;

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return token === secret;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const cutoffLastMsg = new Date(now.getTime() - MIN_DAYS_SINCE_LAST_MSG * 24 * 3600 * 1000);
  const cutoffLastFollowup = new Date(
    now.getTime() - FOLLOWUP_INTERVAL_DAYS * 24 * 3600 * 1000
  );

  // Leads candidatos: HOT/WARM ou IN_SERVICE, sem contrato, sem msg há 3+ dias,
  // followupCount < 3, último followup há 3+ dias (ou nunca)
  const candidates = await prisma.lead.findMany({
    where: {
      AND: [
        {
          OR: [{ temperature: { in: ["HOT", "WARM"] } }, { status: "IN_SERVICE" }],
        },
        { status: { notIn: ["WON", "LOST"] } },
        { followupCount: { lt: MAX_FOLLOWUPS } },
        { conversation: { lastMsgAt: { lt: cutoffLastMsg } } },
        {
          OR: [
            { lastFollowupAt: null },
            { lastFollowupAt: { lt: cutoffLastFollowup } },
          ],
        },
        // Exclui leads que tem contrato gerado
        { contact: { contracts: { none: {} } } },
      ],
    },
    include: {
      contact: true,
      conversation: { include: { messages: { orderBy: { createdAt: "asc" }, take: 30 } } },
    },
    take: 20, // limite por execução
  });

  const results: { id: string; sent: boolean; error?: string; markedLost?: boolean }[] = [];

  for (const lead of candidates) {
    try {
      // Verifica se o cliente respondeu DEPOIS do último followup (se sim, sai da fila)
      if (lead.lastFollowupAt) {
        const hasClientReplyAfter = lead.conversation.messages.some(
          (m) =>
            m.direction === "IN" && new Date(m.createdAt) > new Date(lead.lastFollowupAt!)
        );
        if (hasClientReplyAfter) {
          // Cliente respondeu, reseta contador
          await prisma.lead.update({
            where: { id: lead.id },
            data: { followupCount: 0, lastFollowupAt: null },
          });
          results.push({ id: lead.id, sent: false, error: "client_replied_skip" });
          continue;
        }
      }

      const dossier = await buildLeadDossier(lead.conversation.id);
      const calendarContext = await getAppointmentsContext(180);

      const profile = (lead.contact.profile as ContactProfile | null) || null;
      const tone = lead.contact.tone === "formal" || lead.contact.tone === "casual" || lead.contact.tone === "mixed"
        ? lead.contact.tone
        : await detectTone(lead.conversation.messages.slice(-5).map((m) => m.content).join(" "));

      const history = lead.conversation.messages.slice(-5).map((m) => ({
        role: (m.direction === "IN" ? "user" : "assistant") as "user" | "assistant",
        content: m.content,
      }));

      const chunks = await generateReply({
        persona: "Você é Marina, atendente virtual de Jean Izidoro.",
        businessContext:
          "Decoração de Casamentos, Assessoria Cerimonial, Decoração de Festas Infantis.",
        history,
        contactName: lead.contact.name,
        contactProfile: profile,
        detectedTone: tone,
        isFirstInteraction: false,
        calendarContext,
        leadDossier: dossier,
        attendCode: lead.attendCode,
        mode: "followup",
      });

      // Envia chunks
      for (let i = 0; i < chunks.length; i++) {
        await setTyping(lead.contact.phone, 1500);
        const sent = await sendText(lead.contact.phone, chunks[i]);
        await prisma.message.create({
          data: {
            conversationId: lead.conversation.id,
            direction: "OUT",
            sender: "AI",
            content: chunks[i],
            zapiMessageId: sent?.messageId ?? null,
            meta: { followup: true, followupNumber: lead.followupCount + 1 } as object,
          },
        });
        if (i < chunks.length - 1) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      const newCount = lead.followupCount + 1;
      const markedLost = newCount >= MAX_FOLLOWUPS;
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          followupCount: newCount,
          lastFollowupAt: now,
          status: markedLost ? "LOST" : lead.status,
        },
      });

      results.push({ id: lead.id, sent: true, markedLost });
      console.log(
        `[CRON-FOLLOWUP] enviado pra ${lead.contact.phone} (${newCount}/${MAX_FOLLOWUPS})${markedLost ? " — marcado LOST" : ""}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logError("cron:followup", msg, { leadId: lead.id });
      results.push({ id: lead.id, sent: false, error: msg });
    }
  }

  if (results.some((r) => r.sent)) {
    await alertOwner(
      `🔁 Follow-ups automáticos: ${results.filter((r) => r.sent).length} enviado(s)${
        results.filter((r) => r.markedLost).length > 0
          ? `, ${results.filter((r) => r.markedLost).length} marcado(s) como LOST`
          : ""
      }.`
    );
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent: results.filter((r) => r.sent).length,
    markedLost: results.filter((r) => r.markedLost).length,
    results,
  });
}
