export default function Footer() {
  return (
    <footer className="border-t border-line px-6 md:px-12 py-12">
      <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="font-display text-2xl">
          Jean <span className="text-gold">Izidoro</span>
        </div>
        <div className="text-xs tracking-widest uppercase text-fg-muted text-center">
          © {new Date().getFullYear()} · Arquitetura & Eventos · São Paulo
        </div>
        <div className="flex gap-6 text-xs tracking-widest uppercase text-fg-muted">
          <a href="https://instagram.com/jeanizidoro1" className="hover-underline hover:text-gold" target="_blank" rel="noopener">
            Instagram
          </a>
          <a href="#top" className="hover-underline hover:text-gold">
            Topo ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
