import Link from "next/link";
import { requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { getScope, memberScopeWhere } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { byMember, getCurrentValues } from "@/lib/analytics";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur, fmtPct } from "@/lib/format";
import { Badge, Card, Money, PageHeader } from "@/components/ui";
import { FilterLinks } from "@/components/Filters";

export const dynamic = "force-dynamic";

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const user = await requireUser();
  const { ver } = await searchParams;
  const byMemberView = ver === "membro";
  logView(user, "Ativos", { vista: byMemberView ? "membro" : "ativo" });
  const scope = await getScope(user);
  const values = await getCurrentValues({ assetIds: scope.assetIds });
  const members = byMemberView ? await prisma.member.findMany({ where: memberScopeWhere(scope), orderBy: { sortOrder: "asc" } }) : [];
  const memberTotals = byMemberView ? byMember(values) : [];
  const total = values.reduce((s, a) => s + a.value, 0);
  const groups = Object.entries(
    values.reduce<Record<string, typeof values>>((acc, a) => {
      (acc[a.type] ??= []).push(a);
      return acc;
    }, {}),
  );
  return (
    <>
      <PageHeader
        title="Ativos"
        subtitle={`Total: ${fmtEur(total)}`}
        actions={
          <>
            <FilterLinks
              label="ver por:"
              current={byMemberView ? "membro" : "ativo"}
              options={[
                { value: "ativo", label: "Ativo", href: "/ativos" },
                { value: "membro", label: "Membro da família", href: "/ativos?ver=membro" },
              ]}
            />
            {user.role !== "VIEWER" ? <Link href="/importar" className="btn btn-primary">Importar ficheiro</Link> : null}
          </>
        }
      />
      {byMemberView ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const t = memberTotals.find((x) => x.id === m.id);
            const assets = values.filter((a) => a.owners.some((o) => o.memberId === m.id));
            return (
              <Link key={m.id} href={`/membros/${m.id}`} className="block">
                <Card className="h-full transition hover:border-accent">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold text-white" style={{ background: m.color }}>{m.name[0]}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{m.name}</p>
                      <p className="text-xs text-ink-3">{assets.length} ativo(s) · {total ? fmtPct((t?.value ?? 0) / total, 0) : "0 %"} do total</p>
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
          {!members.length && <Card><p className="text-sm text-ink-3">Ainda sem membros da família configurados.</p></Card>}
        </div>
      ) : (
      <div className="space-y-4">
        {groups.map(([type, list]) => (
          <Card key={type} title={`${ASSET_TYPE_LABEL[type] ?? type} · ${fmtEur(list.reduce((s, a) => s + a.value, 0), 0)}`}>
            <ul className="divide-y divide-border/60">
              {list.map((a) => (
                <li key={a.id}>
                  <Link href={`/ativos/${a.id}`} className="flex items-center justify-between gap-3 py-2 hover:bg-surface-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="text-xs text-ink-3">{a.institution}{a.importer ? ` · importação ${a.importer.toUpperCase()}` : " · registo manual"}</p>
                      <div className="mt-1 flex flex-wrap gap-1">{a.owners.map((o) => <Badge key={o.memberId} color={o.color}>{o.memberName}{o.percent < 100 ? ` ${o.percent}%` : ""}</Badge>)}</div>
                    </div>
                    <div className="text-right">
                      <Money value={a.value} className="font-medium" />
                      <p className="text-xs text-ink-3">{a.date ? fmtDate(a.date) : "sem valor"}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      )}
    </>
  );
}
