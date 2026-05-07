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

    // Bloco extra: regras semanais de reunião
    const rules = await prisma.availabilityRule.findMany({
      where: { active: true },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
    });
    const weekdayNames = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const meetingRulesBlock =
      rules.length > 0
        ? `HORÁRIOS RECORRENTES DE REUNIÃO PRESENCIAL:\n${rules
            .map((r) => `• ${weekdayNames[r.weekday]}s: ${r.startTime} às ${r.endTime} — ${r.label}`)
            .join("\n")}\n\n`
        : "";

    if (appts.length === 0) {
      return `${meetingRulesBlock}AGENDA DO JEAN: nenhum compromisso registrado nos próximos meses. Pode sugerir qualquer data, mas sempre confirma com o Jean.`;
    }

    // Agrupa por data
    const byDate = new Map<string, typeof appts>();
    for (const a of appts) {
      const k = a.date.toISOString().slice(0, 10);
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k)!.push(a);
    }

    const lines: string[] = [];
    if (meetingRulesBlock) lines.push(meetingRulesBlock);
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

// helpers
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  return h * 60 + (m || 0);
}
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Calcula slots de reunião disponíveis num dia, baseado nas regras semanais
 * e descontando appointments já marcados.
 *
 * Slot dura `slotMinutes` (default 30). Retorna lista de "HH:mm".
 */
export async function getAvailableMeetingSlots(
  dateIso: string,
  slotMinutes = 30
): Promise<{ rule: { startTime: string; endTime: string; label: string } | null; slots: string[] }> {
  const date = new Date(dateIso + "T12:00:00");
  const weekday = date.getDay();

  const rules = await prisma.availabilityRule.findMany({
    where: { weekday, active: true },
    orderBy: { startTime: "asc" },
  });
  if (rules.length === 0) return { rule: null, slots: [] };

  // Pega appointments do dia
  const dayStart = new Date(dateIso + "T00:00:00");
  const dayEnd = new Date(dateIso + "T23:59:59");
  const appts = await prisma.appointment.findMany({
    where: { date: { gte: dayStart, lte: dayEnd } },
  });

  // Conjunto de minutos ocupados (intervalos com startTime/endTime ou slot inteiro)
  const occupied: { start: number; end: number }[] = [];
  for (const a of appts) {
    if (a.startTime && a.endTime) {
      occupied.push({ start: timeToMinutes(a.startTime), end: timeToMinutes(a.endTime) });
    } else if (a.slot === "FULL_DAY" && !a.allowsMore) {
      occupied.push({ start: 0, end: 24 * 60 });
    } else if (a.slot === "DAY" && !a.allowsMore) {
      occupied.push({ start: 6 * 60, end: 18 * 60 });
    } else if (a.slot === "NIGHT" && !a.allowsMore) {
      occupied.push({ start: 18 * 60, end: 24 * 60 });
    }
  }

  function overlaps(start: number, end: number): boolean {
    return occupied.some((o) => start < o.end && end > o.start);
  }

  const allSlots: string[] = [];
  for (const rule of rules) {
    const ruleStart = timeToMinutes(rule.startTime);
    const ruleEnd = timeToMinutes(rule.endTime);
    for (let t = ruleStart; t + slotMinutes <= ruleEnd; t += slotMinutes) {
      if (!overlaps(t, t + slotMinutes)) {
        allSlots.push(minutesToTime(t));
      }
    }
  }

  return {
    rule: { startTime: rules[0].startTime, endTime: rules[0].endTime, label: rules[0].label },
    slots: allSlots,
  };
}

/**
 * Lista próximos N dias com slots de reunião disponíveis.
 * Usado pra Marina sugerir horários no chat.
 */
export async function getUpcomingMeetingSlots(daysAhead = 14): Promise<string> {
  const now = new Date();
  const lines: string[] = [];
  let count = 0;
  for (let i = 0; i < daysAhead && count < 5; i++) {
    const d = new Date(now.getTime() + i * 24 * 3600 * 1000);
    const iso = d.toISOString().slice(0, 10);
    const { rule, slots } = await getAvailableMeetingSlots(iso);
    if (!rule || slots.length === 0) continue;
    const label = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
    lines.push(`• ${label} (${iso}): ${slots.join(", ")}`);
    count++;
  }
  if (lines.length === 0) {
    return "Sem horários de reunião disponíveis nos próximos 14 dias (verificar regras de disponibilidade no painel).";
  }
  return lines.join("\n");
}

/**
 * Garante que existem regras default (ter/qua) — chamado no startup.
 * Idempotente: se Jean já tem regras, não toca.
 */
export async function ensureDefaultAvailabilityRules() {
  const count = await prisma.availabilityRule.count();
  if (count > 0) return;
  await prisma.availabilityRule.createMany({
    data: [
      { weekday: 2, startTime: "13:30", endTime: "17:30", label: "Reuniões com clientes" },
      { weekday: 3, startTime: "08:30", endTime: "17:30", label: "Reuniões com clientes" },
    ],
  });
}

/**
 * Detecta datas mencionadas em texto PT-BR e verifica disponibilidade.
 * Retorna bloco formatado pra injetar como contexto autoritativo no prompt da Marina.
 */
const MONTH_NAMES: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, "março": 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9, sept: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

export async function verifyDatesInText(text: string): Promise<string> {
  const found: { iso: string; raw: string }[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const seen = new Set<string>();

  // Formato 1: DD/MM ou DD/MM/YYYY ou DD-MM ou DD-MM-YYYY
  const reNum = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/g;
  let m: RegExpExecArray | null;
  while ((m = reNum.exec(text)) !== null) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    let year = m[3] ? parseInt(m[3], 10) : currentYear;
    if (year < 100) year += 2000;
    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    if (!m[3]) {
      const candidate = new Date(year, month - 1, day);
      if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)) year++;
    }
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!seen.has(iso)) {
      seen.add(iso);
      found.push({ iso, raw: m[0] });
    }
  }

  // Formato 2: "16 de setembro" / "16 setembro"
  const reMonth = /\b(\d{1,2})\s+(?:de\s+)?(janeiro|jan|fevereiro|fev|março|marco|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez)(?:\s+(?:de\s+)?(\d{2,4}))?/gi;
  while ((m = reMonth.exec(text)) !== null) {
    const day = parseInt(m[1], 10);
    const month = MONTH_NAMES[m[2].toLowerCase()];
    if (!month || day < 1 || day > 31) continue;
    let year = m[3] ? parseInt(m[3], 10) : currentYear;
    if (year < 100) year += 2000;
    if (!m[3]) {
      const candidate = new Date(year, month - 1, day);
      if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)) year++;
    }
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!seen.has(iso)) {
      seen.add(iso);
      found.push({ iso, raw: m[0] });
    }
  }

  if (found.length === 0) return "";

  const lines: string[] = [];
  for (const { iso, raw } of found.slice(0, 5)) {
    const r = await checkDateAvailability(iso);
    const dateLabel = new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
    let icon = "✅ DISPONÍVEL";
    if (!r.available) icon = "❌ OCUPADO";
    else if (r.partial) icon = "⚠️ PARCIAL";
    lines.push(`• "${raw}" → ${dateLabel}: ${icon} (${r.reason})`);
  }

  return lines.join("\n");
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
