"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type StalledLead = {
  id: string;
  name: string | null;
  phone: string;
  eventType: string | null;
  temperature: "HOT" | "WARM" | "COLD";
  status: string;
  daysSince: number;
};

type ConversionBlock = { total: number; won: number; rate: number };
type Data = {
  stalled: StalledLead[];
  funnel: Record<string, number>;
  conversion: { last30: ConversionBlock; last90: ConversionBlock; allTime: ConversionBlock };
  avgServiceDays: number;
  closedSampleSize: number;
};

const FUNNEL_ORDER = [
  { key: "NEW", label: "Novos" },
  { key: "IN_SERVICE", label: "Em atendimento" },
  { key: "PROPOSAL_SENT", label: "Proposta" },
  { key: "CONTRACT_SENT", label: "Contrato" },
  { key: "WON", label: "Fechados" },
  { key: "LOST", label: "Perdidos" },
];

const STATUS_LABEL: Record<string, string> = {
  NEW: "Novo",
  IN_SERVICE: "Em atendimento",
  PROPOSAL_SENT: "Proposta",
  CONTRACT_SENT: "Contrato",
  WON: "Fechado",
  LOST: "Perdido",
};

function formatPhone(p: string): string {
  const n = p.replace(/\D/g, "");
  if (n.length === 13) return `(${n.slice(2, 4)}) ${n.slice(4, 9)}-${n.slice(9)}`;
  if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
  return p;
}

export default function DashboardView() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-fg-muted">Carregando...</div>;
  if (!data) return <div className="text-red-400">Erro ao carregar.</div>;

  const maxFunnel = Math.max(
    ...FUNNEL_ORDER.map((f) => data.funnel[f.key] || 0),
    1
  );

  return (
    <div className="space-y-6">
      {/* Resumo top */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          title="Conversão (90 dias)"
          value={`${(data.conversion.last90.rate * 100).toFixed(0)}%`}
          sub={`${data.conversion.last90.won} de ${data.conversion.last90.total} leads`}
          tone="gold"
        />
        <Card
          title="Tempo médio de atendimento"
          value={data.avgServiceDays > 0 ? `${data.avgServiceDays}d` : "—"}
          sub={`baseado em ${data.closedSampleSize} atendimento(s) encerrado(s)`}
          tone="default"
        />
        <Card
          title="Leads parados"
          value={data.stalled.length.toString()}
          sub="HOT/WARM ou em atendimento sem resposta há +1 dia"
          tone={data.stalled.length > 0 ? "warning" : "default"}
        />
      </div>

      {/* Funil */}
      <div className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-6">Funil de leads</h3>
        <div className="space-y-3">
          {FUNNEL_ORDER.map((f) => {
            const v = data.funnel[f.key] || 0;
            const pct = (v / maxFunnel) * 100;
            return (
              <div key={f.key} className="flex items-center gap-3">
                <div className="w-32 text-xs uppercase tracking-widest text-fg-muted shrink-0">
                  {f.label}
                </div>
                <div className="flex-1 h-6 bg-bg-soft rounded-sm overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-700 ${
                      f.key === "WON"
                        ? "bg-green-500/40"
                        : f.key === "LOST"
                        ? "bg-red-500/40"
                        : "bg-gold/30"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="absolute inset-0 flex items-center px-3 text-xs text-fg">
                    {v}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversão detalhada */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          title="Últimos 30 dias"
          value={`${(data.conversion.last30.rate * 100).toFixed(0)}%`}
          sub={`${data.conversion.last30.won}/${data.conversion.last30.total}`}
        />
        <Card
          title="Últimos 90 dias"
          value={`${(data.conversion.last90.rate * 100).toFixed(0)}%`}
          sub={`${data.conversion.last90.won}/${data.conversion.last90.total}`}
        />
        <Card
          title="Histórico geral"
          value={`${(data.conversion.allTime.rate * 100).toFixed(0)}%`}
          sub={`${data.conversion.allTime.won}/${data.conversion.allTime.total}`}
        />
      </div>

      {/* Leads parados */}
      <div className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Leads parados ⚠️</h3>
        {data.stalled.length === 0 ? (
          <div className="text-fg-muted text-sm italic">Nenhum lead parado no momento ✓</div>
        ) : (
          <div className="space-y-2">
            {data.stalled.map((l) => (
              <Link
                key={l.id}
                href={`/app`}
                className="flex items-center justify-between p-3 border border-line hover:border-gold/40 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-display text-base group-hover:text-gold transition-colors truncate">
                    {l.name || formatPhone(l.phone)}
                  </div>
                  <div className="text-xs text-fg-muted">
                    {l.eventType || "(tipo não informado)"} · {STATUS_LABEL[l.status]} · {l.temperature}
                  </div>
                </div>
                <div
                  className={`text-xs uppercase tracking-widest border px-3 py-1 ml-4 shrink-0 ${
                    l.daysSince > 3
                      ? "border-red-500/40 text-red-400 bg-red-500/10"
                      : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                  }`}
                >
                  ⏱ {l.daysSince}d
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub: string;
  tone?: "default" | "gold" | "warning";
}) {
  const accent =
    tone === "gold"
      ? "border-gold/40"
      : tone === "warning"
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-line";
  return (
    <div className={`luxury-glass p-5 rounded-sm border ${accent}`}>
      <div className="text-[10px] uppercase tracking-[0.3em] text-fg-muted mb-2">{title}</div>
      <div className="font-display text-4xl mb-1">{value}</div>
      <div className="text-xs text-fg-muted">{sub}</div>
    </div>
  );
}
