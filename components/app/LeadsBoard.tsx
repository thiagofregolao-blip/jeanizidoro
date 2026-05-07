"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AttendModal from "./AttendModal";

type ContactCategory = "UNKNOWN" | "CLIENT" | "SUPPLIER" | "TEAM" | "FAMILY" | "PARTNER" | "OTHER";

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

type ConversationItem = {
  contactId: string;
  name: string | null;
  phone: string;
  category: ContactCategory;
  categoryConfidence: string | null;
  categoryReason: string | null;
  conversationId: string;
  lastMsgAt: string;
  lastMsg: { preview: string; fromContact: boolean; sender: string; createdAt: string } | null;
  waitingDays: number;
  waitingHours: number;
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
  FINISHED: "Finalizado",
};

function getPhaseLabel(l: Lead): string {
  if (l.status && PHASE_LABEL[l.status] && l.status !== "NEW") return PHASE_LABEL[l.status];
  if (qualificationPct(l) >= 60) return "Qualificado";
  return "Novo";
}

type MainTab = "EVENTS" | "SUPPLIER" | "FAMILY" | "PARTNER" | "TEAM" | "OTHER";
type EventSubTab = "HOT" | "WARM" | "COLD" | "IN_SERVICE" | "WON" | "FINISHED";

const MAIN_TABS: {
  key: MainTab;
  label: string;
  emoji: string;
  accent: string;
  dropCategory: ContactCategory;
}[] = [
  { key: "EVENTS", label: "Festas e Eventos", emoji: "🎉", accent: "text-gold border-gold/60", dropCategory: "CLIENT" },
  { key: "SUPPLIER", label: "Fornecedores", emoji: "👷", accent: "text-blue-400 border-blue-500/50", dropCategory: "SUPPLIER" },
  { key: "FAMILY", label: "Família", emoji: "👨‍👩‍👧", accent: "text-pink-400 border-pink-500/50", dropCategory: "FAMILY" },
  { key: "PARTNER", label: "Parcerias", emoji: "🤝", accent: "text-purple-400 border-purple-500/50", dropCategory: "PARTNER" },
  { key: "TEAM", label: "Equipe", emoji: "🧑‍💼", accent: "text-cyan-400 border-cyan-500/50", dropCategory: "TEAM" },
  { key: "OTHER", label: "Outros", emoji: "📩", accent: "text-fg-muted border-line", dropCategory: "OTHER" },
];

const EVENT_SUB_TABS: { key: EventSubTab; label: string; emoji: string; accent: string }[] = [
  { key: "HOT", label: "Quentes", emoji: "🔥", accent: "text-red-400 border-red-500/50" },
  { key: "WARM", label: "Mornos", emoji: "🌡️", accent: "text-amber-400 border-amber-500/50" },
  { key: "COLD", label: "Frios", emoji: "❄️", accent: "text-blue-400 border-blue-500/50" },
  { key: "IN_SERVICE", label: "Em Atendimento", emoji: "✅", accent: "text-gold border-gold/60" },
  { key: "WON", label: "Fechados", emoji: "✓", accent: "text-green-400 border-green-500/50" },
  { key: "FINISHED", label: "Finalizados", emoji: "🏁", accent: "text-fg-muted border-line" },
];

function bucketFor(l: Lead): EventSubTab {
  if (l.status === "FINISHED") return "FINISHED";
  if (l.status === "WON") return "WON";
  if (["IN_SERVICE", "PROPOSAL_SENT", "CONTRACT_SENT"].includes(l.status)) return "IN_SERVICE";
  return l.temperature;
}

type SortKey = "recent" | "eventDate" | "temperature" | "qualification";

