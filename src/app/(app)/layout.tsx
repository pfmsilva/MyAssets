import Link from "next/link";
import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";
import { BottomNav, GroupTabs, SideNav, NavItem } from "@/components/nav";
import { NAV_GROUPS } from "@/lib/nav-groups";
import { hasRole, ROLE_LABEL } from "@/lib/access";
import { versionLabel, versionTitle } from "@/lib/version";
import { getSettings } from "@/lib/settings";
import { GlobalSearch } from "@/components/GlobalSearch";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = session.user;
  const settings = await getSettings();
  const items: NavItem[] = NAV_GROUPS.filter((g) => !g.min || hasRole(user.role, g.min)).map((g) => ({ href: g.href, label: g.label, icon: g.icon, short: g.short }));
  const mobileItems = items.filter((i) => ["/", "/ativos", "/despesas", "/rentabilidade"].includes(i.href));
  const more = items.filter((i) => !mobileItems.includes(i));

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface px-3 py-4 md:flex">
        <Link href="/" className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon.svg" alt="" className="h-8 w-8" />
          <span className="text-lg font-semibold">Pecúlio</span>
        </Link>
        <div className="mb-3">
          <GlobalSearch placeholder="Pesquisar (Ctrl+K)" />
        </div>
        <SideNav items={items} />
        <div className="mt-auto border-t border-border pt-3">
          <p className="truncate px-2 text-sm font-medium">{user.name ?? user.email}</p>
          <p className="truncate px-2 text-xs text-ink-3">{ROLE_LABEL[user.role]}</p>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button className="btn btn-sm mt-2 w-full" type="submit">Sair</button>
          </form>
          <p className="mt-2 px-2 text-[10px] text-ink-3" title={versionTitle()}>{versionLabel()}</p>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-2 backdrop-blur md:hidden" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)" }}>
          <Link href="/" className="flex items-center gap-2">
            <img src="/icon.svg" alt="" className="h-7 w-7" />
            <span className="font-semibold">Pecúlio</span>
          </Link>
          <div className="mx-2 min-w-0 flex-1">
            <GlobalSearch placeholder="Pesquisar" />
          </div>
          <details className="relative">
            <summary className="btn btn-sm cursor-pointer list-none">{(user.name ?? user.email).split(" ")[0]}</summary>
            <div className="absolute right-0 mt-1 w-48 rounded-lg border border-border bg-surface p-2 shadow-lg">
              <p className="px-2 pb-2 text-xs text-ink-3">{ROLE_LABEL[user.role]}</p>
              {more.map((m) => (
                <Link key={m.href} href={m.href} className="block rounded px-2 py-1.5 text-sm hover:bg-surface-2">{m.label}</Link>
              ))}
              <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
                <button className="btn btn-sm mt-1 w-full" type="submit">Sair</button>
              </form>
              <p className="mt-2 px-2 text-[10px] text-ink-3" title={versionTitle()}>{versionLabel()}</p>
            </div>
          </details>
        </header>
        <main className="px-4 py-4 pb-24 md:px-8 md:py-6 md:pb-8">
          <GroupTabs aiEnabled={settings.aiEnabled} />
          {children}
        </main>
      </div>
      <BottomNav items={mobileItems} />
    </div>
  );
}
