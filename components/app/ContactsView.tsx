"use client";

import { useEffect, useState } from "react";

type Contact = {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  isVip: boolean;
  notes: string | null;
};

export default function ContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (vipOnly) params.set("vip", "1");
    const res = await fetch(`/api/contacts?${params}`);
    const d = await res.json();
    setContacts(d.contacts || []);
  }

  useEffect(() => {
    load();
  }, [q, vipOnly]);

  async function toggleVip(c: Contact) {
    await fetch(`/api/contacts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isVip: !c.isVip }),
    });
    load();
  }

  async function addContact() {
    if (!newPhone) return;
    await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: newPhone, name: newName, isVip: true }),
    });
    setNewPhone("");
    setNewName("");
    setShowNew(false);
    load();
  }

  return (
    <>
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar..."
          className="flex-1 bg-bg-soft border border-line px-4 py-3 outline-none focus:border-gold"
        />
        <label className="flex items-center gap-2 px-4 py-3 border border-line cursor-pointer">
          <input type="checkbox" checked={vipOnly} onChange={(e) => setVipOnly(e.target.checked)} />
          Só VIPs
        </label>
        <button onClick={() => setShowNew(!showNew)} className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-6">
          + Adicionar VIP
        </button>
      </div>

      {showNew && (
        <div className="luxury-glass p-6 mb-6 rounded-sm flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome"
            className="flex-1 bg-transparent border border-line px-3 py-2 outline-none"
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Telefone (DDD + número, ex: 5511999999999)"
            className="flex-1 bg-transparent border border-line px-3 py-2 outline-none"
          />
          <button onClick={addContact} className="bg-gold text-bg px-6 uppercase text-xs tracking-widest">
            Salvar
          </button>
        </div>
      )}

      <div className="border border-line rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-bg-soft text-[10px] tracking-[0.3em] uppercase text-fg-muted">
            <tr>
              <th className="text-left p-4">Nome</th>
              <th className="text-left p-4">Telefone</th>
              <th className="text-center p-4">VIP</th>
              <th className="text-center p-4">Ações</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => (
              <tr key={c.id} className="border-t border-line hover:bg-bg-soft">
                <td className="p-4">{c.name || "—"}</td>
                <td className="p-4 text-fg-muted">{c.phone}</td>
                <td className="p-4 text-center">
                  {c.isVip ? <span className="text-gold">★</span> : <span className="text-fg-muted">—</span>}
                </td>
                <td className="p-4 text-center">
                  <button onClick={() => toggleVip(c)} className="text-xs uppercase tracking-widest text-fg-muted hover:text-gold">
                    {c.isVip ? "Remover VIP" : "Marcar VIP"}
                  </button>
                </td>
              </tr>
            ))}
            {contacts.length === 0 && (
              <tr>
                <td colSpan={4} className="p-8 text-center text-fg-muted">
                  Nenhum contato.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