export default function LeadsBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [convItems, setConvItems] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("EVENTS");
  const [eventSubTab, setEventSubTab] = useState<EventSubTab>("HOT");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [newAttendOpen, setNewAttendOpen] = useState(false);
  const [finishingId, setFinishingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [draggingContactId, setDraggingContactId] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<MainTab | null>(null);

  const loadLeads = useCallback(async () => {
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeads(data.leads || []);
  }, []);

  const loadCategory = useCallback(async (cat: ContactCategory) => {
    const res = await fetch(`/api/conversations/by-category?category=${cat}`);
    const data = await res.json();
    setConvItems(data.items || []);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (mainTab === "EVENTS") {
        await loadLeads();
      } else {
        const cat = MAIN_TABS.find((t) => t.key === mainTab)?.dropCategory;
        if (cat) await loadCategory(cat);
      }
    } catch (e) {
      console.error("LeadsBoard refresh failed", e);
    } finally {
      setLoading(false);
    }
  }, [mainTab, loadLeads, loadCategory]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  // counts pra mostrar badge na aba
  const [counts, setCounts] = useState<Record<MainTab, number>>({
    EVENTS: 0,
    SUPPLIER: 0,
    FAMILY: 0,
    PARTNER: 0,
    TEAM: 0,
    OTHER: 0,
  });

  useEffect(() => {
    // sempre puxa contagens em paralelo (independente da aba ativa)
    async function loadCounts() {
      try {
        const [leadsRes, ...catRes] = await Promise.all([
          fetch("/api/leads").then((r) => r.json()),
          ...MAIN_TABS.filter((t) => t.key !== "EVENTS").map((t) =>
            fetch(`/api/conversations/by-category?category=${t.dropCategory}`).then((r) => r.json())
          ),
        ]);
        const newCounts: Record<MainTab, number> = {
          EVENTS: (leadsRes.leads || []).filter((l: Lead) => l.status !== "FINISHED" && l.status !== "WON" && l.status !== "LOST").length,
          SUPPLIER: 0, FAMILY: 0, PARTNER: 0, TEAM: 0, OTHER: 0,
        };
        const cats = MAIN_TABS.filter((t) => t.key !== "EVENTS");
        cats.forEach((t, i) => {
          newCounts[t.key] = (catRes[i]?.items || []).length;
        });
        setCounts(newCounts);
      } catch {}
    }
    loadCounts();
    const t = setInterval(loadCounts, 30000);
    return () => clearInterval(t);
  }, []);

  // ─────────── handlers de Lead (Atender / Finalizar / Resetar) ───────────
  async function resetLead(l: Lead) {
    if (
      !confirm(
        `RESETAR atendimento de ${l.contact.name || formatPhone(l.contact.phone)}?\n\n⚠️ APAGA todas as mensagens, lead, dossiê e perfil.\nMarina vai tratar como cliente NOVO. Não dá pra desfazer.`
      )
    )
      return;
    setResettingId(l.id);
    try {
      const res = await fetch(`/api/leads/${l.id}/reset`, { method: "POST" });
      if (!res.ok) throw new Error("falhou");
      await refresh();
    } catch {
      alert("Erro ao resetar.");
    } finally {
      setResettingId(null);
    }
  }

  async function finishLead(l: Lead) {
    if (!confirm(`Finalizar atendimento de ${l.contact.name || formatPhone(l.contact.phone)}?`)) return;
    setFinishingId(l.id);
    try {
      const res = await fetch(`/api/leads/${l.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FINISHED" }),
      });
      if (!res.ok) throw new Error("falhou");
      await refresh();
    } catch {
      alert("Erro ao finalizar.");
    } finally {
      setFinishingId(null);
    }
  }

  // ─────────── drag-drop pra reclassificar ───────────
  function onCardDragStart(e: React.DragEvent, contactId: string) {
    e.dataTransfer.setData("contactId", contactId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingContactId(contactId);
  }
  function onCardDragEnd() {
    setDraggingContactId(null);
    setDragOverTab(null);
  }
  function onTabDragOver(e: React.DragEvent, tab: MainTab) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverTab(tab);
  }
  function onTabDragLeave() {
    setDragOverTab(null);
  }
  async function onTabDrop(e: React.DragEvent, tab: MainTab) {
    e.preventDefault();
    setDragOverTab(null);
    const contactId = e.dataTransfer.getData("contactId");
    if (!contactId) return;
    const targetCategory = MAIN_TABS.find((t) => t.key === tab)?.dropCategory;
    if (!targetCategory) return;
    try {
      await fetch(`/api/contacts/${contactId}/category`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: targetCategory }),
      });
      await refresh();
    } catch {
      alert("Erro ao mover.");
    }
  }

  // ─────────── filtros / ordenação ───────────
  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byTab = leads.filter((l) => bucketFor(l) === eventSubTab);
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
      if (sortBy === "recent") return new Date(b.conversation.lastMsgAt).getTime() - new Date(a.conversation.lastMsgAt).getTime();
      if (sortBy === "eventDate") {
        const ad = a.eventDate ? new Date(a.eventDate).getTime() : Infinity;
        const bd = b.eventDate ? new Date(b.eventDate).getTime() : Infinity;
        return ad - bd;
      }
      if (sortBy === "temperature") {
        const order = { HOT: 0, WARM: 1, COLD: 2 };
        return order[a.temperature] - order[b.temperature];
      }
      if (sortBy === "qualification") return qualificationPct(b) - qualificationPct(a);
      return 0;
    });
    return sorted;
  }, [leads, eventSubTab, search, sortBy]);

  const filteredConvs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return convItems;
    return convItems.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.lastMsg?.preview.toLowerCase().includes(q)
    );
  }, [convItems, search]);

  const subCounts = useMemo(() => {
    const c: Record<EventSubTab, number> = { HOT: 0, WARM: 0, COLD: 0, IN_SERVICE: 0, WON: 0, FINISHED: 0 };
    for (const l of leads) c[bucketFor(l)]++;
    return c;
  }, [leads]);

  return (
    <>
      {/* Top bar */}
      <div className="flex flex-col lg:flex-row gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone, evento ou local..."
          className="flex-1 bg-bg-soft border border-line px-4 py-3 text-fg outline-none focus:border-gold transition-colors"
        />
        {mainTab === "EVENTS" && (
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="bg-bg-soft border border-line px-4 py-3 text-fg outline-none focus:border-gold cursor-pointer"
          >
            <option value="recent">Recentes primeiro</option>
            <option value="eventDate">Data do evento</option>
            <option value="temperature">Temperatura</option>
            <option value="qualification">% Qualificação</option>
          </select>
        )}
        <button
          onClick={() => setNewAttendOpen(true)}
          className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-6 py-3 hover:bg-fg transition-colors whitespace-nowrap"
        >
          + Novo Atendimento
        </button>
      </div>

      {/* Abas principais */}
      <div className="flex gap-1 border-b border-line mb-6 overflow-x-auto">
        {MAIN_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            onDragOver={(e) => onTabDragOver(e, t.key)}
            onDragLeave={onTabDragLeave}
            onDrop={(e) => onTabDrop(e, t.key)}
            className={`flex items-center gap-2 px-5 py-3 text-xs uppercase tracking-[0.2em] border-b-2 transition-colors whitespace-nowrap ${
              mainTab === t.key
                ? `${t.accent} border-current`
                : "text-fg-muted border-transparent hover:text-fg"
            } ${dragOverTab === t.key ? "bg-gold/20 border-gold border-2" : ""}`}
          >
            <span className="text-base">{t.emoji}</span>
            <span>{t.label}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${mainTab === t.key ? "bg-current/10" : "bg-bg-soft text-fg-muted"}`}>
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Sub-abas (apenas para EVENTS) */}
      {mainTab === "EVENTS" && (
        <div className="flex gap-1 mb-6 overflow-x-auto">
          {EVENT_SUB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setEventSubTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-[10px] uppercase tracking-[0.2em] border transition-colors whitespace-nowrap ${
                eventSubTab === t.key
                  ? `${t.accent} bg-bg-soft`
                  : "text-fg-muted border-line hover:text-fg"
              }`}
            >
              <span>{t.emoji}</span>
              <span>{t.label}</span>
              <span className="text-[9px]">{subCounts[t.key]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Conteúdo */}
      {loading ? (
        <div className="text-fg-muted py-12 text-center">Carregando...</div>
      ) : mainTab === "EVENTS" ? (
        // ───── EVENTS: Leads (mantém estrutura antiga) ─────
        filteredLeads.length === 0 ? (
          <div className="luxury-glass p-16 rounded-sm text-center">
            <div className="text-5xl mb-4 opacity-40">{EVENT_SUB_TABS.find((t) => t.key === eventSubTab)?.emoji}</div>
            <div className="text-fg-muted text-sm">
              {search ? "Nenhum lead encontrado" : `Nenhum lead em "${EVENT_SUB_TABS.find((t) => t.key === eventSubTab)?.label}"`}
            </div>
          </div>
        ) : (
          <div className="border border-line rounded-sm overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-4 bg-bg-soft px-6 py-3 text-[10px] tracking-[0.3em] uppercase text-fg-muted">
              <div className="col-span-3">Cliente</div>
              <div className="col-span-3">Evento</div>
              <div className="col-span-2">Convidados / Local</div>
              <div className="col-span-2">Qualificação</div>
              <div className="col-span-2 text-right">Ações</div>
            </div>
            <div className="divide-y divide-line">
              {filteredLeads.map((l) => {
                const pct = qualificationPct(l);
                const waUrl = `https://wa.me/${l.contact.phone.replace(/\D/g, "")}`;
                const humanTakenOver = l.conversation.status === "HANDLED_BY_HUMAN";
                const daysSince = Math.floor((Date.now() - new Date(l.conversation.lastMsgAt).getTime()) / (24 * 3600 * 1000));
                const stalledClass =
                  daysSince > 3
                    ? "text-red-400 border-red-500/40 bg-red-500/10"
                    : daysSince >= 1
                    ? "text-amber-400 border-amber-500/40 bg-amber-500/10"
                    : "";
                const showStalled = daysSince >= 1 && ["NEW", "QUALIFIED", "IN_SERVICE"].includes(l.status) && ["HOT", "WARM"].includes(l.temperature);
                const isDragging = draggingContactId === l.contact.id;
                return (
                  <div
                    key={l.id}
                    draggable
                    onDragStart={(e) => onCardDragStart(e, l.contact.id)}
                    onDragEnd={onCardDragEnd}
                    className={`grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 hover:bg-bg-soft transition-all group cursor-move ${
                      isDragging ? "opacity-40 scale-95" : ""
                    }`}
                    title="Arraste pra outra aba pra mudar a categoria"
                  >
                    <div className="col-span-3 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-display text-lg truncate group-hover:text-gold transition-colors">
                          {l.contact.name || formatPhone(l.contact.phone)}
                        </div>
                        {humanTakenOver && (
                          <span title="Jean está na conversa" className="text-[9px] tracking-widest uppercase text-gold shrink-0">
                            👤 manual
                          </span>
                        )}
                        {showStalled && (
                          <span className={`text-[9px] tracking-widest uppercase border px-2 py-0.5 ${stalledClass}`}>
                            ⏱ {daysSince}d
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-fg-muted truncate">{formatPhone(l.contact.phone)}</div>
                    </div>
                    <div className="col-span-3 min-w-0">
                      {l.eventType ? (
                        <>
                          <div className="text-gold text-sm uppercase tracking-wider truncate">{l.eventType}</div>
                          <div className="text-xs text-fg-muted">
                            {l.eventDate
                              ? new Date(l.eventDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
                              : "sem data"}
                            {" · "}
                            {getPhaseLabel(l)}
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-fg-muted italic">(sem dados)</div>
                      )}
                    </div>
                    <div className="col-span-2 min-w-0">
                      <div className="text-sm">{l.guestCount ? `${l.guestCount} pax` : "—"}</div>
                      <div className="text-xs text-fg-muted truncate">{l.location || "local a definir"}</div>
                    </div>
                    <div className="col-span-2 min-w-0 flex flex-col justify-center">
                      <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-fg-muted mb-1">
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <div className="h-1 bg-line rounded-full overflow-hidden">
                        <div className="h-full bg-gold transition-all duration-700" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
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
                      {l.status !== "FINISHED" && l.status !== "WON" && l.status !== "LOST" && (
                        <button
                          onClick={() => finishLead(l)}
                          disabled={finishingId === l.id}
                          title="Finalizar atendimento"
                          className="text-xs uppercase tracking-[0.2em] border border-line text-fg-muted hover:text-fg hover:border-fg/40 px-3 py-2 transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          {finishingId === l.id ? "..." : "🏁"}
                        </button>
                      )}
                      <button
                        onClick={() => resetLead(l)}
                        disabled={resettingId === l.id}
                        title="Resetar atendimento (apaga tudo, vira cliente novo)"
                        className="text-xs uppercase tracking-[0.2em] border border-red-500/30 text-red-400/80 hover:bg-red-500/10 hover:border-red-500/60 px-3 py-2 transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        {resettingId === l.id ? "..." : "🔄"}
                      </button>
                    </div>
                    {l.summary && <div className="md:col-span-12 text-xs text-fg-muted/70 italic md:pl-0 -mt-2">{l.summary}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )
      ) : // ───── Outras categorias: cards de conversation ─────
      filteredConvs.length === 0 ? (
        <div className="luxury-glass p-16 rounded-sm text-center">
          <div className="text-5xl mb-4 opacity-40">{MAIN_TABS.find((t) => t.key === mainTab)?.emoji}</div>
          <div className="text-fg-muted text-sm">Nenhuma conversa nesta categoria ainda</div>
          <div className="text-fg-muted/60 text-xs mt-2">
            A Marina classifica automaticamente. Você pode arrastar conversas de outras abas pra cá.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredConvs.map((c) => {
            const waUrl = `https://wa.me/${c.phone.replace(/\D/g, "")}`;
            const isDragging = draggingContactId === c.contactId;
            const waitingLabel = c.lastMsg?.fromContact
              ? c.waitingDays > 0
                ? `⏱ ${c.waitingDays}d aguardando você`
                : c.waitingHours > 0
                ? `⏱ ${c.waitingHours}h aguardando você`
                : "⏱ aguardando você"
              : null;
            return (
              <div
                key={c.contactId}
                draggable
                onDragStart={(e) => onCardDragStart(e, c.contactId)}
                onDragEnd={onCardDragEnd}
                className={`luxury-glass p-4 rounded-sm border border-line hover:border-gold/40 transition-all cursor-move ${
                  isDragging ? "opacity-40 scale-95" : ""
                }`}
                title="Arraste pra outra aba pra mudar a categoria"
              >
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-lg truncate">{c.name || formatPhone(c.phone)}</div>
                    <div className="text-xs text-fg-muted">{formatPhone(c.phone)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {waitingLabel && (
                      <span className="text-[10px] uppercase tracking-widest border border-amber-500/40 text-amber-400 bg-amber-500/10 px-2 py-1">
                        {waitingLabel}
                      </span>
                    )}
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener"
                      className="text-[10px] uppercase tracking-widest border border-green-500/40 text-green-400 hover:bg-green-500/10 px-3 py-1 transition-colors"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
                {c.lastMsg && (
                  <div className="text-sm text-fg-muted mt-2">
                    <span className="text-[9px] uppercase tracking-widest text-fg-muted/60 mr-2">
                      {c.lastMsg.fromContact ? "✉️ Última msg dele:" : "💬 Última msg sua:"}
                    </span>
                    <span className="italic">{c.lastMsg.preview}</span>
                  </div>
                )}
                {c.categoryReason && (
                  <div className="mt-2 text-[10px] text-fg-muted/70 italic">
                    🤖 Marina classificou ({c.categoryConfidence === "high" ? "alta" : "baixa"} confiança): {c.categoryReason}
                  </div>
                )}
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
            refresh();
          }}
        />
      )}
      {newAttendOpen && (
        <AttendModal
          isNew
          onClose={() => setNewAttendOpen(false)}
          onUpdated={() => {
            setNewAttendOpen(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
