"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const services = [
  {
    n: "01",
    title: "Casamentos",
    desc: "Cenários que traduzem o amor em arquitetura. Projetos sob medida, do civil ao destination wedding.",
    img: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?q=80&w=1600&auto=format&fit=crop",
  },
  {
    n: "02",
    title: "Corporativo",
    desc: "Experiências de marca, ativações e lançamentos com curadoria estética e precisão de produção.",
    img: "https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=1600&auto=format&fit=crop",
  },
  {
    n: "03",
    title: "Cenografia",
    desc: "Concepção e execução de cenografias autorais — do conceito ao último detalhe sensorial.",
    img: "https://images.unsplash.com/photo-1478146059778-26028b07395a?q=80&w=1600&auto=format&fit=crop",
  },
];

export default function Services() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".svc-card", {
        y: 80,
        opacity: 0,
        duration: 1.2,
        stagger: 0.15,
        ease: "expo.out",
        scrollTrigger: {
          trigger: ref.current,
          start: "top 70%",
        },
      });

      gsap.from(".svc-title-line", {
        yPercent: 100,
        duration: 1.2,
        stagger: 0.08,
        ease: "expo.out",
        scrollTrigger: {
          trigger: ".svc-heading",
          start: "top 80%",
        },
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={ref}
      id="servicos"
      className="relative py-32 md:py-48 px-6 md:px-12 max-w-[1600px] mx-auto"
    >
      <div className="svc-heading mb-20 md:mb-32 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <div className="flex items-center gap-4 mb-6 text-[11px] tracking-[0.3em] uppercase text-gold">
            <span className="w-10 h-px bg-gold" />
            <span>Serviços</span>
          </div>
          <h2 className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1]">
            <span className="reveal-mask block">
              <span className="svc-title-line">Do conceito</span>
            </span>
            <span className="reveal-mask block">
              <span className="svc-title-line italic text-gold">à última flor.</span>
            </span>
          </h2>
        </div>
        <p className="max-w-md text-fg-muted leading-relaxed">
          Três frentes, uma mesma assinatura — precisão arquitetônica encontra
          sensibilidade cenográfica.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 md:gap-8">
        {services.map((s) => (
          <article
            key={s.n}
            className="svc-card group relative overflow-hidden rounded-sm aspect-[3/4] cursor-pointer"
            data-cursor="hover"
          >
            <img
              src={s.img}
              alt={s.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1.6s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/50 to-transparent" />
            <div className="absolute inset-0 p-8 md:p-10 flex flex-col justify-between">
              <span className="text-xs tracking-[0.3em] uppercase text-gold">
                {s.n}
              </span>
              <div>
                <h3 className="font-display text-4xl md:text-5xl mb-4 leading-none">
                  {s.title}
                </h3>
                <p className="text-fg-muted text-sm leading-relaxed max-w-xs opacity-0 translate-y-4 transition-all duration-700 group-hover:opacity-100 group-hover:translate-y-0">
                  {s.desc}
                </p>
              </div>
            </div>
            <div className="absolute inset-0 border border-transparent group-hover:border-gold/30 transition-colors duration-700 pointer-events-none" />
          </article>
        ))}
      </div>
    </section>
  );
}
