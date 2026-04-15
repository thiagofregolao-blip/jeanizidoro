"use client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/auth");
        router.refresh();
      }}
      className="text-xs tracking-widest uppercase text-fg-muted hover:text-gold"
    >
      Sair
    </button>
  );
}
