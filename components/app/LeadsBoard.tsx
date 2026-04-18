"use client";

import { useEffect, useState } from "react";
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
  contact: { id: string; name: string | null; phone: string };
  conversation: { id: string; lastMsgAt: string; status?: string };
};

function formatPhone(phone: string): string {
  // 5511999999999 → +55 (11) 99999-9999
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

const PHASES = [
  { key: "NEW", label: "Novo" },
  { key: "QUALIFIED", label: "Qualificado" },
  { key: "IN_SERVICE", label: "Em atendimento" },
  { key: "PROPOSAL_SENT", label: "Proposta" },
  { key: "CONTRACT_SENT", label: "Contrato" },
  { key: "WON", label: "Fechado" },
];

function getPhaseIndex(l: Lead): number {
  if (l.status === "WON") return 5;
  if (l.status === "CONTRACT_SENT") return 4;
  if (l.status === "PROPOSAL_SENT") return 3;
  if (l.status === "IN_SERVICE") return 2;
  if (qualificationPct(l) >= 60) return 1;
  return 0;
}

const COLUMNS: { key: Lead["temperature"] | "IN_SERVICE"; label: string; emoji: string; tone: string }[] = [
  { key: "HOT", label: "Quentes", emoji: "🔥", tone: "border-red-500/30" },
  { key: "WARM", label: "Mornos", emoji: "🌡️", tone: "border-amber-500/30" },
  { key: "COLD", label: "Frios", emoji: "❄️", tone: "border-blue-500/30" },
  { key: "IN_SERVICE", label: "Em Atendimento", emoji: "✅", tone: "border-gold/40" },
];

export default function LeadsBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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

  const filtered = leads.filter((l) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.contact.name?.toLowerCase().includes(q) ||
      l.contact.phone.includes(q) ||
      l.eventType?.toLowerCase().includes(q)
    );
  });

  function colFor(l: Lead): string {
    if (l.status === "IN_SERVICE" || l.status === "PROPOSAL_SENT" || l.status === "CONTRACT_SENT") return "IN_SERVICE";
    return l.temperature;
  }

  return (
    <>
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone ou tipo de evento..."
          className="flex-1 bg-bg-soft border border-line px-4 py-3 text-fg outline-none focus:border-gold transition-colors"
        />
        <button
          onClick={() => setNewAttendOpen(true)}
          className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-6 py-3 hover:bg-fg transition-colors"
        >
          + Novo Atendimento
        </button>
      </div>

      {loading ? (
        <div className="text-fg-muted">Carregando...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const items = filtered.filter((l) => colFor(l) === col.key);
            return (
              <div key={col.key} className={`border-t-2 ${col.tone} bg-bg-soft p-4 rounded-sm min-h-[400px]`}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm tracking-widest uppercase text-fg-muted">
                    {col.emoji} {col.label}
                  </h3>
                  <span className="text-xs text-fg-muted">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.length === 0 && (
                    <div className="text-xs text-fg-muted/60 italic">Vazio</div>
                  )}
                  {items.map((l) => {
                    const pct = qualificationPct(l);
                    const phaseIdx = getPhaseIndex(l);
                    const waUrl = `https://wa.me/${l.contact.phone.replace(/\D/g, "")}`;
                    const humanTakenOver = l.conversation.status === "HANDLED_BY_HUMAN";
                    return (
                      <div key={l.id} className="luxury-glass p-4 rounded-sm hover:border-gold/40 transition-all group">
                        <button onClick={() => setOpenLead(l)} className="w-full text-left block">
                          <div className="flex items-center justify-between">
                            <div className="font-display text-lg group-hover:text-gold transition-colors">
                              {l.contact.name || formatPhone(l.contact.phone)}
                            </div>
                            {humanTakenOver && (
                              <span title="Jean está na conversa" className="text-[9px] tracking-widest uppercase text-gold">👤 manual</span>
                            )}
                          </div>
                          <div className="text-[10px] text-fg-muted mt-0.5">{formatPhone(l.contact.phone)}</div>

                          {l.eventType && (
                            <div className="text-xs text-gold mt-2 uppercase tracking-wider">
                              {l.eventType}
                              {l.eventDate && ` • ${new Date(l.eventDate).toLocaleDateString("pt-BR")}`}
                            </div>
                          )}
                          {l.guestCount && (
                            <div className="text-xs text-fg-muted mt-0.5">{l.guestCount} convidados</div>
                          )}
                          {l.location && (
                            <div className="text-xs text-fg-muted truncate">{l.location}</div>
                          )}
                          {l.summary && (
                            <div className="text-xs text-fg-muted/80 mt-2 line-clamp-2 italic">
                              {l.summary}
                            </div>
                          )}

                          {/* Termômetro de qualificação */}
                          <div className="mt-3">
                            <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-fg-muted mb-1">
                              <span>Qualificação</span>
                              <span>{Math.round(pct)}%</span>
                            </div>
                            <div className="h-1 bg-line rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-gold to-gold transition-all duration-700"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          {/* Fases do funil */}
                          <div className="flex gap-1 mt-3">
                            {PHASES.map((p, i) => (
                              <div
                                key={p.key}
                                title={p.label}
                                className={`flex-1 h-1 rounded-full ${
                                  i <= phaseIdx ? "bg-gold" : "bg-line"
                                }`}
                              />
                            ))}
                          </div>
                          <div className="text-[9px] text-fg-muted mt-1 tracking-widest uppercase">
                            {PHASES[phaseIdx]?.label}
                          </div>
                        </button>

                        {/* Ações rápidas */}
                        <div className="flex gap-2 mt-3 pt-3 border-t border-line">
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener"
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 text-[10px] tracking-widest uppercase text-center py-2 border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors"
                          >
                            📱 WhatsApp
                          </a>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenLead(l);
                            }}
                            className="flex-1 text-[10px] tracking-widest uppercase py-2 border border-gold/40 text-gold hover:bg-gold/10 transition-colors"
                          >
                            Atender
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
