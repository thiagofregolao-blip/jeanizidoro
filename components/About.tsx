"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function About() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      gsap.to(".about-img img", {
        yPercent: -15,
        ease: "none",
        scrollTrigger: {
          trigger: ".about-img",
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });

      gsap.from(".about-reveal", {
        clipPath: "inset(100% 0 0 0)",
        duration: 1.4,
        ease: "expo.out",
        scrollTrigger: {
          trigger: ref.current,
          start: "top 70%",
        },
      });

      gsap.from(".about-line", {
        yPercent: 100,
        opacity: 0,
        duration: 1.2,
        stagger: 0.08,
        ease: "expo.out",
        scrollTrigger: {
          trigger: ".about-text",
          start: "top 75%",
        },
      });

      gsap.from(".about-stat", {
        y: 40,
        opacity: 0,
        duration: 1,
        stagger: 0.15,
        ease: "expo.out",
        scrollTrigger: {
          trigger: ".about-stats",
          start: "top 85%",
        },
      });
    }, ref);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={ref}
      id="sobre"
      className="relative py-32 md:py-48 px-6 md:px-12 max-w-[1600px] mx-auto"
    >
      <div className="grid md:grid-cols-12 gap-12 md:gap-20 items-center">
        <div className="md:col-span-5 about-reveal clip-reveal overflow-hidden">
          <div className="about-img overflow-hidden rounded-sm">
            <img
              src="https://images.unsplash.com/photo-1519225421980-715cb0215aed?q=80&w=1600&auto=format&fit=crop"
              alt="Jean Izidoro"
              className="w-full h-[120%] object-cover"
            />
          </div>
        </div>

        <div className="md:col-span-7 about-text">
          <div className="flex items-center gap-4 mb-8 text-[11px] tracking-[0.3em] uppercase text-gold">
            <span className="w-10 h-px bg-gold" />
            <span>Sobre</span>
          </div>

          <h2 className="font-display text-[clamp(2.5rem,6vw,5rem)] leading-[1] mb-10">
            <span className="reveal-mask block">
              <span className="about-line">Um olhar</span>
            </span>
            <span className="reveal-mask block">
              <span className="about-line italic text-gold">autoral</span>
            </span>
            <span className="reveal-mask block">
              <span className="about-line">sobre cada</span>
            </span>
            <span className="reveal-mask block">
              <span className="about-line italic">celebração.</span>
            </span>
          </h2>

          <div className="space-y-5 text-fg-muted text-base md:text-lg leading-relaxed max-w-xl">
            <p>
              Há mais de uma década, Jean Izidoro transforma espaços em
              narrativas visuais. Com repertório em arquitetura e paixão pela
              cenografia, assina projetos que traduzem personalidade em ambiente
              — do íntimo ao monumental.
            </p>
            <p>
              Cada evento é concebido como uma obra única: estudo de espaço,
              paleta, iluminação e camadas sensoriais se encontram para criar
              experiências que permanecem na memória.
            </p>
          </div>

          <div className="about-stats grid grid-cols-3 gap-6 mt-16 pt-10 border-t border-line">
            <div className="about-stat">
              <div className="font-display text-4xl md:text-5xl text-gold">+10</div>
              <div className="text-xs tracking-widest uppercase text-fg-muted mt-2">
                Anos de ofício
              </div>
            </div>
            <div className="about-stat">
              <div className="font-display text-4xl md:text-5xl text-gold">+500</div>
              <div className="text-xs tracking-widest uppercase text-fg-muted mt-2">
                Eventos assinados
              </div>
            </div>
            <div className="about-stat">
              <div className="font-display text-4xl md:text-5xl text-gold">100%</div>
              <div className="text-xs tracking-widest uppercase text-fg-muted mt-2">
                Projeto autoral
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
