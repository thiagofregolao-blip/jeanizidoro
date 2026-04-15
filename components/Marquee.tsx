const words = [
  "Casamentos",
  "Cenografia",
  "Corporativo",
  "Produção",
  "Design",
  "Iluminação",
  "Arquitetura",
];

export default function Marquee() {
  return (
    <section className="py-10 border-y border-line overflow-hidden">
      <div className="marquee">
        <div className="marquee-track">
          {[...words, ...words, ...words].map((w, i) => (
            <span
              key={i}
              className="font-display italic text-5xl md:text-7xl text-fg-muted whitespace-nowrap"
            >
              {w}
              <span className="text-gold mx-8">✦</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
