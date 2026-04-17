import AgendaView from "@/components/app/AgendaView";

export default function AgendaPage() {
  return (
    <div className="p-8 md:p-12">
      <header className="mb-10">
        <h1 className="font-display text-5xl">Agenda</h1>
        <p className="text-fg-muted text-sm mt-2">Sincronizada com o Google Calendar do Jean</p>
      </header>
      <AgendaView />
    </div>
  );
}
