"use client";

import { useEffect, useRef, useState } from "react";

type Lead = {
  id: string;
  eventType: string | null;
  eventDate: string | null;
  guestCount: number | null;
  location: string | null;
  budget: string | null;
  summary: string | null;
  contact: { id: string; name: string | null; phone: string };
  conversation: { id: string };
};

type Message = {
  id: string;
  direction: "IN" | "OUT";
  sender: "CONTACT" | "AI" | "HUMAN";
  content: string;
  createdAt: string;
};

type Props = {
  lead?: Lead;
  isNew?: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

const SERVICES = [
  "Cenografia",
  "Iluminação cênica",
  "Decoração floral",
  "Mobiliário",
  "Projeto arquitetônico",
  "Coordenação no dia",
  "Identidade visual do evento",
];

export default function AttendModal({ lead, isNew, onClose, onUpdated }: Props) {
  const [meetingMode, setMeetingMode] = useState(false);
  const [step, setStep] = useState(1);
  const [tab, setTab] = useState<"atendimento" | "conversa">("atendimento");
  const [messages, setMessages] = useState<Message[]>([]);
  const [quickReply, setQuickReply] = useState("");
  const [sendingQuick, setSendingQuick] = useState(false);
  const [aiPaused, setAiPaused] = useState(false);
  const [aiPausedUntil, setAiPausedUntil] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadConversation() {
    if (!lead?.conversation.id) return;
    const res = await fetch(`/api/conversations/${lead.conversation.id}`);
    const d = await res.json();
    setMessages(d.conversation?.messages || []);
    setAiPaused(!!d.conversation?.aiPaused);
    setAiPausedUntil(d.conversation?.aiPausedUntil || null);
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
  }

  async function doAction(action: "resume_now" | "pause_indefinitely" | "pause_hours", hours?: number) {
    if (!lead?.conversation.id) return;
    await fetch(`/api/conversations/${lead.conversation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, hours }),
    });
    loadConversation();
  }

  function pauseRemainingText(): string | null {
    if (!aiPausedUntil) return null;
    const ms = new Date(aiPausedUntil).getTime() - Date.now();
    if (ms <= 0) return null;
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `IA volta em ${mins} min`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `IA volta em ${hours}h ${remainingMins}min`;
  }

  useEffect(() => {
    if (tab === "conversa") {
      loadConversation();
      const t = setInterval(loadConversation, 5000);
      return () => clearInterval(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, lead?.conversation.id]);

  async function sendQuick() {
    if (!lead?.conversation.id || !quickReply.trim()) return;
    setSendingQuick(true);
    await fetch(`/api/conversations/${lead.conversation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: quickReply }),
    });
    setQuickReply("");
    setSendingQuick(false);
    loadConversation();
  }


  // Step 1
  const [contactName, setContactName] = useState(lead?.contact.name || "");
  const [contactPhone, setContactPhone] = useState(lead?.contact.phone || "");
  const [eventType, setEventType] = useState(lead?.eventType || "");
  const [eventDate, setEventDate] = useState(
    lead?.eventDate ? lead.eventDate.slice(0, 10) : ""
  );
  const [guestCount, setGuestCount] = useState(lead?.guestCount?.toString() || "");
  const [location, setLocation] = useState(lead?.location || "");
  const [style, setStyle] = useState("");
  const [notes, setNotes] = useState(lead?.summary || "");

  // Step 2
  const [services, setServices] = useState<string[]>([]);
  const [totalValue, setTotalValue] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");

  // Step 3 / 4
  const [contractStatus, setContractStatus] = useState<"draft" | "sending" | "sent" | "error">("draft");
  const [contractResult, setContractResult] = useState<{ id?: string; publicUrl?: string; error?: string } | null>(null);
  const [sendVia, setSendVia] = useState<"whatsapp" | "email" | "both">("whatsapp");

  function toggleService(s: string) {
    setServices((arr) => (arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s]));
  }

  async function saveStep1() {
    if (lead) {
      await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "IN_SERVICE",
          eventType,
          eventDate: eventDate || null,
          guestCount: guestCount ? Number(guestCount) : null,
          location,
          style,
        }),
      });
    } else if (isNew && contactPhone) {
      await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: contactPhone, name: contactName }),
      });
    }
    setStep(2);
  }

  async function generateContract() {
    setContractStatus("sending");
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: lead?.contact.id,
          leadId: lead?.id,
          contactName,
          contactPhone,
          eventType,
          eventDate,
          guestCount: guestCount ? Number(guestCount) : undefined,
          location,
          style,
          services,
          totalValue,
          paymentTerms,
          sentVia: sendVia,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setContractStatus("error");
        setContractResult({ error: data.error || "Erro ao gerar contrato" });
        return;
      }
      setContractResult({ id: data.contract?.id, publicUrl: data.autentique?.publicUrl });
      setContractStatus("sent");
      setStep(4);
    } catch (e) {
      setContractStatus("error");
      setContractResult({ error: e instanceof Error ? e.message : "Erro" });
    }
  }

  return (
    <div className={`fixed inset-0 z-[100] bg-bg/95 ${meetingMode ? "" : "backdrop-blur-md"} overflow-y-auto`}>
      <div className={`mx-auto ${meetingMode ? "max-w-full p-12" : "max-w-4xl p-6 md:p-12"}`}>
        <div className={`luxury-glass rounded-sm ${meetingMode ? "p-12" : "p-8"}`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-line">
            <div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-gold mb-2">
                {isNew ? "Novo atendimento" : "Atendimento"}
              </div>
              <h2 className={`font-display ${meetingMode ? "text-6xl" : "text-3xl"}`}>
                {contactName || "Novo cliente"}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMeetingMode(!meetingMode)}
                className="text-xs uppercase tracking-widest border border-gold/40 text-gold px-4 py-2 hover:bg-gold hover:text-bg transition-colors"
              >
                {meetingMode ? "Sair do modo reunião" : "Modo reunião"}
              </button>
              <button onClick={onClose} className="text-fg-muted hover:text-fg text-2xl">
                ✕
              </button>
            </div>
          </div>

          {/* Tabs */}
          {lead && (
            <div className="flex gap-6 mb-6 border-b border-line">
              <button
                onClick={() => setTab("atendimento")}
                className={`pb-3 text-xs tracking-[0.3em] uppercase transition-colors ${
                  tab === "atendimento" ? "text-gold border-b-2 border-gold" : "text-fg-muted hover:text-fg"
                }`}
              >
                Atendimento
              </button>
              <button
                onClick={() => setTab("conversa")}
                className={`pb-3 text-xs tracking-[0.3em] uppercase transition-colors ${
                  tab === "conversa" ? "text-gold border-b-2 border-gold" : "text-fg-muted hover:text-fg"
                }`}
              >
                💬 Conversa (WhatsApp)
              </button>
              <a
                href={`https://wa.me/${lead.contact.phone.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener"
                className="ml-auto pb-3 text-xs tracking-[0.3em] uppercase text-green-400 hover:text-green-300"
              >
                📱 Abrir no WhatsApp →
              </a>
            </div>
          )}

          {/* Aba Conversa */}
          {tab === "conversa" && lead && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="text-xs text-fg-muted">
                  {messages.length} mensagens ·{" "}
                  {aiPaused ? (
                    <span className="text-gold">
                      🛑 IA pausada
                      {pauseRemainingText() && <> · {pauseRemainingText()}</>}
                    </span>
                  ) : (
                    <span className="text-green-400">🤖 IA ativa</span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {aiPaused ? (
                    <button
                      onClick={() => doAction("resume_now")}
                      className="text-[10px] uppercase tracking-widest border border-gold text-gold hover:bg-gold/10 px-3 py-2 transition-colors"
                    >
                      ▶ Retomar IA agora
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => doAction("pause_hours", 4)}
                        className="text-[10px] uppercase tracking-widest border border-line text-fg-muted hover:border-gold px-3 py-2 transition-colors"
                      >
                        ⏱ Pausar 4h
                      </button>
                      <button
                        onClick={() => doAction("pause_indefinitely")}
                        className="text-[10px] uppercase tracking-widest border border-line text-fg-muted hover:border-gold px-3 py-2 transition-colors"
                      >
                        🔒 Pausar até eu liberar
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div
                ref={scrollRef}
                className="border border-line rounded-sm p-4 h-[400px] overflow-y-auto space-y-3 bg-bg-soft"
              >
                {messages.length === 0 && (
                  <div className="text-fg-muted text-sm text-center py-12">Ainda sem mensagens.</div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "IN" ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[75%] p-3 rounded-sm text-sm ${
                        m.direction === "IN"
                          ? "bg-bg border border-line"
                          : m.sender === "AI"
                          ? "bg-gold/10 border border-gold/30"
                          : "bg-gold text-bg"
                      }`}
                    >
                      <div className="text-[9px] uppercase tracking-widest mb-1 opacity-60">
                        {m.sender === "AI" ? "Sofia (IA)" : m.sender === "HUMAN" ? "Jean" : "Cliente"} ·{" "}
                        {new Date(m.createdAt).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={quickReply}
                  onChange={(e) => setQuickReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendQuick()}
                  placeholder="Responder como Jean (pausa a IA automaticamente)"
                  className="flex-1 bg-transparent border border-line px-4 py-3 outline-none focus:border-gold"
                />
                <button
                  onClick={sendQuick}
                  disabled={sendingQuick || !quickReply.trim()}
                  className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-6 disabled:opacity-50"
                >
                  Enviar
                </button>
              </div>
            </div>
          )}

          {/* Stepper do atendimento */}
          {tab === "atendimento" && (
          <div className="flex items-center gap-2 mb-10">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  step >= n ? "bg-gold" : "bg-line"
                }`}
              />
            ))}
          </div>
          )}

          {tab === "atendimento" && (
          <>
          {/* Step 1 — Ficha */}
          {step === 1 && (
            <div className={`space-y-6 ${meetingMode ? "text-xl" : ""}`}>
              <h3 className={`font-display ${meetingMode ? "text-4xl" : "text-2xl"} mb-6`}>
                Ficha do Evento
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                {isNew && (
                  <>
                    <Field label="Nome do cliente" value={contactName} onChange={setContactName} big={meetingMode} />
                    <Field label="WhatsApp" value={contactPhone} onChange={setContactPhone} big={meetingMode} />
                  </>
                )}
                <Field label="Tipo de evento" value={eventType} onChange={setEventType} big={meetingMode} placeholder="casamento, aniversário..." />
                <Field label="Data" type="date" value={eventDate} onChange={setEventDate} big={meetingMode} />
                <Field label="Convidados" type="number" value={guestCount} onChange={setGuestCount} big={meetingMode} />
                <Field label="Local" value={location} onChange={setLocation} big={meetingMode} />
                <Field label="Estilo / referências" value={style} onChange={setStyle} big={meetingMode} className="md:col-span-2" />
              </div>
              <div>
                <label className="block text-[10px] tracking-[0.3em] uppercase text-fg-muted mb-2">
                  Observações
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={meetingMode ? 5 : 3}
                  className="w-full bg-transparent border border-line p-3 outline-none focus:border-gold"
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={saveStep1} className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-8 py-3 hover:bg-fg transition-colors">
                  Continuar →
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Proposta */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className={`font-display ${meetingMode ? "text-4xl" : "text-2xl"} mb-6`}>
                Proposta Comercial
              </h3>

              <div>
                <label className="block text-[10px] tracking-[0.3em] uppercase text-fg-muted mb-3">
                  Serviços inclusos
                </label>
                <div className={`grid ${meetingMode ? "grid-cols-2 gap-4" : "grid-cols-1 md:grid-cols-2 gap-2"}`}>
                  {SERVICES.map((s) => (
                    <label
                      key={s}
                      className={`flex items-center gap-3 border border-line p-3 cursor-pointer hover:border-gold/40 transition-colors ${
                        services.includes(s) ? "border-gold bg-gold/5" : ""
                      } ${meetingMode ? "text-lg p-4" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={services.includes(s)}
                        onChange={() => toggleService(s)}
                        className="accent-[var(--gold)]"
                      />
                      {s}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Field label="Valor total (R$)" value={totalValue} onChange={setTotalValue} big={meetingMode} placeholder="0,00" />
                <Field label="Condições de pagamento" value={paymentTerms} onChange={setPaymentTerms} big={meetingMode} placeholder="Ex: 30% entrada, saldo em 3x" />
              </div>

              <div className="flex justify-between gap-3 pt-4">
                <button onClick={() => setStep(1)} className="text-xs uppercase tracking-widest text-fg-muted hover:text-gold">
                  ← Voltar
                </button>
                <button onClick={() => setStep(3)} className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-8 py-3 hover:bg-fg transition-colors">
                  Gerar contrato →
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Contrato */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className={`font-display ${meetingMode ? "text-4xl" : "text-2xl"} mb-6`}>
                Contrato
              </h3>

              <div className="luxury-glass p-6 rounded-sm space-y-3 text-sm">
                <Row label="Cliente" value={contactName || "—"} />
                <Row label="WhatsApp" value={contactPhone} />
                <Row label="Evento" value={`${eventType || "—"} ${eventDate ? `em ${new Date(eventDate).toLocaleDateString("pt-BR")}` : ""}`} />
                <Row label="Convidados" value={guestCount || "—"} />
                <Row label="Local" value={location || "—"} />
                <Row label="Serviços" value={services.join(", ") || "—"} />
                <Row label="Valor" value={totalValue ? `R$ ${totalValue}` : "—"} />
                <Row label="Pagamento" value={paymentTerms || "—"} />
              </div>

              <div>
                <label className="block text-[10px] tracking-[0.3em] uppercase text-fg-muted mb-3">
                  Enviar via
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSendVia("whatsapp")}
                    className={`border px-6 py-3 text-sm transition-colors ${
                      sendVia === "whatsapp" ? "border-gold text-gold bg-gold/5" : "border-line hover:border-gold"
                    }`}
                  >
                    📱 WhatsApp
                  </button>
                  <button
                    onClick={() => setSendVia("email")}
                    className={`border px-6 py-3 text-sm transition-colors ${
                      sendVia === "email" ? "border-gold text-gold bg-gold/5" : "border-line hover:border-gold"
                    }`}
                  >
                    ✉️ Email
                  </button>
                  <button
                    onClick={() => setSendVia("both")}
                    className={`border px-6 py-3 text-sm transition-colors ${
                      sendVia === "both" ? "border-gold text-gold bg-gold/5" : "border-line hover:border-gold"
                    }`}
                  >
                    📱 + ✉️ Ambos
                  </button>
                </div>
              </div>
              {contractStatus === "error" && contractResult?.error && (
                <div className="text-sm text-red-400 border border-red-400/30 p-3">
                  {contractResult.error}
                </div>
              )}

              <div className="flex justify-between gap-3 pt-4">
                <button onClick={() => setStep(2)} className="text-xs uppercase tracking-widest text-fg-muted hover:text-gold">
                  ← Voltar
                </button>
                <button
                  disabled={contractStatus === "sending"}
                  onClick={generateContract}
                  className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-8 py-3 hover:bg-fg transition-colors disabled:opacity-50"
                >
                  {contractStatus === "sending" ? "Gerando..." : "Enviar para assinatura →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Acompanhamento */}
          {step === 4 && (
            <div className="text-center py-12">
              <div className="text-6xl mb-6">✓</div>
              <h3 className="font-display text-3xl mb-4">Contrato enviado</h3>
              <p className="text-fg-muted mb-8">
                Cliente receberá o contrato via Autentique. Você verá o status em tempo real.
              </p>
              <div className="luxury-glass inline-block px-8 py-4 rounded-sm">
                <div className="text-[10px] tracking-[0.3em] uppercase text-gold mb-1">Status</div>
                <div className="font-display text-xl">Aguardando assinatura</div>
              </div>
              {contractResult?.publicUrl && (
                <div className="mt-6">
                  <a
                    href={contractResult.publicUrl}
                    target="_blank"
                    rel="noopener"
                    className="text-xs tracking-widest uppercase text-gold hover-underline"
                  >
                    Ver link do contrato →
                  </a>
                </div>
              )}
              <div className="mt-10">
                <button onClick={onUpdated} className="text-xs uppercase tracking-widest text-fg-muted hover:text-gold">
                  Voltar ao painel
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  className = "",
  big = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  big?: boolean;
}) {
  return (
    <div className={className}>
      <label className="block text-[10px] tracking-[0.3em] uppercase text-fg-muted mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-transparent border border-line px-3 ${big ? "py-4 text-lg" : "py-3"} outline-none focus:border-gold transition-colors`}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex justify-between border-b border-line/50 pb-2">
      <span className="text-fg-muted text-xs uppercase tracking-widest">{label}</span>
      <span className="text-fg">{value || "—"}</span>
    </div>
  );
}
