"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

type Banner = { id: string; title: string | null; order: number };

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=2400&auto=format&fit=crop";

const SLIDE_DURATION_MS = 5000;
const FADE_MS = 1200;

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  // Carrega banners ativos
  useEffect(() => {
    let mounted = true;
    fetch("/api/banners")
      .then((r) => r.json())
      .then((d) => {
        if (mounted) setBanners(d.banners || []);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Carrossel automático (só se houver mais de 1)
  useEffect(() => {
    if (banners.length <= 1) return;
    const t = setInterval(() => {
      setActiveIdx((i) => (i + 1) % banners.length);
    }, SLIDE_DURATION_MS);
    return () => clearInterval(t);
  }, [banners.length]);

  // Animações de entrada (GSAP) — uma vez quando montar
  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

      tl.to(".hero-img-wrap", {
        clipPath: "inset(0% 0 0 0)",
        duration: 1.8,
      })
        .from(
          ".hero-line span",
          {
            yPercent: 110,
            duration: 1.4,
            stagger: 0.12,
            ease: "expo.out",
          },
          "-=1.2"
        )
        .from(".hero-sub", { opacity: 0, y: 30, duration: 1 }, "-=0.6")
        .from(".hero-meta", { opacity: 0, y: 20, duration: 0.8, stagger: 0.1 }, "-=0.8");

      gsap.to(".hero-img-wrap", {
        yPercent: 10,
        ease: "none",
        scrollTrigger: {
          trigger: ref.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });

      gsap.to(".hero-text-wrap", {
        yPercent: -25,
        opacity: 0.2,
        ease: "none",
        scrollTrigger: {
          trigger: ref.current,
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    }, ref);

    return () => ctx.revert();
  }, []);

  const slides = banners.length > 0 ? banners : null;

  return (
    <section
      ref={ref}
      id="top"
      className="relative h-[100svh] min-h-[680px] w-full overflow-hidden"
    >
      {/* Container do crossfade */}
      <div className="hero-img-wrap clip-reveal absolute inset-0">
        {slides ? (
          slides.map((b, i) => (
            <img
              key={b.id}
              src={`/api/banners/${b.id}/image`}
              alt={b.title || "Banner"}
              className="absolute inset-0 w-full h-[110%] object-cover transition-opacity"
              style={{
                opacity: i === activeIdx ? 1 : 0,
                transitionDuration: `${FADE_MS}ms`,
                transitionTimingFunction: "ease-in-out",
              }}
            />
          ))
        ) : (
          <img
            src={FALLBACK_IMG}
            alt="Banner"
            className="absolute inset-0 w-full h-[110%] object-cover"
          />
        )}
        {/* Overlay forte no topo pra destacar o menu, leve no meio, sólido no rodapé */}
        <div className="absolute inset-0 bg-gradient-to-b from-bg/85 via-bg/30 to-bg" />
        {/* Vinheta sutil pra contraste extra nas imagens coloridas */}
        <div className="absolute inset-0 bg-bg/15" />
      </div>

      <div className="hero-text-wrap relative z-10 h-full flex flex-col justify-end pb-24 md:pb-32 px-6 md:px-12 max-w-[1600px] mx-auto">
        <div className="hero-meta flex items-center gap-4 mb-10 text-[11px] tracking-[0.3em] uppercase text-fg-muted">
          <span className="w-10 h-px bg-gold" />
          <span>Arquitetura & Eventos</span>
        </div>

        <h1 className="font-display text-[clamp(3.2rem,10vw,10rem)] leading-[0.95] tracking-tight">
          <span className="hero-line reveal-mask block">
            <span>Cenografia que</span>
          </span>
          <span className="hero-line reveal-mask block italic text-gold">
            <span>emociona.</span>
          </span>
          <span className="hero-line reveal-mask block">
            <span>Eventos que</span>
          </span>
          <span className="hero-line reveal-mask block italic">
            <span>permanecem.</span>
          </span>
        </h1>

        <p className="hero-sub mt-10 max-w-xl text-base md:text-lg text-fg-muted leading-relaxed">
          Arquitetura de eventos, cenografia autoral e produção de alto padrão
          para casamentos, experiências corporativas e celebrações únicas.
        </p>

        {/* Indicadores do carrossel */}
        {slides && slides.length > 1 && (
          <div className="hero-meta flex items-center gap-2 mt-10">
            {slides.map((b, i) => (
              <button
                key={b.id}
                onClick={() => setActiveIdx(i)}
                aria-label={`Banner ${i + 1}`}
                className={`transition-all duration-500 ${
                  i === activeIdx
                    ? "w-12 h-px bg-gold"
                    : "w-6 h-px bg-fg-muted/40 hover:bg-fg-muted"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="hero-meta absolute bottom-8 right-6 md:right-12 z-10 flex flex-col items-center gap-3 text-[10px] tracking-[0.3em] uppercase text-fg-muted">
        <span>scroll</span>
        <span className="w-px h-12 bg-fg-muted/40 relative overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-1/2 bg-gold animate-[slide_2s_ease-in-out_infinite]" />
        </span>
      </div>

      <style jsx>{`
        @keyframes slide {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(200%);
          }
        }
      `}</style>
    </section>
  );
}
