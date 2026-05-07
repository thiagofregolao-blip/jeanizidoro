"use client";

import { useEffect, useState } from "react";

type Rule = {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  label: string;
  active: boolean;
};

const WEEKDAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
];

export default function AvailabilityRulesView() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newWeekday, setNewWeekday] = useState(2);
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("18:00");
  const [newLabel, setNewLabel] = useState("Reuniões com clientes");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/availability-rules");
    const d = await res.json();
    setRules(d.rules || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addRule() {
    if (!newStart || !newEnd) return;
    setSaving(true);
    await fetch("/api/availability-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        weekday: newWeekday,
        startTime: newStart,
        endTime: newEnd,
        label: newLabel,
      }),
    });
    setSaving(false);
    await load();
  }

  async function toggleActive(rule: Rule) {
    await fetch("/api/availability-rules", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: rule.id, active: !rule.active }),
    });
    await load();
  }

  async function removeRule(id: string) {
    if (!confirm("Remover essa regra de disponibilidade?")) return;
    await fetch(`/api/availability-rules?id=${id}`, { method: "DELETE" });
    await load();
  }

  if (loading) return <div className="text-fg-muted">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Lista atual */}
      <div className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Regras ativas</h3>
        {rules.length === 0 ? (
          <div className="text-fg-muted text-sm italic">Nenhuma regra cadastrada — adicione abaixo.</div>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div
                key={r.id}
                className={`flex items-center justify-between p-3 border ${
                  r.active ? "border-gold/40 bg-gold/5" : "border-line opacity-50"
                }`}
              >
                <div className="flex-1">
                  <div className="font-display text-base">
                    {WEEKDAYS.find((w) => w.value === r.weekday)?.label} · {r.startTime} – {r.endTime}
                  </div>
                  <div className="text-xs text-fg-muted">{r.label}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleActive(r)}
                    className="text-[10px] uppercase tracking-widest border border-line text-fg-muted hover:text-gold hover:border-gold px-3 py-2 transition-colors"
                  >
                    {r.active ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    onClick={() => removeRule(r.id)}
                    className="text-[10px] uppercase tracking-widest border border-red-500/40 text-red-400 hover:bg-red-500/10 px-3 py-2 transition-colors"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Adicionar nova */}
      <div className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Adicionar regra</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-fg-muted mb-2">Dia da semana</label>
            <select
              value={newWeekday}
              onChange={(e) => setNewWeekday(parseInt(e.target.value, 10))}
              className="w-full bg-bg-soft border border-line px-3 py-2 outline-none focus:border-gold"
            >
              {WEEKDAYS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-fg-muted mb-2">Início</label>
              <input
                type="time"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="w-full bg-transparent border border-line px-3 py-2 outline-none focus:border-gold"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-fg-muted mb-2">Fim</label>
              <input
                type="time"
                value={newEnd}
                onChange={(e) => setNewEnd(e.target.value)}
                className="w-full bg-transparent border border-line px-3 py-2 outline-none focus:border-gold"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-fg-muted mb-2">Rótulo</label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full bg-transparent border border-line px-3 py-2 outline-none focus:border-gold"
              placeholder="Ex: Reuniões com clientes"
            />
          </div>

          <button
            onClick={addRule}
            disabled={saving}
            className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-6 py-3 hover:bg-fg transition-colors disabled:opacity-50"
          >
            {saving ? "Salvando..." : "+ Adicionar regra"}
          </button>
        </div>
      </div>

      <div className="text-xs text-fg-muted italic">
        Marina usa essas regras pra sugerir horários de reunião quando cliente pedir. Reunião dura 30 min e os slots são calculados descontando os eventos já marcados no dia.
      </div>
    </div>
  );
}
