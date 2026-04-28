"use client";

import { useEffect, useMemo, useState } from "react";
import AttendModal from "./AttendModal";

type Lead = {
  id: string;
  temperature: "HOT" | "WARM" | "COLD";
  status: string;
  eventType: string | null;
  eventDate: string | null;
  guestCount: number | null;
  location: string | null;
  budget: string | null;
  style?: string | null;
  summary: string | null;
  attendCode?: string | null;
  contact: { id: string; name: string | null; phone: string };
  conversation: { id: string; lastMsgAt: string; status?: string };
};

function formatPhone(phone: string): string {
  const p = phone.replace(/\D/g, "");
  if (p.length === 13) return `+${p.slice(0, 2)} (${p.slice(2, 4)}) ${p.slice(4, 9)}-${p.slice(9)}`;
  if (p.length === 12) return `+${p.slice(0, 2)} (${p.slice(2, 4)}) ${p.slice(4, 8)}-${p.slice(8)}`;
  if (p.length === 11) return `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}`;
  return phone;
}

function qualificationPct(l: Lead): number {
  let filled = 0;
  if (l.eventType) filled++;
  if (l.eventDate) filled++;
  if (l.guestCount) filled++;
  if (l.location) filled++;
  if (l.style) filled++;
  return (filled / 5) * 100;
}

const PHASE_LABEL: Record<string, string> = {
  NEW: "Novo",
  QUALIFIED: "Qualificado",
  IN_SERVICE: "Em atendimento",
  PROPOSAL_SENT: "Proposta",
  CONTRACT_SENT: "Contrato",
  WON: "Fechado",
  LOST: "Perdido",
};

function getPhaseLabel(l: Lead): string {
  if (l.status && PHASE_LABEL[l.status] && l.status !== "NEW") return PHASE_LABEL[l.status];
  if (qualificationPct(l) >= 60) return "Qualificado";
  return "Novo";
}

type TabKey = "HOT" | "WARM" | "COLD" | "IN_SERVICE" | "WON";

const TABS: { key: TabKey; label: string; emoji: string; accent: string }[] = [
  { key: "HOT", label: "Quentes", emoji: "🔥", accent: "text-red-400 border-red-500/50" },
  { key: "WARM", label: "Mornos", emoji: "🌡️", accent: "text-amber-400 border-amber-500/50" },
  { key: "COLD", label: "Frios", emoji: "❄️", accent: "text-blue-400 border-blue-500/50" },
  { key: "IN_SERVICE", label: "Em Atendimento", emoji: "✅", accent: "text-gold border-gold/60" },
  { key: "WON", label: "Fechados", emoji: "✓", accent: "text-green-400 border-green-500/50" },
];

function bucketFor(l: Lead): TabKey {
  if (l.status === "WON") return "WON";
  if (["IN_SERVICE", "PROPOSAL_SENT", "CONTRACT_SENT"].includes(l.status)) return "IN_SERVICE";
  return l.temperature;
}

type SortKey = "recent" | "eventDate" | "temperature" | "qualification";

