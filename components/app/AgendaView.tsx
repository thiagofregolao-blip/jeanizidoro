"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type EventItem = {
  id?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  htmlLink?: string;
  description?: string;
};

type BusyWindow = { start?: string; end?: string };

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function AgendaView() {
  const params = useSearchParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [busy, setBusy] = useState<BusyWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-based
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const justConnected = params.get("connected") === "1";
  const urlErr = params.get("error");

  async function load() {
    setLoading(true);
    // Carrega 365 dias adiante pra cobrir até o final do ano que vem
    const res = await fetch("/api/calendar/events?days=365");
    const d = await res.json();
    setConnected(!!d.connected);
    setErr(d.error || null);
    setEvents(d.events || []);
    setBusy(d.busy || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // ─────────────────────────────────────────────
  // Tela de conexão
  // ─────────────────────────────────────────────
  if (loading) return <div className="text-fg-muted">Carregando...</div>;

  if (connected === false || urlErr) {
    return (
      <div className="luxury-glass p-12 rounded-sm text-center">
        <div className="text-6xl mb-4">📅</div>
        <h3 className="font-display text-2xl mb-4">Conecte seu Google Calendar</h3>
        <p className="text-fg-muted text-sm max-w-md mx-auto mb-6">
          Autorize o acesso ao seu calendar pra que a Marina consulte sua disponibilidade
          antes de sugerir datas aos clientes.
        </p>
        {urlErr && (
          <div className="text-sm text-red-400 mb-4">Erro: {decodeURIComponent(urlErr)}</div>
        )}
        {err && !urlErr && (
          <div className="text-sm text-red-400 mb-4">Erro: {err}</div>
        )}
        <a
          href="/api/google/auth"
          className="inline-block bg-gold text-bg uppercase tracking-[0.3em] text-xs px-8 py-3 hover:bg-fg transition-colors"
        >
          Conectar Google Calendar
        </a>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Calendário mensal
  // ─────────────────────────────────────────────
  const monthGrid = useMonthGrid(viewYear, viewMonth, events, busy);
  const selectedDayEvents = selectedDay
    ? events.filter((e) => {
        const s = e.start?.dateTime || e.start?.date;
        return s && s.slice(0, 10) === selectedDay;
      })
    : [];

  function prevMonth() {
    setSelectedDay(null);
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    setSelectedDay(null);
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(null);
  }

  const isCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  return (
    <>
      {justConnected && (
        <div className="luxury-glass p-4 rounded-sm mb-6 border-gold/40">
          <div className="text-sm text-gold">✓ Google Calendar conectado com sucesso</div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Calendário */}
        <div className="md:col-span-2 luxury-glass p-6 rounded-sm">
          {/* Header com navegação */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={prevMonth}
                className="text-xs uppercase tracking-widest border border-line text-fg-muted hover:border-gold hover:text-gold w-8 h-8 flex items-center justify-center transition-colors"
                aria-label="Mês anterior"
              >
                ←
              </button>
              <h3 className="font-display text-2xl min-w-[180px] text-center">
                {MONTHS_PT[viewMonth]} {viewYear}
              </h3>
              <button
                onClick={nextMonth}
                className="text-xs uppercase tracking-widest border border-line text-fg-muted hover:border-gold hover:text-gold w-8 h-8 flex items-center justify-center transition-colors"
                aria-label="Próximo mês"
              >
                →
              </button>
            </div>
            {!isCurrentMonth && (
              <button
                onClick={goToday}
                className="text-[10px] uppercase tracking-widest border border-gold/40 text-gold hover:bg-gold/10 px-4 py-2 transition-colors"
              >
                Hoje
              </button>
            )}
          </div>

          {/* Dias da semana */}
          <div className="grid grid-cols-7 gap-2 text-center text-[10px] text-fg-muted uppercase tracking-widest mb-2">
            {WEEKDAYS_PT.map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Grid do mês */}
          <div className="grid grid-cols-7 gap-2">
            {monthGrid.map((d, idx) => {
              if (!d) return <div key={`empty-${idx}`} className="aspect-square" />;
              const isToday =
                d.iso ===
                `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
                  today.getDate()
                ).padStart(2, "0")}`;
              const isSelected = selectedDay === d.iso;
              const isPast = new Date(d.iso).getTime() < new Date(today.toDateString()).getTime();

              return (
                <button
                  key={d.iso}
                  onClick={() => setSelectedDay(isSelected ? null : d.iso)}
                  className={`aspect-square flex flex-col items-center justify-center text-sm border rounded-sm transition-colors ${
                    isSelected
                      ? "border-gold bg-gold/10"
                      : d.isBusy
                      ? "border-red-500/30 bg-red-500/5 text-red-300 hover:border-red-500/60"
                      : isPast
                      ? "border-line/40 text-fg-muted/50"
                      : "border-line hover:border-gold/40"
                  } ${isToday ? "ring-1 ring-gold" : ""}`}
                  title={d.events.map((e) => e.summary).join("; ") || "Livre"}
                >
                  <div className={`font-display text-base ${isToday ? "text-gold" : ""}`}>
                    {new Date(d.iso).getDate()}
                  </div>
                  {d.events.length > 0 && (
                    <div className="text-[8px] text-fg-muted mt-0.5">
                      {d.events.length} ev
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-4 mt-4 text-xs text-fg-muted flex-wrap">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border border-line rounded-sm"></span> Livre
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border border-red-500/30 bg-red-500/5 rounded-sm"></span> Ocupado
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 ring-1 ring-gold rounded-sm"></span> Hoje
            </span>
          </div>
        </div>

        {/* Coluna lateral: dia selecionado OU próximos eventos */}
        <div className="luxury-glass p-6 rounded-sm">
          {selectedDay ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-xl">
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                  })}
                </h3>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-fg-muted text-xl hover:text-gold"
                >
                  ×
                </button>
              </div>
              {selectedDayEvents.length === 0 ? (
                <div className="text-fg-muted text-sm italic">
                  Dia livre · nenhum compromisso registrado
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayEvents.map((e) => (
                    <div key={e.id} className="border-l-2 border-gold pl-3 pb-2">
                      <div className="font-display text-base">{e.summary || "(sem título)"}</div>
                      <div className="text-xs text-fg-muted">{formatEventTime(e)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="font-display text-xl mb-4">Próximos eventos</h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {events
                  .filter((e) => {
                    const s = e.start?.dateTime || e.start?.date;
                    return s && new Date(s) >= new Date(today.toDateString());
                  })
                  .slice(0, 20)
                  .map((e) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        const s = e.start?.dateTime || e.start?.date;
                        if (s) {
                          const d = new Date(s);
                          setViewYear(d.getFullYear());
                          setViewMonth(d.getMonth());
                          setSelectedDay(s.slice(0, 10));
                        }
                      }}
                      className="border-l-2 border-gold pl-3 pb-2 text-left w-full hover:opacity-80 transition-opacity"
                    >
                      <div className="font-display text-base">{e.summary || "(sem título)"}</div>
                      <div className="text-xs text-fg-muted">{formatEventTime(e)}</div>
                    </button>
                  ))}
                {events.filter((e) => {
                  const s = e.start?.dateTime || e.start?.date;
                  return s && new Date(s) >= new Date(today.toDateString());
                }).length === 0 && (
                  <div className="text-fg-muted text-sm italic">Nenhum evento próximo</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function formatEventTime(e: EventItem) {
  const start = e.start?.dateTime || e.start?.date;
  if (!start) return "";
  const d = new Date(start);
  if (e.start?.dateTime) {
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function useMonthGrid(
  year: number,
  month: number,
  events: EventItem[],
  busy: BusyWindow[]
): Array<{ iso: string; isBusy: boolean; events: EventItem[] } | null> {
  return useMemo(() => {
    const days: Array<{ iso: string; isBusy: boolean; events: EventItem[] } | null> = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const leadingEmpty = firstDay.getDay(); // 0 = domingo

    for (let i = 0; i < leadingEmpty; i++) {
      days.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const d = new Date(year, month, day);
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayEvents = events.filter((e) => {
        const s = e.start?.dateTime || e.start?.date;
        if (!s) return false;
        return s.slice(0, 10) === iso;
      });
      const isBusy =
        dayEvents.length > 0 ||
        busy.some((b) => {
          if (!b.start || !b.end) return false;
          const bs = new Date(b.start).toISOString().slice(0, 10);
          const be = new Date(b.end).toISOString().slice(0, 10);
          return iso >= bs && iso <= be;
        });
      days.push({ iso, isBusy, events: dayEvents });
    }

    return days;
  }, [year, month, events, busy]);
}
