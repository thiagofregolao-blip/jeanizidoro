"use client";

import { useEffect, useState } from "react";

type Contract = {
  id: string;
  status: string;
  publicUrl: string | null;
  pdfUrl: string | null;
  signedPdfUrl: string | null;
  totalValue: string | null;
  paymentTerms: string | null;
  sentVia: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  createdAt: string;
  eventData: { eventType?: string; eventDate?: string } | null;
  contact: { id: string; name: string | null; phone: string };
};

const STATUS_STYLE: Record<string, { label: string; color: string; icon: string }> = {
  DRAFT: { label: "Rascunho", color: "text-fg-muted border-line", icon: "•" },
  SENT: { label: "Enviado", color: "text-gold border-gold/40", icon: "↑" },
  VIEWED: { label: "Visto", color: "text-blue-400 border-blue-400/40", icon: "👁" },
  SIGNED: { label: "Assinado", color: "text-green-400 border-green-400/40", icon: "✓" },
  CANCELLED: { label: "Cancelado", color: "text-red-400 border-red-400/40", icon: "✕" },
};

export default function ContractsView() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/contracts");
    const d = await res.json();
    setContracts(d.contracts || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="text-fg-muted">Carregando...</div>;

  return (
    <div className="border border-line rounded-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bg-soft text-[10px] tracking-[0.3em] uppercase text-fg-muted">
          <tr>
            <th className="text-left p-4">Cliente</th>
            <th className="text-left p-4">Evento</th>
            <th className="text-left p-4">Valor</th>
            <th className="text-left p-4">Enviado</th>
            <th className="text-center p-4">Status</th>
            <th className="text-center p-4">Ações</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => {
            const s = STATUS_STYLE[c.status] || STATUS_STYLE.DRAFT;
            return (
              <tr key={c.id} className="border-t border-line hover:bg-bg-soft">
                <td className="p-4">
                  <div className="font-display">{c.contact.name || c.contact.phone}</div>
                  <div className="text-xs text-fg-muted">{c.contact.phone}</div>
                </td>
                <td className="p-4">
                  <div>{c.eventData?.eventType || "—"}</div>
                  <div className="text-xs text-fg-muted">
                    {c.eventData?.eventDate
                      ? new Date(c.eventData.eventDate).toLocaleDateString("pt-BR")
                      : ""}
                  </div>
                </td>
                <td className="p-4 text-gold">
                  {c.totalValue ? `R$ ${Number(c.totalValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                </td>
                <td className="p-4 text-fg-muted text-xs">
                  {c.sentAt ? new Date(c.sentAt).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td className="p-4 text-center">
                  <span className={`text-xs tracking-widest uppercase border px-3 py-1 ${s.color}`}>
                    {s.icon} {s.label}
                  </span>
                </td>
                <td className="p-4 text-center">
                  {c.publicUrl && (
                    <a
                      href={c.publicUrl}
                      target="_blank"
                      rel="noopener"
                      className="text-xs tracking-widest uppercase text-fg-muted hover:text-gold"
                    >
                      Abrir →
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
          {contracts.length === 0 && (
            <tr>
              <td colSpan={6} className="p-12 text-center text-fg-muted">
                Nenhum contrato ainda. Crie um pelo Modal de Atendimento.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
