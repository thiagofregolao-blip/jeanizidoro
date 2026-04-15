"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <AuthInner />
    </Suspense>
  );
}

function AuthInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Erro ao entrar");
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-bg">
      <div className="absolute inset-0 opacity-30">
        <img
          src="https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=2000&auto=format&fit=crop"
          alt=""
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-bg/80" />
      </div>

      <div className="relative w-full max-w-md luxury-glass rounded-sm p-10">
        <a href="/" className="block text-center mb-10">
          <div className="font-display text-3xl">
            Jean <span className="text-gold">Izidoro</span>
          </div>
          <div className="text-[10px] tracking-[0.3em] uppercase text-fg-muted mt-2">
            Painel administrativo
          </div>
        </a>

        <form onSubmit={submit} className="space-y-6">
          <div>
            <label className="block text-[10px] tracking-[0.3em] uppercase text-fg-muted mb-2">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent border border-line px-4 py-3 text-fg focus:border-gold outline-none transition-colors"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-[10px] tracking-[0.3em] uppercase text-fg-muted mb-2">
              Senha
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent border border-line px-4 py-3 text-fg focus:border-gold outline-none transition-colors"
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="text-sm text-red-400 border border-red-400/30 px-3 py-2">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-bg uppercase tracking-[0.3em] text-sm py-4 hover:bg-fg transition-colors duration-500 disabled:opacity-50"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <a
          href="/"
          className="block text-center text-xs tracking-widest uppercase text-fg-muted mt-8 hover:text-gold"
        >
          ← Voltar ao site
        </a>
      </div>
    </main>
  );
}
