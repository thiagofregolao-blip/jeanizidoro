"use client";

import { useEffect, useMemo, useState } from "react";

type SlotType = "FULL_DAY" | "DAY" | "NIGHT";

type Appointment = {
  id: string;
  date: string;
  slot: SlotType;
  allowsMore: boolean;
  title: string;
  notes: string | null;
  contact: { id: string; name: string | null; phone: string } | null;
};

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const SLOT_LABELS: Record<SlotType, { label: string; emoji: string; color: string }> = {
  FULL_DAY: { label: "Dia todo", emoji: "🌞", color: "text-red-400 border-red-500/40 bg-red-500/10" },
  DAY: { label: "Diurno", emoji: "☀️", color: "text-amber-400 border-amber-500/40 bg-amber-500/10" },
  NIGHT: { label: "Noturno", emoji: "🌙", color: "text-blue-400 border-blue-500/40 bg-blue-500/10" },
};

export default function AgendaView() {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formSlot, setFormSlot] = useState<SlotType>("FULL_DAY");
  const [formAllowsMore, setFormAllowsMore] = useState(false);
  const [formTitle, setFormTitle] = useState("Evento");
  const [formNotes, setFormNotes] = useState("");

  async function load() {
    setLoading(true);
    // pega 18 meses pra cobrir bem
    const from = `${viewYear}-01-01`;
    const to = `${viewYear + 1}-12-31`;
    const res = await fetch(`/api/appointments?from=${from}&to=${to}`);
    const d = await res.json();
    setAppointments(d.appointments || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear]);

  // ─────────────────────────────────────────────
  // Navegação
  // ─────────────────────────────────────────────
  function prevMonth() {
    setSelectedDay(null);
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    setSelectedDay(null);
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else setViewMonth(viewMonth + 1);
  }
  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(null);
  }

  // ─────────────────────────────────────────────
  // Grid do mês
  // ─────────────────────────────────────────────
  const grid = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const leading = firstDay.getDay();
    const cells: Array<{ iso: string; dayNum: number } | null> = [];
    for (let i = 0; i < leading; i++) cells.push(null);
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ iso, dayNum: day });
    }
    return cells;
  }, [viewYear, viewMonth]);

  function getDayAppts(iso: string) {
    return appointments.filter((a) => a.date.slice(0, 10) === iso);
  }

  function getDayStatus(iso: string): "free" | "partial" | "full" | "allowsMore" {
    const items = getDayAppts(iso);
    if (items.length === 0) return "free";
    if (items.some((i) => i.allowsMore)) return "allowsMore";
    const hasFull = items.some((i) => i.slot === "FULL_DAY");
    const hasDay = items.some((i) => i.slot === "DAY");
    const hasNight = items.some((i) => i.slot === "NIGHT");
    if (hasFull || (hasDay && hasNight)) return "full";
    return "partial";
  }

  function statusClass(status: string, isToday: boolean, isPast: boolean, isSelected: boolean) {
    const base = "min-h-[90px] md:min-h-[100px] flex flex-col items-stretch text-left border rounded-sm transition-colors cursor-pointer overflow-hidden p-1.5";
    if (isSelected) return `${base} border-gold bg-gold/20 ring-1 ring-gold`;
    if (isPast) return `${base} border-line/40 text-fg-muted/40 hover:border-line`;
    if (isToday) return `${base} ring-1 ring-gold border-line hover:bg-bg-soft`;
    if (status === "full") return `${base} border-red-500/40 bg-red-500/10`;
    if (status === "partial") return `${base} border-amber-500/40 bg-amber-500/10`;
    if (status === "allowsMore") return `${base} border-blue-500/40 bg-blue-500/5`;
    return `${base} border-line hover:border-gold/40`;
  }

  function eventBadgeClass(slot: SlotType) {
    if (slot === "FULL_DAY") return "bg-red-500/20 text-red-300 border-l-2 border-red-500";
    if (slot === "DAY") return "bg-amber-500/20 text-amber-300 border-l-2 border-amber-500";
    return "bg-blue-500/20 text-blue-300 border-l-2 border-blue-500";
  }

  // ─────────────────────────────────────────────
  // Seleção múltipla
  // ─────────────────────────────────────────────
  function toggleSelectMode() {
    setSelectMode(!selectMode);
    setSelectedDays(new Set());
    setSelectedDay(null);
  }

  function toggleDaySelection(iso: string) {
    if (selectMode) {
      const next = new Set(selectedDays);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      setSelectedDays(next);
    } else {
      setSelectedDay(selectedDay === iso ? null : iso);
    }
  }

  function selectAllWeekends() {
    const next = new Set(selectedDays);
    for (const cell of grid) {
      if (!cell) continue;
      const dow = new Date(cell.iso + "T12:00:00").getDay();
      if (dow === 0 || dow === 6) next.add(cell.iso);
    }
    setSelectedDays(next);
  }
  function selectAllSaturdays() {
    const next = new Set(selectedDays);
    for (const cell of grid) {
      if (!cell) continue;
      if (new Date(cell.iso + "T12:00:00").getDay() === 6) next.add(cell.iso);
    }
    setSelectedDays(next);
  }
  function selectAllSundays() {
    const next = new Set(selectedDays);
    for (const cell of grid) {
      if (!cell) continue;
      if (new Date(cell.iso + "T12:00:00").getDay() === 0) next.add(cell.iso);
    }
    setSelectedDays(next);
  }
  function clearSelection() {
    setSelectedDays(new Set());
  }

  // ─────────────────────────────────────────────
  // Form
  // ─────────────────────────────────────────────
  function openCreateForm() {
    setEditingId(null);
    setFormSlot("FULL_DAY");
    setFormAllowsMore(false);
    setFormTitle("Evento");
    setFormNotes("");
    setShowForm(true);
  }
  function openEditForm(appt: Appointment) {
    setEditingId(appt.id);
    setFormSlot(appt.slot);
    setFormAllowsMore(appt.allowsMore);
    setFormTitle(appt.title);
    setFormNotes(appt.notes || "");
    setShowForm(true);
  }

  async function saveForm() {
    const dates = selectMode
      ? [...selectedDays]
      : selectedDay
      ? [selectedDay]
      : [];

    if (editingId) {
      // Edit single
      await fetch(`/api/appointments/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot: formSlot,
          allowsMore: formAllowsMore,
          title: formTitle,
          notes: formNotes,
        }),
      });
    } else if (dates.length > 0) {
      // Bulk or single create
      await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dates,
          slot: formSlot,
          allowsMore: formAllowsMore,
          title: formTitle,
          notes: formNotes,
        }),
      });
    }

    setShowForm(false);
    setEditingId(null);
    if (selectMode) {
      setSelectedDays(new Set());
      setSelectMode(false);
    }
    await load();
  }

  async function deleteAppt(id: string) {
    if (!confirm("Excluir esse evento?")) return;
    await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) return <div className="text-fg-muted">Carregando...</div>;

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const dayDetailAppts = selectedDay ? getDayAppts(selectedDay) : [];

  return (
    <>
      {/* Topbar */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="text-xs uppercase tracking-widest border border-line text-fg-muted hover:border-gold hover:text-gold w-8 h-8 flex items-center justify-center transition-colors">
            ←
          </button>
          <h2 className="font-display text-3xl min-w-[220px] text-center">
            {MONTHS_PT[viewMonth]} {viewYear}
          </h2>
          <button onClick={nextMonth} className="text-xs uppercase tracking-widest border border-line text-fg-muted hover:border-gold hover:text-gold w-8 h-8 flex items-center justify-center transition-colors">
            →
          </button>
          {!isCurrentMonth && (
            <button onClick={goToday} className="text-[10px] uppercase tracking-widest border border-gold/40 text-gold hover:bg-gold/10 px-3 py-2 transition-colors">
              Hoje
            </button>
          )}
        </div>

        <button
          onClick={toggleSelectMode}
          className={`text-xs uppercase tracking-[0.2em] border px-4 py-2 transition-colors ${
            selectMode
              ? "border-gold text-bg bg-gold"
              : "border-gold/40 text-gold hover:bg-gold/10"
          }`}
        >
          {selectMode ? `✓ Marcar vários (${selectedDays.size})` : "Marcar vários"}
        </button>
      </div>

      {/* Atalhos quando selectMode */}
      {selectMode && (
        <div className="luxury-glass p-4 rounded-sm mb-4 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-fg-muted mr-2">Atalhos:</span>
          <button onClick={selectAllWeekends} className="text-xs border border-line px-3 py-1 hover:border-gold text-fg-muted hover:text-gold">
            Sáb + Dom do mês
          </button>
          <button onClick={selectAllSaturdays} className="text-xs border border-line px-3 py-1 hover:border-gold text-fg-muted hover:text-gold">
            Só sábados
          </button>
          <button onClick={selectAllSundays} className="text-xs border border-line px-3 py-1 hover:border-gold text-fg-muted hover:text-gold">
            Só domingos
          </button>
          <button onClick={clearSelection} className="text-xs border border-red-500/30 text-red-400 px-3 py-1 hover:bg-red-500/10 ml-auto">
            Limpar seleção
          </button>
          {selectedDays.size > 0 && (
            <button onClick={openCreateForm} className="text-xs uppercase tracking-widest bg-gold text-bg px-4 py-2 hover:bg-fg transition-colors">
              + Marcar {selectedDays.size} dia{selectedDays.size > 1 ? "s" : ""}
            </button>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className={selectedDay && !selectMode ? "md:col-span-2" : "md:col-span-3"}>
          <div className="luxury-glass p-6 rounded-sm">
            <div className="grid grid-cols-7 gap-2 text-center text-[10px] text-fg-muted uppercase tracking-widest mb-2">
              {WEEKDAYS_PT.map((d) => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {grid.map((cell, idx) => {
                if (!cell) return <div key={`e-${idx}`} className="min-h-[90px] md:min-h-[100px]" />;
                const status = getDayStatus(cell.iso);
                const isToday = cell.iso === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
                const isPast = new Date(cell.iso + "T12:00:00").getTime() < new Date(today.toDateString()).getTime();
                const isSelected = selectMode ? selectedDays.has(cell.iso) : selectedDay === cell.iso;
                const dayAppts = getDayAppts(cell.iso);
                return (
                  <button
                    key={cell.iso}
                    onClick={() => toggleDaySelection(cell.iso)}
                    className={statusClass(status, isToday, isPast, isSelected)}
                    title={dayAppts.length ? dayAppts.map((a) => `${SLOT_LABELS[a.slot].emoji} ${a.title}${a.allowsMore ? " (aceita encaixar)" : ""}`).join("\n") : "Livre"}
                  >
                    {/* Cabeçalho: número do dia */}
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-display text-sm md:text-base leading-none ${isToday ? "text-gold" : ""}`}>
                        {cell.dayNum}
                      </span>
                      {dayAppts.some((a) => a.allowsMore) && (
                        <span className="text-[9px]" title="Aceita encaixar">🔓</span>
                      )}
                    </div>

                    {/* Eventos do dia (até 3 visíveis + "+N") */}
                    <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                      {dayAppts.slice(0, 3).map((a) => (
                        <div
                          key={a.id}
                          className={`text-[9px] md:text-[10px] px-1 py-0.5 truncate leading-tight ${eventBadgeClass(a.slot)}`}
                        >
                          {SLOT_LABELS[a.slot].emoji} {a.title}
                        </div>
                      ))}
                      {dayAppts.length > 3 && (
                        <div className="text-[9px] text-fg-muted">+{dayAppts.length - 3}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 mt-4 text-[10px] text-fg-muted flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 border border-line rounded-sm"></span> Livre
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 border border-amber-500/40 bg-amber-500/10 rounded-sm"></span> Parcial
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 border border-red-500/40 bg-red-500/10 rounded-sm"></span> Cheio
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 border border-blue-500/40 bg-blue-500/5 rounded-sm"></span> Aceita encaixar
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 ring-1 ring-gold rounded-sm"></span> Hoje
              </span>
            </div>
          </div>
        </div>

        {/* Side panel: dia selecionado */}
        {selectedDay && !selectMode && (
          <div className="luxury-glass p-6 rounded-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-xl">
                {new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </h3>
              <button onClick={() => setSelectedDay(null)} className="text-fg-muted text-xl hover:text-gold">×</button>
            </div>

            <div className="space-y-3 mb-4">
              {dayDetailAppts.length === 0 && (
                <div className="text-fg-muted text-sm italic">Dia livre</div>
              )}
              {dayDetailAppts.map((a) => (
                <div key={a.id} className={`border-l-2 p-3 ${SLOT_LABELS[a.slot].color}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="font-display text-base">{a.title}</div>
                    <div className="flex gap-1">
                      <button onClick={() => openEditForm(a)} className="text-[10px] text-fg-muted hover:text-gold">editar</button>
                      <button onClick={() => deleteAppt(a.id)} className="text-[10px] text-red-400 hover:text-red-300">excluir</button>
                    </div>
                  </div>
                  <div className="text-xs text-fg-muted">
                    {SLOT_LABELS[a.slot].emoji} {SLOT_LABELS[a.slot].label}
                    {a.allowsMore && " · 🔓 aceita encaixar outro"}
                  </div>
                  {a.notes && <div className="text-xs text-fg-muted mt-1 italic">{a.notes}</div>}
                </div>
              ))}
            </div>

            <button onClick={openCreateForm} className="w-full text-xs uppercase tracking-widest border border-gold text-gold hover:bg-gold/10 px-4 py-3 transition-colors">
              + Adicionar evento
            </button>
          </div>
        )}
      </div>

      {/* Modal form */}
      {showForm && (
        <div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false); }}
        >
          <div className="luxury-glass rounded-sm p-8 max-w-lg w-full">
            <h3 className="font-display text-2xl mb-6">
              {editingId ? "Editar evento" : selectMode ? `Marcar ${selectedDays.size} dia(s)` : "Adicionar evento"}
            </h3>

            <div className="space-y-5">
              {/* Slot */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-fg-muted mb-2">Tipo de bloqueio</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["FULL_DAY", "DAY", "NIGHT"] as SlotType[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFormSlot(s)}
                      className={`p-4 border text-sm transition-colors ${
                        formSlot === s
                          ? `${SLOT_LABELS[s].color} font-bold`
                          : "border-line text-fg-muted hover:border-gold"
                      }`}
                    >
                      <div className="text-2xl mb-1">{SLOT_LABELS[s].emoji}</div>
                      <div>{SLOT_LABELS[s].label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Allows more */}
              <label className="flex items-center gap-3 cursor-pointer p-3 border border-line hover:border-gold transition-colors">
                <input
                  type="checkbox"
                  checked={formAllowsMore}
                  onChange={(e) => setFormAllowsMore(e.target.checked)}
                  className="w-5 h-5 accent-[var(--gold)]"
                />
                <div className="flex-1">
                  <div className="text-sm">🔓 Aceita encaixar outro evento neste dia</div>
                  <div className="text-xs text-fg-muted">Marina vai oferecer essa data como possível mesmo com este evento marcado</div>
                </div>
              </label>

              {/* Title */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-fg-muted mb-2">Título</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-transparent border border-line px-3 py-2 outline-none focus:border-gold"
                  placeholder="Ex: Casamento Maria, Reunião com cliente..."
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-fg-muted mb-2">Observações (opcional)</label>
                <textarea
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-transparent border border-line p-3 outline-none focus:border-gold text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button onClick={() => setShowForm(false)} className="flex-1 text-xs uppercase tracking-widest border border-line text-fg-muted hover:border-gold py-3">
                Cancelar
              </button>
              <button onClick={saveForm} className="flex-1 text-xs uppercase tracking-widest bg-gold text-bg hover:bg-fg py-3">
                {editingId ? "Salvar" : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
