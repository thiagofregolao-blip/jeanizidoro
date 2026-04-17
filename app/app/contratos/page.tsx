import ContractsView from "@/components/app/ContractsView";

export default function ContratosPage() {
  return (
    <div className="p-8 md:p-12">
      <header className="mb-10">
        <h1 className="font-display text-5xl">Contratos</h1>
        <p className="text-fg-muted text-sm mt-2">Assinaturas via Autentique</p>
      </header>
      <ContractsView />
    </div>
  );
}
