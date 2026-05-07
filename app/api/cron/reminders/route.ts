import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendText } from "@/lib/zapi";
import { logError } from "@/lib/reliability";

export const runtime = "nodejs";
export const maxDuration = 30;

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return token === secret;
}

// converte data + startTime (ou fallback 18h da véspera) em timestamp absoluto BRT
function eventTimestamp(date: Date, startTime: string | null): Date {
  // appointments são salvos com date às 00:00 local. Vamos compor com BR timezone.
  const iso = date.toISOString().slice(0, 10);
  if (startTime) {
    // assume horário Brasília (UTC-3)
    const [h, m] = startTime.split(":").map((s) => parseInt(s, 10));
    const utcHour = h + 3; // adiciona offset BRT pra UTC
    return new Date(`${iso}T${String(utcHour).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00Z`);
  }
  // sem startTime: lembrar 18h da véspera = a data já é o dia, então pega o dia anterior 18h
  const day = new Date(`${iso}T21:00:00Z`); // 18h BRT = 21h UTC
  day.setUTCDate(day.getUTCDate() - 1);
  return day;
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ownerPhone = process.env.OWNER_WHATSAPP_PHONE;
  if (!ownerPhone) {
    return NextResponse.json({ error: "OWNER_WHATSAPP_PHONE não configurado" }, { status: 500 });
  }

  const now = new Date();
  // janela: appointments cujo trigger_time (8h antes do evento OU 18h véspera) cai entre agora-15min e agora+15min
  // simplificamos: pegamos appointments futuros até 36h, calculamos trigger e filtramos quem cai na janela
  const horizon = new Date(now.getTime() + 36 * 3600 * 1000);
  const candidates = await prisma.appointment.findMany({
    where: {
      reminderSentAt: null,
      date: { gte: new Date(now.getTime() - 24 * 3600 * 1000), lte: horizon },
    },
    include: {
      contact: { select: { name: true, phone: true } },
    },
    take: 50,
  });

  const sent: { id: string; title: string }[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const a of candidates) {
    try {
      const eventTs = eventTimestamp(a.date, a.startTime);
      const triggerTs = a.startTime
        ? new Date(eventTs.getTime() - 8 * 3600 * 1000) // 8h antes
        : eventTs; // sem horário: o próprio "18h véspera"

      const deltaMs = triggerTs.getTime() - now.getTime();
      // janela de 30 min: trigger deve estar entre -15min e +15min de agora
      if (deltaMs < -15 * 60 * 1000 || deltaMs > 15 * 60 * 1000) {
        // se já passou da janela e não foi enviado, marca pra não tentar mais (evita lembretes de eventos passados)
        if (deltaMs < -60 * 60 * 1000) {
          await prisma.appointment.update({
            where: { id: a.id },
            data: { reminderSentAt: now },
          });
          skipped.push({ id: a.id, reason: "expired_window" });
        } else {
          skipped.push({ id: a.id, reason: "out_of_window" });
        }
        continue;
      }

      const dateLabel = a.date.toLocaleDateString("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        timeZone: "America/Sao_Paulo",
      });
      const timeLabel = a.startTime ? ` às ${a.startTime}` : "";
      const clientLabel = a.contact?.name ? `\nCliente: ${a.contact.name}` : "";
      const notesLabel = a.notes ? `\nObs: ${a.notes}` : "";
      const prefix = a.startTime ? "⏰ Em ~8h" : "📌 Amanhã";
      const message = `${prefix}: "${a.title}" — ${dateLabel}${timeLabel}${clientLabel}${notesLabel}`;

      await sendText(ownerPhone, message);
      await prisma.appointment.update({
        where: { id: a.id },
        data: { reminderSentAt: now },
      });
      sent.push({ id: a.id, title: a.title });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await logError("cron:reminders", msg, { appointmentId: a.id });
      skipped.push({ id: a.id, reason: msg });
    }
  }

  console.log(`[CRON-REMINDERS] enviados=${sent.length} pulados=${skipped.length}`);
  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    sent: sent.length,
    skipped: skipped.length,
    details: { sent, skipped },
  });
}
