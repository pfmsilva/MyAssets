import Link from "next/link";
import { Prisma } from "@prisma/client";
import { hasRole, requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { assetScopeWhere, canSeeAsset, getScope } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { TransactionTable } from "@/components/TransactionTable";
import { reapplyRules } from "@/app/actions/transactions";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";
type SP = { q?: string; asset?: string; category?: string; month?: string; sign?: string; page?: string };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const editable = hasRole(user.role, "EDITOR");
  const sp = await searchParams;
  const pageN = Math.max(1, Number(sp.page) || 1);
  const take = 100;
  logView(user, "Movimentos", { q: sp.q ?? null, asset: sp.asset ?? null, category: sp.category ?? null, month: sp.month ?? null, page: pageN });
  const scope = await getScope(user);
  const where: Prisma.TransactionWhereInput = scope.all ? {} : { assetId: { in: scope.assetIds } };
  if (sp.q) where.description = { contains: sp.q, mode: "insensitive" };
  if (sp.asset && canSeeAsset(scope, sp.asset)) where.assetId = sp.asset;
  if (sp.category === "none") where.categoryId = null;
  else if (sp.category) where.categoryId = sp.category;
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const [y, m] = sp.month.split("-").map(Number);
    where.date = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }
  if (sp.sign === "in") where.amount = { gt: 0 };
  if (sp.sign === "out") where.amount = { lt: 0 };
  const [rows, count, assets, categories, sum] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy: [{ date: "desc" }, { seq: "desc" }], skip: (pageN - 1) * take, take, include: { asset: { select: { name: true } } } }),
    prisma.transaction.count({ where }),
    prisma.asset.findMany({ where: { transactions: { some: {} }, ...assetScopeWhere(scope) }, orderBy: { sortOrder: "asc" } }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.transaction.aggregate({ where, _sum: { amount: true } }),
  ]);
  const qs = (over: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: undefined, ...over })) if (v) p.set(k, String(v));
    return `?${p.toString()}`;
  };
  return (
    <>
      <PageHeader title="Movimentos" subtitle={`${count} movimentos · soma ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(sum._sum.amount ?? 0)}`} actions={editable ? <ConfirmButton className="btn btn-sm" label="Reaplicar regras aos sem categoria" action={async () => { "use server"; await reapplyRules(false); }} /> : undefined} />
      <Card className="mb-4">
        <form className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-6" method="get">
          <input name="q" placeholder="Pesquisar descrição" defaultValue={sp.q ?? ""} className="min-w-0 sm:col-span-2" />
          <select name="asset" defaultValue={sp.asset ?? ""}><option value="">Todas as contas</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select name="category" defaultValue={sp.category ?? ""}><option value="">Todas as categorias</option><option value="none">Sem categoria</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input name="month" type="month" defaultValue={sp.month ?? ""} />
          <div className="flex min-w-0 gap-1">
            <select name="sign" defaultValue={sp.sign ?? ""} className="flex-1"><option value="">Entradas e saídas</option><option value="out">Saídas</option><option value="in">Entradas</option></select>
            <button className="btn btn-primary" type="submit">Filtrar</button>
          </div>
        </form>
      </Card>
      <Card>
        <TransactionTable rows={rows.map((t) => ({ id: t.id, date: t.date.toISOString(), description: t.description, amount: t.amount, balanceAfter: t.balanceAfter, status: t.status, categoryId: t.categoryId, assetName: t.asset.name, kind: t.kind }))} categories={categories} editable={editable} />
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-ink-3">Página {pageN} de {Math.max(1, Math.ceil(count / take))}</span>
          <div className="flex gap-2">
            {pageN > 1 && <Link className="btn btn-sm" href={qs({ page: String(pageN - 1) })}>← Anterior</Link>}
            {pageN * take < count && <Link className="btn btn-sm" href={qs({ page: String(pageN + 1) })}>Seguinte →</Link>}
          </div>
        </div>
      </Card>
    </>
  );
}
