"use client";

import { useEffect, useRef, useState } from "react";

type Lead = {
  id: string;
  temperature: string;
  contact: { id: string; name: string | null; phone: string };
  conversation: { id: string; lastMsgAt: string; status: string };
};

type Message = {
  id: string;
  direction: "IN" | "OUT";
  sender: "CONTACT" | "AI" | "HUMAN";
  content: string;
  createdAt: string;
};

export default function InboxView() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [contact, setContact] = useState<{ name: string | null; phone: string } | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [aiPaused, setAiPaused] = useState(false);
  const [aiPausedUntil, setAiPausedUntil] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadLeads() {
    const res = await fetch("/api/leads");
    const d = await res.json();
    setLeads(d.leads || []);
  }
  async function loadConv(id: string) {
    const res = await fetch(`/api/conversations/${id}`);
    const d = await res.json();
    setMessages(d.conversation?.messages || []);
    setContact(d.conversation?.contact || null);
    setAiPaused(!!d.conversation?.aiPaused);
    setAiPausedUntil(d.conversation?.aiPausedUntil || null);
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
  }

  useEffect(() => {
    loadLeads();
    const t = setInterval(() => {
      loadLeads();
      if (active) loadConv(active);
    }, 5000);
    return () => clearInterval(t);
  }, [active]);

  async function send() {
    if (!active || !text.trim()) return;
    setSending(true);
    await fetch(`/api/conversations/${active}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    setText("");
    setSending(false);
    loadConv(active);
  }

  async function doAction(action: "resume_now" | "pause_indefinitely" | "pause_hours", hours?: number) {
    if (!active) return;
    await fetch(`/api/conversations/${active}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, hours }),
    });
    loadConv(active);
  }

  function pauseRemainingText(): string | null {
    if (!aiPausedUntil) return null;
    const ms = new Date(aiPausedUntil).getTime() - Date.now();
    if (ms <= 0) return null;
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins}min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}min`;
  }

  return (
    <div className="flex-1 grid grid-cols-12 gap-4 min-h-0">
      <div className="col-span-4 border border-line rounded-sm overflow-y-auto bg-bg-soft">
        {leads.map((l) => (
          <button
            key={l.id}
            onClick={() => {
              setActive(l.conversation.id);
              loadConv(l.conversation.id);
            }}
            className={`w-full text-left p-4 border-b border-line hover:bg-bg transition-colors ${
              active === l.conversation.id ? "bg-bg" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="font-display text-lg">{l.contact.name || l.contact.phone}</div>
              <span className="text-[10px] uppercase tracking-widest text-gold">{l.temperature}</span>
            </div>
            <div className="text-xs text-fg-muted">
              {new Date(l.conversation.lastMsgAt).toLocaleString("pt-BR")}
            </div>
          </button>
        ))}
        {leads.length === 0 && <div className="p-6 text-fg-muted text-sm">Nenhuma conversa.</div>}
      </div>

      <div className="col-span-8 border border-line rounded-sm flex flex-col">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-fg-muted">
            Selecione uma conversa
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-line flex items-center justify-between">
              <div>
                <div className="font-display text-xl">{contact?.name || contact?.phone}</div>
                <div className="text-xs text-fg-muted">{contact?.phone}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {aiPaused ? (
                  <>
                    <span className="text-[10px] tracking-widest uppercase text-gold px-3 py-2 self-center">
                      🛑 IA pausada{pauseRemainingText() ? ` · volta em ${pauseRemainingText()}` : ""}
                    </span>
                    <button
                      onClick={() => doAction("resume_now")}
                      className="text-[10px] uppercase tracking-widest border border-gold text-gold hover:bg-gold/10 px-3 py-2 transition-colors"
                    >
                      ▶ Retomar agora
                    </button>
                  </>
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
                      🔒 Pausar
                    </button>
                  </>
                )}
              </div>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-3">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "IN" ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[70%] p-3 rounded-sm ${
                      m.direction === "IN"
                        ? "bg-bg-soft border border-line"
                        : m.sender === "AI"
                        ? "bg-gold/10 border border-gold/30"
                        : "bg-gold text-bg"
                    }`}
                  >
                    <div className="text-[9px] uppercase tracking-widest mb-1 opacity-60">
                      {m.sender === "AI" ? "IA" : m.sender === "HUMAN" ? "Você" : "Cliente"}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                    <div className="text-[10px] opacity-50 mt-1">
                      {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-line flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Responder manualmente (pausa a IA)"
                className="flex-1 bg-transparent border border-line px-4 py-3 outline-none focus:border-gold"
              />
              <button
                onClick={send}
                disabled={sending}
                className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-6 disabled:opacity-50"
              >
                Enviar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
