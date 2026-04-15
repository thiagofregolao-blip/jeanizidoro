"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const data = [
  {
    quote:
      "O Jean transformou nosso casamento em uma obra viva. Cada detalhe tinha alma — foi inesquecível.",
    name: "Marina & Rafael",
    role: "Casamento — Fazenda Vista Alegre",
  },
  {
    quote:
      "Sensibilidade rara. A cenografia traduziu nossa marca em experiência — clientes ainda comentam.",
    name: "Helena Costa",
    role: "Diretora de Marketing — Lumen",
  },
  {
    quote:
      "Profissionalismo do briefing à montagem. Jean lê o invisível e materializa emoção.",
    name: "Ana & Pedro",
    role: "Destination Wedding — Trancoso",
  },
];

export default function Testimonials() {
  const ref = useRef<HTMLElement>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".test-line", {
        yPercent: 100,
        duration: 1.2,
        stagger: 0.08,
        ease: "expo.out",
        scrollTrigger: { trigger: ref.current, start: "top 70%" },
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % data.length), 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      ref={ref}
      id="depoimentos"
      className="relative py-32 md:py-48 px-6 md:px-12 max-w-[1400px] mx-auto"
    >
      <div className="flex items-center gap-4 mb-16 text-[11px] tracking-[0.3em] uppercase text-gold justify-center">
        <span className="w-10 h-px bg-gold" />
        <span>Depoimentos</span>
        <span className="w-10 h-px bg-gold" />
      </div>

      <div className="relative min-h-[280px] md:min-h-[320px] flex flex-col items-center text-center">
        {data.map((d, i) => (
          <div
            key={i}
            className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-1000 ${
              i === idx ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <span className="font-display text-7xl md:text-9xl text-gold leading-none mb-6">
              &ldquo;
            </span>
            <p className="font-display italic text-[clamp(1.5rem,3.5vw,3rem)] leading-[1.2] max-w-4xl text-fg">
              {d.quote}
            </p>
            <div className="mt-10 flex flex-col items-center">
              <span className="w-10 h-px bg-gold mb-4" />
              <div className="text-sm tracking-widest uppercase text-fg">
                {d.name}
              </div>
              <div className="text-xs tracking-widest uppercase text-fg-muted mt-1">
                {d.role}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 justify-center mt-12">
        {data.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            className={`h-px transition-all duration-500 ${
              i === idx ? "w-12 bg-gold" : "w-6 bg-fg-muted/40"
            }`}
            aria-label={`Depoimento ${i + 1}`}
          />
        ))}
      </div>
    </section>
  );
}
