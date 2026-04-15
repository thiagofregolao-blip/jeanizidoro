export default function AgendaPage() {
  return (
    <div className="p-8 md:p-12">
      <header className="mb-10">
        <h1 className="font-display text-5xl">Agenda</h1>
        <p className="text-fg-muted text-sm mt-2">Sincronizada com Google Calendar</p>
      </header>
      <div className="luxury-glass p-12 rounded-sm text-center">
        <div className="text-6xl mb-4">📅</div>
        <h3 className="font-display text-2xl mb-2">Em construção (Fase 3)</h3>
        <p className="text-fg-muted text-sm max-w-md mx-auto">
          Integração Google Calendar via OAuth — você verá datas livres/ocupadas e a IA consultará
          antes de sugerir datas para clientes.
        </p>
      </div>
    </div>
  );
}
