"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const items = [
  {
    title: "Villa Aurora",
    category: "Wedding",
    img: "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=1600&auto=format&fit=crop",
    size: "tall",
  },
  {
    title: "Lumen Corp",
    category: "Corporativo",
    img: "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?q=80&w=1600&auto=format&fit=crop",
    size: "wide",
  },
  {
    title: "Jardins Secretos",
    category: "Cenografia",
    img: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?q=80&w=1600&auto=format&fit=crop",
    size: "square",
  },
  {
    title: "Noite Dourada",
    category: "Wedding",
    img: "https://images.unsplash.com/photo-1530023367847-a683933f4172?q=80&w=1600&auto=format&fit=crop",
    size: "square",
  },
  {
    title: "Atelier Marble",
    category: "Cenografia",
    img: "https://images.unsplash.com/photo-1478146059778-26028b07395a?q=80&w=1600&auto=format&fit=crop",
    size: "tall",
  },
  {
    title: "Summit Gala",
    category: "Corporativo",
    img: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?q=80&w=1600&auto=format&fit=crop",
    size: "wide",
  },
];

export default function Portfolio() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray<HTMLElement>(".port-card");
      cards.forEach((card) => {
        const img = card.querySelector("img");
        if (!img) return;
        gsap.fromTo(
          card,
          { clipPath: "inset(100% 0 0 0)" },
          {
            clipPath: "inset(0% 0 0 0)",
            duration: 1.4,
            ease: "expo.out",
            scrollTrigger: { trigger: card, start: "top 85%" },
          }
        );
        gsap.to(img, {
          yPercent: -15,
          ease: "none",
          scrollTrigger: {
            trigger: card,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        });
      });

      gsap.from(".port-title-line", {
        yPercent: 100,
        duration: 1.2,
        stagger: 0.08,
        ease: "expo.out",
        scrollTrigger: { trigger: ".port-heading", start: "top 80%" },
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  const sizeClass = (s: string) => {
    if (s === "tall") return "md:row-span-2 aspect-[3/4] md:aspect-[3/5]";
    if (s === "wide") return "md:col-span-2 aspect-[4/3] md:aspect-[16/9]";
    return "aspect-square";
  };

  return (
    <section
      ref={ref}
      id="portfolio"
      className="relative py-32 md:py-48 px-6 md:px-12 max-w-[1600px] mx-auto"
    >
      <div className="port-heading mb-20 md:mb-32">
        <div className="flex items-center gap-4 mb-6 text-[11px] tracking-[0.3em] uppercase text-gold">
          <span className="w-10 h-px bg-gold" />
          <span>Portfólio</span>
        </div>
        <h2 className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1]">
          <span className="reveal-mask block">
            <span className="port-title-line">Seleção de</span>
          </span>
          <span className="reveal-mask block">
            <span className="port-title-line italic text-gold">projetos autorais.</span>
          </span>
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-auto">
        {items.map((it, i) => (
          <article
            key={i}
            className={`port-card group relative overflow-hidden rounded-sm clip-reveal ${sizeClass(
              it.size
            )}`}
            data-cursor="hover"
          >
            <img
              src={it.img}
              alt={it.title}
              className="absolute inset-0 w-full h-[115%] object-cover transition-transform duration-[1.4s] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-bg/0 group-hover:bg-bg/50 transition-colors duration-700" />
            <div className="absolute inset-0 p-6 md:p-8 flex flex-col justify-end opacity-0 translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-700">
              <span className="text-[10px] tracking-[0.3em] uppercase text-gold mb-2">
                {it.category}
              </span>
              <h3 className="font-display text-2xl md:text-3xl">{it.title}</h3>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-20 flex justify-center">
        <a
          href="#contato"
          className="hover-underline text-sm tracking-[0.3em] uppercase text-fg-muted hover:text-gold"
        >
          Ver projeto completo →
        </a>
      </div>
    </section>
  );
}
