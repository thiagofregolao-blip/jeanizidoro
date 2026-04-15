import ContactsView from "@/components/app/ContactsView";

export default function ContactsPage() {
  return (
    <div className="p-8 md:p-12">
      <header className="mb-10">
        <h1 className="font-display text-5xl">Contatos & VIPs</h1>
        <p className="text-fg-muted text-sm mt-2">
          Marque contatos como VIP para que a IA <strong>nunca</strong> responda automaticamente
        </p>
      </header>
      <ContactsView />
    </div>
  );
}
