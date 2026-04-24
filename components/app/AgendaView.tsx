"use client";

import { useEffect, useState } from "react";
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

export default function AgendaView() {
  const params = useSearchParams();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [busy, setBusy] = useState<BusyWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const justConnected = params.get("connected") === "1";
  const urlErr = params.get("error");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/calendar/events");
    const d = await res.json();
    if (d.error) {
      setErr(d.error);
      setConnected(false);
    } else {
      setEvents(d.events || []);
      setBusy(d.busy || []);
      setConnected(true);
      setErr(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const needsConnect = !connected && err?.toLowerCase().includes("não conectado");

  if (loading) return <div className="text-fg-muted">Carregando...</div>;

  if (needsConnect || urlErr) {
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
        <a
          href="/api/google/auth"
          className="inline-block bg-gold text-bg uppercase tracking-[0.3em] text-xs px-8 py-3 hover:bg-fg transition-colors"
        >
          Conectar Google Calendar
        </a>
      </div>
    );
  }

  const upcoming = events.filter((e) => {
    const start = e.start?.dateTime || e.start?.date;
    return start && new Date(start) >= new Date();
  });

  const next30 = generateNext60Days(busy, events);

  return (
    <>
      {justConnected && (
        <div className="luxury-glass p-4 rounded-sm mb-6 border-gold/40">
          <div className="text-sm text-gold">✓ Google Calendar conectado com sucesso</div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 luxury-glass p-6 rounded-sm">
          <h3 className="font-display text-2xl mb-4">Próximos 60 dias</h3>
          <div className="grid grid-cols-7 gap-2 text-center text-[10px] text-fg-muted uppercase tracking-widest mb-2">
            <div>Dom</div>
            <div>Seg</div>
            <div>Ter</div>
            <div>Qua</div>
            <div>Qui</div>
            <div>Sex</div>
            <div>Sáb</div>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {next30.map((d) => (
              <div
                key={d.iso}
                className={`aspect-square flex flex-col items-center justify-center text-sm border rounded-sm ${
                  d.isBusy
                    ? "border-red-500/30 bg-red-500/5 text-red-300"
                    : "border-line hover:border-gold/40"
                }`}
                title={d.events.map((e) => e.summary).join("; ") || "Livre"}
              >
                <div className="font-display text-base">{new Date(d.iso).getDate()}</div>
                {d.events.length > 0 && (
                  <div className="text-[8px] text-fg-muted">{d.events.length} ev</div>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-fg-muted">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border border-line rounded-sm"></span> Livre
            </span>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border border-red-500/30 bg-red-500/5 rounded-sm"></span> Ocupado
            </span>
          </div>
        </div>

        <div className="luxury-glass p-6 rounded-sm">
          <h3 className="font-display text-2xl mb-4">Próximos eventos</h3>
          <div className="space-y-3">
            {upcoming.length === 0 && <div className="text-fg-muted text-sm">Nenhum evento próximo</div>}
            {upcoming.slice(0, 10).map((e) => (
              <div key={e.id} className="border-l-2 border-gold pl-3 pb-3">
                <div className="font-display text-lg">{e.summary || "(sem título)"}</div>
                <div className="text-xs text-fg-muted">
                  {formatEventTime(e)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function formatEventTime(e: EventItem) {
  const start = e.start?.dateTime || e.start?.date;
  if (!start) return "";
  const d = new Date(start);
  const opts: Intl.DateTimeFormatOptions = e.start?.dateTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" };
  return d.toLocaleDateString("pt-BR", opts);
}

function generateNext60Days(busy: BusyWindow[], events: EventItem[]) {
  const days: { iso: string; isBusy: boolean; events: EventItem[] }[] = [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // fill leading blanks to align with week
  const dow = start.getDay();
  for (let i = 0; i < dow; i++) {
    days.push({ iso: "", isBusy: false, events: [] });
  }
  for (let i = 0; i < 56; i++) {
    const d = new Date(start.getTime() + i * 24 * 3600 * 1000);
    const iso = d.toISOString().slice(0, 10);
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
  return days.filter((d) => d.iso !== "");
}