export default function LeadsBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("HOT");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [newAttendOpen, setNewAttendOpen] = useState(false);

  async function load() {
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeads(data.leads || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { HOT: 0, WARM: 0, COLD: 0, IN_SERVICE: 0, WON: 0 };
    for (const l of leads) c[bucketFor(l)]++;
    return c;
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byTab = leads.filter((l) => bucketFor(l) === activeTab);
    const bySearch = !q
      ? byTab
      : byTab.filter(
          (l) =>
            l.contact.name?.toLowerCase().includes(q) ||
            l.contact.phone.includes(q) ||
            l.eventType?.toLowerCase().includes(q) ||
            l.location?.toLowerCase().includes(q)
        );
    const sorted = [...bySearch].sort((a, b) => {
      if (sortBy === "recent") {
        return new Date(b.conversation.lastMsgAt).getTime() - new Date(a.conversation.lastMsgAt).getTime();
      }
      if (sortBy === "eventDate") {
        const ad = a.eventDate ? new Date(a.eventDate).getTime() : Infinity;
        const bd = b.eventDate ? new Date(b.eventDate).getTime() : Infinity;
        return ad - bd;
      }
      if (sortBy === "temperature") {
        const order = { HOT: 0, WARM: 1, COLD: 2 };
        return order[a.temperature] - order[b.temperature];
      }
      if (sortBy === "qualification") {
        return qualificationPct(b) - qualificationPct(a);
      }
      return 0;
    });
    return sorted;
  }, [leads, activeTab, search, sortBy]);

  return (
    <>
      {/* Top bar: busca + ações + sort */}
      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone, tipo de evento ou local..."
          className="flex-1 bg-bg-soft border border-line px-4 py-3 text-fg outline-none focus:border-gold transition-colors"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="bg-bg-soft border border-line px-4 py-3 text-fg outline-none focus:border-gold cursor-pointer"
        >
          <option value="recent">Recentes primeiro</option>
          <option value="eventDate">Data do evento (+ próxima)</option>
          <option value="temperature">Temperatura</option>
          <option value="qualification">% Qualificação</option>
        </select>
        <button
          onClick={() => setNewAttendOpen(true)}
          className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-6 py-3 hover:bg-fg transition-colors whitespace-nowrap"
        >
          + Novo Atendimento
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-line mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.2em] border-b-2 transition-colors whitespace-nowrap ${
              activeTab === t.key
                ? `${t.accent} border-current`
                : "text-fg-muted border-transparent hover:text-fg"
            }`}
          >
            <span className="text-base">{t.emoji}</span>
            <span>{t.label}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                activeTab === t.key ? "bg-current/10" : "bg-bg-soft text-fg-muted"
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-fg-muted py-12 text-center">Carregando leads...</div>
      ) : filtered.length === 0 ? (
        <div className="luxury-glass p-16 rounded-sm text-center">
          <div className="text-5xl mb-4 opacity-40">{TABS.find((t) => t.key === activeTab)?.emoji}</div>
          <div className="text-fg-muted text-sm">
            {search
              ? "Nenhum lead encontrado com esse filtro"
              : `Nenhum lead em "${TABS.find((t) => t.key === activeTab)?.label}"`}
          </div>
        </div>
      ) : (
        <div className="border border-line rounded-sm overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 bg-bg-soft px-6 py-3 text-[10px] tracking-[0.3em] uppercase text-fg-muted">
            <div className="col-span-3">Cliente</div>
            <div className="col-span-3">Evento</div>
            <div className="col-span-2">Convidados / Local</div>
            <div className="col-span-2">Qualificação</div>
            <div className="col-span-2 text-right">Ações</div>
          </div>

          {/* Linhas */}
          <div className="divide-y divide-line">
            {filtered.map((l) => {
              const pct = qualificationPct(l);
              const waUrl = `https://wa.me/${l.contact.phone.replace(/\D/g, "")}`;
              const humanTakenOver = l.conversation.status === "HANDLED_BY_HUMAN";
              const daysSince = Math.floor(
                (Date.now() - new Date(l.conversation.lastMsgAt).getTime()) / (24 * 3600 * 1000)
              );
              const stalledClass =
                daysSince > 3
                  ? "text-red-400 border-red-500/40 bg-red-500/10"
                  : daysSince >= 1
                  ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
                  : "";
              const showStalled =
                daysSince >= 1 &&
                ["NEW", "QUALIFIED", "IN_SERVICE"].includes(l.status) &&
                ["HOT", "WARM"].includes(l.temperature);
              return (
                <div
                  key={l.id}
                  className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 hover:bg-bg-soft transition-colors group"
                >
                  {/* Cliente */}
                  <div className="col-span-3 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-display text-lg truncate group-hover:text-gold transition-colors">
                        {l.contact.name || formatPhone(l.contact.phone)}
                      </div>
                      {humanTakenOver && (
                        <span
                          title="Jean está na conversa"
                          className="text-[9px] tracking-widest uppercase text-gold shrink-0"
                        >
                          👤 manual
                        </span>
                      )}
                      {showStalled && (
                        <span
                          className={`text-[9px] tracking-widest uppercase border px-2 py-0.5 ${stalledClass}`}
                          title={`${daysSince} dia(s) sem resposta`}
                        >
                          ⏱ {daysSince}d
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-fg-muted truncate">{formatPhone(l.contact.phone)}</div>
                  </div>

                  {/* Evento */}
                  <div className="col-span-3 min-w-0">
                    {l.eventType ? (
                      <>
                        <div className="text-gold text-sm uppercase tracking-wider truncate">
                          {l.eventType}
                        </div>
                        <div className="text-xs text-fg-muted">
                          {l.eventDate
                            ? new Date(l.eventDate).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "sem data"}
                          {" · "}
                          {getPhaseLabel(l)}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-fg-muted italic">(sem dados)</div>
                    )}
                  </div>

                  {/* Convidados / Local */}
                  <div className="col-span-2 min-w-0">
                    <div className="text-sm">{l.guestCount ? `${l.guestCount} pax` : "—"}</div>
                    <div className="text-xs text-fg-muted truncate">{l.location || "local a definir"}</div>
                  </div>

                  {/* Qualificação */}
                  <div className="col-span-2 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-fg-muted mb-1">
                      <span>{Math.round(pct)}%</span>
                    </div>
                    <div className="h-1 bg-line rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener"
                      onClick={(e) => e.stopPropagation()}
                      title="Abrir no WhatsApp"
                      className="text-xs border border-green-500/40 text-green-400 hover:bg-green-500/10 w-10 h-10 flex items-center justify-center transition-colors"
                    >
                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                      </svg>
                    </a>
                    <button
                      onClick={() => setOpenLead(l)}
                      className="text-xs uppercase tracking-[0.2em] border border-gold/40 text-gold hover:bg-gold/10 px-4 py-2 transition-colors whitespace-nowrap"
                    >
                      Atender
                    </button>
                  </div>

                  {/* Resumo (só mobile ou em largura reduzida) */}
                  {l.summary && (
                    <div className="md:col-span-12 text-xs text-fg-muted/70 italic md:pl-0 -mt-2">
                      {l.summary}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {openLead && (
        <AttendModal
          lead={openLead}
          onClose={() => setOpenLead(null)}
          onUpdated={() => {
            setOpenLead(null);
            load();
          }}
        />
      )}
      {newAttendOpen && (
        <AttendModal
          isNew
          onClose={() => setNewAttendOpen(false)}
          onUpdated={() => {
            setNewAttendOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}
