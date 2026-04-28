"use client";

import { useEffect, useState } from "react";

const links = [
  { href: "#sobre", label: "Sobre" },
  { href: "#servicos", label: "Serviços" },
  { href: "#portfolio", label: "Portfólio" },
  { href: "#depoimentos", label: "Depoimentos" },
  { href: "#contato", label: "Contato" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ${
        scrolled ? "py-4 luxury-glass" : "py-8 bg-transparent"
      }`}
    >
      <nav className="max-w-[1600px] mx-auto px-6 md:px-12 flex items-center justify-between">
        <a
          href="#top"
          className="font-display text-2xl tracking-tight text-fg"
        >
          Jean <span className="text-gold">Izidoro</span>
        </a>

        <ul className="hidden md:flex items-center gap-10 text-sm tracking-wider uppercase">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="hover-underline text-fg-muted hover:text-fg transition-colors">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden md:flex items-center gap-3">
          <a
            href="/auth"
            title="Acesso restrito"
            className="text-[10px] uppercase tracking-[0.3em] text-fg-muted hover:text-gold transition-colors"
          >
            ◉ Acesso
          </a>
          <a
            href="https://wa.me/5543984991295?text=Ol%C3%A1!%20Vim%20do%20site%2C%20gostaria%20de%20um%20or%C3%A7amento."
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 text-sm uppercase tracking-widest border border-gold/40 text-gold px-6 py-3 rounded-full hover:bg-gold hover:text-bg transition-all duration-500"
          >
            Orçamento
          </a>
        </div>

        <button
          onClick={() => setOpen(!open)}
          className="md:hidden w-10 h-10 flex flex-col items-center justify-center gap-1.5"
          aria-label="Menu"
        >
          <span className={`block w-6 h-px bg-fg transition-transform ${open ? "rotate-45 translate-y-[3px]" : ""}`} />
          <span className={`block w-6 h-px bg-fg transition-transform ${open ? "-rotate-45 -translate-y-[3px]" : ""}`} />
        </button>
      </nav>

      {open && (
        <div className="md:hidden absolute top-full left-0 right-0 luxury-glass px-6 py-8">
          <ul className="flex flex-col gap-6 text-sm tracking-wider uppercase">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} className="text-fg-muted">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}
