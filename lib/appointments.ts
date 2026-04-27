import { prisma } from "./prisma";
import type { SlotType } from "@prisma/client";

const SLOT_LABEL: Record<SlotType, string> = {
  FULL_DAY: "Dia todo",
  DAY: "Diurno",
  NIGHT: "Noturno",
};

/**
 * Gera o contexto de agenda pra Marina consultar antes de sugerir datas.
 * Retorna texto estruturado com os eventos dos próximos N dias.
 */
export async function getAppointmentsContext(daysAhead = 365): Promise<string> {
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(start.getTime() + daysAhead * 24 * 3600 * 1000);

    const appts = await prisma.appointment.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
      include: { contact: { select: { name: true } } },
    });

    if (appts.length === 0) {
      return "AGENDA DO JEAN: nenhum compromisso registrado nos próximos meses. Pode sugerir qualquer data, mas sempre confirma com o Jean.";
    }

    // Agrupa por data
    const byDate = new Map<string, typeof appts>();
    for (const a of appts) {
      const k = a.date.toISOString().slice(0, 10);
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k)!.push(a);
    }

    const lines: string[] = [];
    lines.push("AGENDA DO JEAN — datas com compromisso (NÃO sugerir as ocupadas sem antes confirmar):");
    lines.push("");

    for (const [iso, items] of byDate.entries()) {
      const d = new Date(iso + "T12:00:00");
      const dateLabel = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

      const slots = items.map((i) => i.slot);
      const allFull = slots.includes("FULL_DAY");
      const hasDay = slots.includes("DAY");
      const hasNight = slots.includes("NIGHT");
      const anyAllowsMore = items.some((i) => i.allowsMore);

      let status: string;
      if (allFull && !anyAllowsMore) {
        status = "❌ DIA INTEIRO OCUPADO — não sugerir";
      } else if (hasDay && hasNight && !anyAllowsMore) {
        status = "❌ DIA INTEIRO OCUPADO (dia + noite) — não sugerir";
      } else if (anyAllowsMore) {
        status = "⚠️ Tem evento mas o Jean pode encaixar outro — diga 'tem agenda mas posso ver com o Jean'";
      } else if (hasDay) {
        status = "🌙 Dia ocupado, NOITE livre";
      } else if (hasNight) {
        status = "☀️ Noite ocupada, DIA livre";
      } else {
        status = "❓ Verificar com o Jean";
      }

      const titles = items
        .map((i) => `${SLOT_LABEL[i.slot]}: ${i.title}${i.contact?.name ? ` (${i.contact.name})` : ""}`)
        .join(" / ");
      lines.push(`• ${dateLabel} — ${status}`);
      lines.push(`  └ ${titles}`);
    }

    return lines.join("\n");
  } catch (e) {
    console.error("getAppointmentsContext error", e);
    return "";
  }
}

/**
 * Verifica disponibilidade de uma data específica.
 * Útil pra responder "está livre dia X?" rapidamente.
 */
export async function checkDateAvailability(dateIso: string): Promise<{
  available: boolean;
  partial: boolean;
  reason: string;
}> {
  const date = new Date(dateIso + "T00:00:00");
  const next = new Date(date.getTime() + 24 * 3600 * 1000);
  const items = await prisma.appointment.findMany({
    where: { date: { gte: date, lt: next } },
  });

  if (items.length === 0) {
    return { available: true, partial: false, reason: "data totalmente livre" };
  }

  const allowsMore = items.some((i) => i.allowsMore);
  const hasFullDay = items.some((i) => i.slot === "FULL_DAY");
  const hasDay = items.some((i) => i.slot === "DAY");
  const hasNight = items.some((i) => i.slot === "NIGHT");

  if (allowsMore) {
    return { available: true, partial: true, reason: "tem evento mas o Jean aceita encaixar outro" };
  }
  if (hasFullDay) {
    return { available: false, partial: false, reason: "dia inteiro ocupado" };
  }
  if (hasDay && hasNight) {
    return { available: false, partial: false, reason: "dia e noite ocupados" };
  }
  if (hasDay) {
    return { available: true, partial: true, reason: "dia ocupado, noite livre" };
  }
  if (hasNight) {
    return { available: true, partial: true, reason: "noite ocupada, dia livre" };
  }
  return { available: false, partial: false, reason: "indeterminado" };
}
