import Link from "next/link";
import { requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { getScope, memberScopeWhere } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { byMember, getCurrentValues } from "@/lib/analytics";
import { fmtEur, fmtPct } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const user = await requireUser();
  logView(user, "Família");
  const scope = await getScope(user);
  const [values, members] = await Promise.all([getCurrentValues({ assetIds: scope.assetIds }), prisma.member.findMany({ where: memberScopeWhere(scope), orderBy: { sortOrder: "asc" } })]);
  const totals = byMember(values);
  const grand = totals.reduce((s, m) => s + m.value, 0);
  return (
    <>
      <PageHeader title="Família" subtitle="Património de cada membro, segundo as percentagens de titularidade." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => {
          const t = totals.find((x) => x.id === m.id);
          const assets = values.filter((a) => a.owners.some((o) => o.memberId === m.id));
          return (
            <Link key={m.id} href={`/membros/${m.id}`} className="block">
              <Card className="h-full transition hover:border-accent">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ background: m.color }}>{m.name[0]}</span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{m.name}</p>
                    <p className="text-xs text-ink-3">{assets.length} ativo(s) · {grand ? fmtPct((t?.value ?? 0) / grand, 0) : "0 %"} do total</p>
                  </div>
                </div>
                <p className="num mt-3 text-2xl font-semibold">{fmtEur(t?.value ?? 0, 0)}</p>
                <ul className="mt-2 space-y-1 text-xs text-ink-2">
                  {assets.slice(0, 4).map((a) => {
                    const o = a.owners.find((x) => x.memberId === m.id)!;
                    return <li key={a.id} className="flex justify-between"><span className="truncate">{a.name}{o.percent < 100 ? ` (${o.percent}%)` : ""}</span><span className="num">{fmtEur((a.value * o.percent) / 100, 0)}</span></li>;
                  })}
                  {assets.length > 4 && <li className="text-ink-3">+ {assets.length - 4} mais</li>}
                </ul>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
