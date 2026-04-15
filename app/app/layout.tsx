import Link from "next/link";
import { getSession } from "@/lib/auth";
import LogoutButton from "@/components/app/LogoutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="min-h-screen bg-bg text-fg flex">
      <aside className="w-64 border-r border-line p-6 flex flex-col gap-2">
        <Link href="/app" className="font-display text-2xl mb-8 block">
          Jean <span className="text-gold">Izidoro</span>
          <div className="text-[9px] tracking-[0.3em] uppercase text-fg-muted mt-1">CRM</div>
        </Link>

        <NavLink href="/app">Leads</NavLink>
        <NavLink href="/app/inbox">Inbox</NavLink>
        <NavLink href="/app/agenda">Agenda</NavLink>
        <NavLink href="/app/contratos">Contratos</NavLink>
        <NavLink href="/app/contatos">Contatos & VIPs</NavLink>
        <NavLink href="/app/ia">Configurar IA</NavLink>

        <div className="mt-auto pt-6 border-t border-line">
          <div className="text-xs text-fg-muted mb-2">{session?.email}</div>
          <LogoutButton />
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 text-sm tracking-wider uppercase text-fg-muted hover:text-gold hover:bg-bg-soft rounded-sm transition-colors"
    >
      {children}
    </Link>
  );
}
