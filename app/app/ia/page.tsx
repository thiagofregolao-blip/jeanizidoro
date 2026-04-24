import AiConfigForm from "@/components/app/AiConfigForm";

export default function IaPage() {
  return (
    <div className="p-8 md:p-12 max-w-4xl">
      <header className="mb-10">
        <h1 className="font-display text-5xl">Configurar IA</h1>
        <p className="text-fg-muted text-sm mt-2">
          Defina como a Marina (sua assistente virtual) responde os clientes
        </p>
      </header>
      <AiConfigForm />
    </div>
  );
}
