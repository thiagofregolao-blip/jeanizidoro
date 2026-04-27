"use client";

import { useEffect, useRef, useState } from "react";

type Banner = {
  id: string;
  title: string | null;
  mimeType: string;
  order: number;
  active: boolean;
  createdAt: string;
};

export default function BannerManager() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/banners?all=1");
    const d = await res.json();
    setBanners(d.banners || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", file.name.replace(/\.[^.]+$/, ""));
    const res = await fetch("/api/banners", { method: "POST", body: fd });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Erro ao subir imagem");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await load();
  }

  async function patch(id: string, data: Partial<Banner>) {
    await fetch(`/api/banners/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Remover esse banner?")) return;
    await fetch(`/api/banners/${id}`, { method: "DELETE" });
    await load();
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = banners.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= banners.length) return;
    const a = banners[idx];
    const b = banners[target];
    await Promise.all([
      patch(a.id, { order: b.order }),
      patch(b.id, { order: a.order }),
    ]);
  }

  const activeCount = banners.filter((b) => b.active).length;

  return (
    <div className="space-y-6">
      {/* Upload */}
      <div className="luxury-glass p-6 rounded-sm">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="font-display text-xl mb-1">Adicionar nova imagem</h3>
            <p className="text-xs text-fg-muted">
              JPG, PNG ou WEBP — máximo 5MB · Recomendado: 1920×1080 ou maior
            </p>
          </div>
          <label className="cursor-pointer">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
              }}
              disabled={uploading}
            />
            <span className="bg-gold text-bg uppercase tracking-[0.2em] text-xs px-6 py-3 hover:bg-fg transition-colors inline-block">
              {uploading ? "Enviando..." : "+ Subir imagem"}
            </span>
          </label>
        </div>
        {error && <div className="text-sm text-red-400 mt-3">{error}</div>}
      </div>

      {/* Status */}
      <div className="text-xs text-fg-muted">
        {banners.length} banner(s) cadastrado(s) · {activeCount} ativo(s) no carrossel da landing
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-fg-muted">Carregando...</div>
      ) : banners.length === 0 ? (
        <div className="luxury-glass p-12 rounded-sm text-center">
          <div className="text-5xl mb-4 opacity-40">🖼️</div>
          <div className="text-fg-muted text-sm">Nenhum banner cadastrado ainda. Suba a primeira imagem acima.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banners.map((b, idx) => (
            <div
              key={b.id}
              className={`luxury-glass rounded-sm overflow-hidden ${
                b.active ? "border-gold/40" : "border-line opacity-60"
              }`}
            >
              <div className="relative aspect-video bg-bg-soft">
                <img
                  src={`/api/banners/${b.id}/image`}
                  alt={b.title || ""}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {!b.active && (
                  <div className="absolute inset-0 bg-bg/70 flex items-center justify-center">
                    <span className="text-xs uppercase tracking-widest text-fg-muted">Inativo</span>
                  </div>
                )}
              </div>
              <div className="p-4 space-y-3">
                <input
                  value={b.title || ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBanners((bs) => bs.map((x) => (x.id === b.id ? { ...x, title: v } : x)));
                  }}
                  onBlur={(e) => patch(b.id, { title: e.target.value })}
                  placeholder="Título (opcional)"
                  className="w-full bg-transparent border border-line px-3 py-2 text-sm outline-none focus:border-gold"
                />
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex gap-1">
                    <button
                      onClick={() => move(b.id, -1)}
                      disabled={idx === 0}
                      className="text-xs border border-line text-fg-muted hover:border-gold hover:text-gold w-8 h-8 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => move(b.id, 1)}
                      disabled={idx === banners.length - 1}
                      className="text-xs border border-line text-fg-muted hover:border-gold hover:text-gold w-8 h-8 disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <input
                      type="checkbox"
                      checked={b.active}
                      onChange={(e) => patch(b.id, { active: e.target.checked })}
                      className="w-4 h-4 accent-[var(--gold)]"
                    />
                    {b.active ? "Ativo" : "Inativo"}
                  </label>
                  <button
                    onClick={() => remove(b.id)}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 hover:bg-red-500/10"
                  >
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
