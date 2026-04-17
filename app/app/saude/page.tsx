import HealthDashboard from "@/components/app/HealthDashboard";

export default function SaudePage() {
  return (
    <div className="p-8 md:p-12">
      <header className="mb-10">
        <h1 className="font-display text-5xl">Saúde do Sistema</h1>
        <p className="text-fg-muted text-sm mt-2">
          Monitore erros, circuit breaker e falhas em tempo real
        </p>
      </header>
      <HealthDashboard />
    </div>
  );
}
