import Link from "next/link";
import { requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { globalSearch, GROUP_LABEL } from "@/lib/search";
import { fmtEur } from "@/lib/format";
import { Card, Empty, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  logView(user, "Pesquisa", { q: q || null });
  const { groups, hits, txCount } = await globalSearch(user, q, { perGroup: 25 });

  return (
    <>
      <PageHeader title="Pesquisa" subtitle={q ? `${hits.length} resultado(s) para «${q}»${txCount && txCount > 25 ? ` (movimentos: ${txCount} no total)` : ""}` : "Pesquise ativos, membros, ações, categorias, movimentos e páginas."} />
      <Card className="mb-4">
        <form method="get" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Pesquisar em toda a aplicação" className="min-w-0 flex-1" autoFocus />
          <button className="btn btn-primary" type="submit">Pesquisar</button>
        </form>
      </Card>

      {q.length < 2 ? (
        <Card><Empty>Escreva pelo menos duas letras.</Empty></Card>
      ) : groups.length === 0 ? (
        <Card><Empty>Sem resultados para «{q}».</Empty></Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.group} title={`${GROUP_LABEL[g.group]} (${g.hits.length}${g.group === "movimento" && txCount && txCount > g.hits.length ? ` de ${txCount}` : ""})`}>
              <ul className="divide-y divide-border">
                {g.hits.map((h) => (
                  <li key={`${h.group}-${h.id}`}>
                    <Link href={h.href} className="flex items-center justify-between gap-3 py-2 hover:text-accent">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{h.title}</span>
                        {h.subtitle && <span className="block truncate text-xs text-ink-3">{h.subtitle}</span>}
                      </span>
                      {h.amount != null && <span className={`num shrink-0 text-sm ${h.amount < 0 ? "text-bad" : "text-good"}`}>{fmtEur(h.amount, 2)}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              {g.group === "movimento" && txCount && txCount > g.hits.length ? (
                <p className="pt-2 text-xs text-ink-3"><Link className="underline" href={`/movimentos?q=${encodeURIComponent(q)}`}>Ver os {txCount} movimentos na página de movimentos</Link></p>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
