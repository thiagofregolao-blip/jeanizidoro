"use client";

import { useEffect, useState } from "react";

type ErrorLog = {
  id: string;
  source: string;
  level: string;
  message: string;
  resolved: boolean;
  createdAt: string;
};

type Breaker = {
  errorCount: number;
  lastError: string | null;
  trippedAt: string | null;
};

type Stat = { source: string; _count: number };

export default function HealthDashboard() {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [breaker, setBreaker] = useState<Breaker | null>(null);
  const [stats, setStats] = useState<Stat[]>([]);
  const [webhooks, setWebhooks] = useState<{ id: string; source: string; processed: boolean; error: string | null; createdAt: string; payload: unknown }[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [r1, r2] = await Promise.all([fetch("/api/errors"), fetch("/api/webhook-logs")]);
    const d = await r1.json();
    const d2 = await r2.json();
    setErrors(d.errors || []);
    setBreaker(d.breaker || null);
    setStats(d.stats || []);
    setWebhooks(d2.logs || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="text-fg-muted">Carregando...</div>;

  const tripped = !!breaker?.trippedAt;

  return (
    <div className="space-y-6">
      {/* Circuit breaker status */}
      <div className={`luxury-glass p-6 rounded-sm border-t-2 ${tripped ? "border-red-500" : "border-green-500/50"}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-fg-muted mb-1">
              Circuit Breaker
            </div>
            <div className="font-display text-2xl">
              {tripped ? (
                <span className="text-red-400">🛑 PAUSADO</span>
              ) : (
                <span className="text-green-400">✓ OK</span>
              )}
            </div>
            {breaker?.lastError && (
              <div className="text-xs text-fg-muted mt-2">
                Último erro: {new Date(breaker.lastError).toLocaleString("pt-BR")}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-3xl font-display">{breaker?.errorCount || 0}</div>
            <div className="text-[10px] uppercase tracking-widest text-fg-muted">erros na janela</div>
          </div>
        </div>
        {tripped && (
          <div className="mt-4 text-xs text-red-300 border border-red-500/30 p-3">
            IA foi pausada automaticamente após múltiplas falhas. Será reativada automaticamente em 15min,
            ou você pode reativar manualmente em /app/ia desligando o "Pausar tudo".
          </div>
        )}
      </div>

      {/* Stats 24h */}
      <div className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Últimas 24h por fonte</h3>
        {stats.length === 0 ? (
          <div className="text-fg-muted text-sm">Nenhum erro nas últimas 24h ✓</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stats.map((s) => (
              <div key={s.source} className="border border-line p-3 rounded-sm">
                <div className="text-[10px] uppercase tracking-widest text-fg-muted">{s.source}</div>
                <div className="font-display text-2xl mt-1">{s._count}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Webhook Logs */}
      <div className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Webhooks recebidos (últimos 30)</h3>
        {webhooks.length === 0 ? (
          <div className="text-fg-muted text-sm border border-red-400/30 p-4 rounded-sm">
            ⚠️ Nenhum webhook recebido ainda. Confirme que o webhook está salvo no Z-API
            apontando pra <code className="text-gold">/api/webhook/zapi</code>
          </div>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {webhooks.map((w) => (
              <div
                key={w.id}
                className={`border p-3 rounded-sm text-xs ${
                  w.error ? "border-red-400/30" : w.processed ? "border-green-400/30" : "border-line"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="uppercase tracking-widest text-gold">{w.source}</span>
                  <span className="text-fg-muted">
                    {new Date(w.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                {w.error && <div className="text-red-400">erro: {w.error}</div>}
                {!w.error && w.processed && <div className="text-green-400">processado</div>}
                <details className="mt-2">
                  <summary className="text-fg-muted cursor-pointer">payload</summary>
                  <pre className="text-[10px] text-fg-muted mt-1 overflow-x-auto">
                    {JSON.stringify(w.payload, null, 2).slice(0, 500)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error list */}
      <div className="luxury-glass p-6 rounded-sm">
        <h3 className="font-display text-2xl mb-4">Erros recentes</h3>
        {errors.length === 0 ? (
          <div className="text-fg-muted text-sm">Tudo limpo ✨</div>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {errors.map((e) => (
              <div key={e.id} className="border border-line p-3 rounded-sm text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-widest text-red-400">{e.source}</span>
                  <span className="text-[10px] text-fg-muted">
                    {new Date(e.createdAt).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="text-fg-muted">{e.message}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
