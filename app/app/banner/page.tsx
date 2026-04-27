import BannerManager from "@/components/app/BannerManager";

export default function BannerPage() {
  return (
    <div className="p-8 md:p-12">
      <header className="mb-10">
        <h1 className="font-display text-5xl">Banner da Landing</h1>
        <p className="text-fg-muted text-sm mt-2">
          Gerencie as imagens que rodam no topo do site público
        </p>
      </header>
      <BannerManager />
    </div>
  );
}
