import LeadsBoard from "@/components/app/LeadsBoard";

export default function LeadsPage() {
  return (
    <div className="p-8 md:p-12">
      <header className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-5xl">Leads</h1>
          <p className="text-fg-muted text-sm mt-2">
            Kanban de oportunidades classificadas pela IA
          </p>
        </div>
      </header>
      <LeadsBoard />
    </div>
  );
}
