import DashboardView from "@/components/app/DashboardView";

export default function DashboardPage() {
  return (
    <div className="p-8 md:p-12">
      <header className="mb-10">
        <h1 className="font-display text-5xl">Dashboard</h1>
        <p className="text-fg-muted text-sm mt-2">Visão geral da operação — leads parados, conversão e tempo médio</p>
      </header>
      <DashboardView />
    </div>
  );
}
