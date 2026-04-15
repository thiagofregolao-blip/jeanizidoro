"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function Hero() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });

      tl.to(".hero-img", {
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
        .from(
          ".hero-sub",
          { opacity: 0, y: 30, duration: 1 },
          "-=0.6"
        )
        .from(
          ".hero-meta",
          { opacity: 0, y: 20, duration: 0.8, stagger: 0.1 },
          "-=0.8"
        );

      gsap.to(".hero-img img", {
        yPercent: 20,
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

  return (
    <section
      ref={ref}
      id="top"
      className="relative h-[100svh] min-h-[680px] w-full overflow-hidden"
    >
      <div className="hero-img clip-reveal absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=2400&auto=format&fit=crop"
          alt="Cenografia de casamento de luxo"
          className="w-full h-[120%] object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/20 to-bg" />
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
