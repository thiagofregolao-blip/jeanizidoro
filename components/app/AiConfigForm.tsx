"use client";

import { useEffect, useState } from "react";

type Cfg = {
  id: string;
  personaPrompt: string;
  businessContext: string;
  autoReply: boolean;
  pauseAll: boolean;
  workStartHour: number;
  workEndHour: number;
  escalateKeywords: string[];
  offHoursAutoReply: boolean;
  offHoursMessage: string;
};

export default function AiConfigForm() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/ai-config");
    const d = await res.json();
    setCfg(d.config);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    await fetch("/api/ai-config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!cfg) return <div className="text-fg-muted">Carregando...</div>;

  const set = <K extends keyof Cfg>(k: K, v: Cfg[K]) => setCfg({ ...cfg, [k]: v });

  return (
    <div className="space-y-8">
      <section className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Controle global</h3>
        <div className="space-y-3">
          <Toggle
            label="IA respondendo automaticamente"
            checked={cfg.autoReply && !cfg.pauseAll}
            onChange={(v) => set("autoReply", v)}
          />
          <Toggle
            label="🛑 PAUSAR TUDO (kill switch)"
            checked={cfg.pauseAll}
            onChange={(v) => set("pauseAll", v)}
          />
        </div>
      </section>

      <section className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Horário comercial</h3>
        <div className="flex gap-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-fg-muted mb-2">Início</label>
            <input
              type="number"
              min={0}
              max={23}
              value={cfg.workStartHour}
              onChange={(e) => set("workStartHour", Number(e.target.value))}
              className="w-24 bg-transparent border border-line px-3 py-2 outline-none"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-fg-muted mb-2">Fim</label>
            <input
              type="number"
              min={1}
              max={24}
              value={cfg.workEndHour}
              onChange={(e) => set("workEndHour", Number(e.target.value))}
              className="w-24 bg-transparent border border-line px-3 py-2 outline-none"
            />
          </div>
        </div>
        <p className="text-xs text-fg-muted mt-3">Fora desse horário a Sofia não conduz conversas, mas pode enviar auto-resposta (configure abaixo).</p>
      </section>

      <section className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Auto-resposta fora do horário</h3>
        <div className="space-y-4">
          <Toggle
            label="Enviar mensagem automática quando cliente contatar fora do horário"
            checked={cfg.offHoursAutoReply}
            onChange={(v) => set("offHoursAutoReply", v)}
          />
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-fg-muted mb-2">
              Mensagem automática
            </label>
            <textarea
              rows={3}
              value={cfg.offHoursMessage}
              onChange={(e) => set("offHoursMessage", e.target.value)}
              className="w-full bg-transparent border border-line p-3 outline-none focus:border-gold text-sm"
              placeholder="Oi! Recebi sua mensagem 💫 Nosso horário é das 8h às 22h..."
            />
            <p className="text-xs text-fg-muted mt-2">
              Cooldown de 4h: se o mesmo cliente mandar várias mensagens seguidas, só recebe a auto-resposta uma vez.
            </p>
          </div>
        </div>
      </section>

      <section className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Persona da Sofia</h3>
        <textarea
          rows={4}
          value={cfg.personaPrompt}
          onChange={(e) => set("personaPrompt", e.target.value)}
          className="w-full bg-transparent border border-line p-3 outline-none focus:border-gold text-sm"
        />
      </section>

      <section className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Contexto do negócio</h3>
        <textarea
          rows={4}
          value={cfg.businessContext}
          onChange={(e) => set("businessContext", e.target.value)}
          className="w-full bg-transparent border border-line p-3 outline-none focus:border-gold text-sm"
        />
      </section>

      <section className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Palavras que pausam a IA</h3>
        <input
          value={cfg.escalateKeywords.join(", ")}
          onChange={(e) => set("escalateKeywords", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
          className="w-full bg-transparent border border-line px-3 py-2 outline-none"
        />
        <p className="text-xs text-fg-muted mt-2">Separe por vírgula. Ex: falar com jean, atendente, humano</p>
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="bg-gold text-bg uppercase tracking-[0.3em] text-xs px-8 py-3 hover:bg-fg transition-colors disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        {saved && <span className="text-gold text-sm">✓ Salvo</span>}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 accent-[var(--gold)]" />
    </label>
  );
}
