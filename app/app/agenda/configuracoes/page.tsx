import AvailabilityRulesView from "@/components/app/AvailabilityRulesView";

export default function AvailabilityRulesPage() {
  return (
    <div className="p-8 md:p-12">
      <header className="mb-10">
        <h1 className="font-display text-5xl">Configurações da agenda</h1>
        <p className="text-fg-muted text-sm mt-2">
          Defina os dias e horários em que o Jean atende reuniões com clientes. Marina vai sugerir esses horários no chat.
        </p>
      </header>
      <AvailabilityRulesView />
    </div>
  );
}
