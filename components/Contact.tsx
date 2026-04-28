"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export default function Contact() {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".contact-line", {
        yPercent: 100,
        duration: 1.4,
        stagger: 0.1,
        ease: "expo.out",
        scrollTrigger: { trigger: ref.current, start: "top 70%" },
      });
      gsap.from(".contact-side", {
        y: 40,
        opacity: 0,
        duration: 1.2,
        stagger: 0.1,
        ease: "expo.out",
        scrollTrigger: { trigger: ref.current, start: "top 65%" },
      });
    }, ref);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={ref}
      id="contato"
      className="relative py-32 md:py-48 px-6 md:px-12"
    >
      <div className="max-w-[1600px] mx-auto grid md:grid-cols-12 gap-12 items-end">
        <div className="md:col-span-8">
          <div className="flex items-center gap-4 mb-8 text-[11px] tracking-[0.3em] uppercase text-gold">
            <span className="w-10 h-px bg-gold" />
            <span>Contato</span>
          </div>
          <h2 className="font-display text-[clamp(3rem,9vw,9rem)] leading-[0.95] tracking-tight">
            <span className="reveal-mask block">
              <span className="contact-line">Vamos criar</span>
            </span>
            <span className="reveal-mask block">
              <span className="contact-line italic text-gold">algo memorável.</span>
            </span>
          </h2>
        </div>

        <div className="md:col-span-4 flex flex-col gap-6">
          <a
            href="https://wa.me/5543984991295?text=Ol%C3%A1!%20Vim%20do%20site%2C%20gostaria%20de%20um%20or%C3%A7amento."
            target="_blank"
            rel="noopener"
            className="contact-side group luxury-glass p-8 rounded-sm block transition-all duration-500 hover:border-gold/40"
            data-cursor="hover"
          >
            <div className="text-[10px] tracking-[0.3em] uppercase text-gold mb-3">
              WhatsApp
            </div>
            <div className="font-display text-3xl group-hover:text-gold transition-colors">
              +55 (43) 9 8499-1295
            </div>
            <div className="text-fg-muted text-sm mt-2">Orçamentos e briefing</div>
          </a>

          <a
            href="mailto:arq.jeanizidoro@gmail.com"
            className="contact-side group luxury-glass p-8 rounded-sm block transition-all duration-500 hover:border-gold/40"
            data-cursor="hover"
          >
            <div className="text-[10px] tracking-[0.3em] uppercase text-gold mb-3">
              Email
            </div>
            <div className="font-display text-2xl group-hover:text-gold transition-colors break-all">
              arq.jeanizidoro@gmail.com
            </div>
          </a>

          <a
            href="https://instagram.com/jeanizidoro1"
            target="_blank"
            rel="noopener"
            className="contact-side group luxury-glass p-8 rounded-sm block transition-all duration-500 hover:border-gold/40"
            data-cursor="hover"
          >
            <div className="text-[10px] tracking-[0.3em] uppercase text-gold mb-3">
              Instagram
            </div>
            <div className="font-display text-2xl group-hover:text-gold transition-colors">
              @jeanizidoro1
            </div>
          </a>
        </div>
      </div>
    </section>
  );
}
