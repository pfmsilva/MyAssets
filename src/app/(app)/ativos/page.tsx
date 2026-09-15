import Link from "next/link";
import { requireUser } from "@/lib/access";
import { getCurrentValues } from "@/lib/analytics";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur } from "@/lib/format";
import { Badge, Card, Money, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const user = await requireUser();
  const values = await getCurrentValues();
  const total = values.reduce((s, a) => s + a.value, 0);
  const groups = Object.entries(
    values.reduce<Record<string, typeof values>>((acc, a) => {
      (acc[a.type] ??= []).push(a);
      return acc;
    }, {}),
  );
  return (
    <>
      <PageHeader title="Ativos" subtitle={`Total: ${fmtEur(total)}`} actions={user.role !== "VIEWER" ? <Link href="/importar" className="btn btn-primary">Importar ficheiro</Link> : undefined} />
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
    </>
  );
}
