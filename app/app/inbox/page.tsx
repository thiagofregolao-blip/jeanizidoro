import InboxView from "@/components/app/InboxView";

export default function InboxPage() {
  return (
    <div className="p-8 md:p-12 h-screen flex flex-col">
      <header className="mb-8">
        <h1 className="font-display text-5xl">Inbox</h1>
        <p className="text-fg-muted text-sm mt-2">Conversas WhatsApp em tempo real</p>
      </header>
      <InboxView />
    </div>
  );
}
