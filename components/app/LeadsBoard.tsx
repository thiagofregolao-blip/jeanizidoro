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
  summary: string | null;
  contact: { id: string; name: string | null; phone: string };
  conversation: { id: string; lastMsgAt: string };
};

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
                  {items.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => setOpenLead(l)}
                      className="w-full text-left luxury-glass p-4 rounded-sm hover:border-gold/40 transition-all group"
                    >
                      <div className="font-display text-lg group-hover:text-gold transition-colors">
                        {l.contact.name || l.contact.phone}
                      </div>
                      {l.eventType && (
                        <div className="text-xs text-gold mt-1 uppercase tracking-wider">
                          {l.eventType}
                          {l.eventDate && ` • ${new Date(l.eventDate).toLocaleDateString("pt-BR")}`}
                        </div>
                      )}
                      {l.guestCount && (
                        <div className="text-xs text-fg-muted mt-1">{l.guestCount} convidados</div>
                      )}
                      {l.location && (
                        <div className="text-xs text-fg-muted truncate">{l.location}</div>
                      )}
                      {l.summary && (
                        <div className="text-xs text-fg-muted/80 mt-2 line-clamp-2 italic">
                          {l.summary}
                        </div>
                      )}
                    </button>
                  ))}
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
