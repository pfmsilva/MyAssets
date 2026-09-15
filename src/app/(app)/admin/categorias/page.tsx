import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { logView } from "@/lib/activity";
import { CATEGORY_KIND_LABEL } from "@/lib/format";
import { Card } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { addRule, deleteCategory, deleteRule, upsertCategory } from "@/app/actions/admin";
import { reapplyRules } from "@/app/actions/transactions";

export const dynamic = "force-dynamic";

export default async function CategoriesAdmin() {
  const session = await auth();
  if (session?.user) logView(session.user, "Admin · Categorias");
  const categories = await prisma.category.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }], include: { rules: { orderBy: { priority: "desc" } }, _count: { select: { transactions: true } } } });
  const renderCatFields = (c?: (typeof categories)[number]) => (
    <div className="grid gap-3 sm:grid-cols-3">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="flex flex-col gap-1"><label>Nome</label><input name="name" required defaultValue={c?.name} /></div>
      <div className="flex flex-col gap-1"><label>Tipo</label><select name="kind" defaultValue={c?.kind ?? "EXPENSE"}>{Object.entries(CATEGORY_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="flex flex-col gap-1"><label>Cor</label><input name="color" type="color" defaultValue={c?.color ?? "#2a78d6"} className="h-10 w-16 p-1" /></div>
    </div>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-2">
        <p>Regras: texto contido na descrição (sem acentos/maiúsculas) ou expressão regular entre barras, ex. <code>/^TRF SEPA.*DEGIRO/i</code>. Prioridade maior ganha.</p>
        <div className="flex gap-2">
          <ConfirmButton className="btn btn-sm" label="Aplicar regras aos sem categoria" action={async () => { "use server"; await reapplyRules(false); }} />
          <ConfirmButton className="btn btn-sm" label="Reclassificar tudo" confirm="Isto substitui categorias já atribuídas manualmente por aquelas que as regras ditam. Continuar?" action={async () => { "use server"; await reapplyRules(true); }} />
        </div>
      </div>
      {categories.map((c) => (
        <Card key={c.id} title={<span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: c.color }} />{c.name} <span className="font-normal text-ink-3">· {CATEGORY_KIND_LABEL[c.kind]} · {c._count.transactions} mov.</span></span>}
          action={<details><summary className="btn btn-sm cursor-pointer list-none">editar</summary><div className="absolute right-4 z-10 mt-2 w-[min(90vw,32rem)] rounded-lg border border-border bg-surface p-3 shadow-lg"><ActionForm action={upsertCategory}>{renderCatFields(c)}</ActionForm><div className="mt-2"><ConfirmButton label="apagar categoria" confirm={`Apagar "${c.name}"? Os movimentos ficam sem categoria.`} action={deleteCategory.bind(null, c.id)} /></div></div></details>}>
          <div className="flex flex-wrap gap-1">
            {c.rules.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs">
                <code>{r.pattern}</code>{r.priority !== 0 && <span className="text-ink-3">p{r.priority}</span>}
                <ConfirmButton className="text-ink-3 hover:text-bad" label="×" action={deleteRule.bind(null, r.id)} />
              </span>
            ))}
            {!c.rules.length && <span className="text-xs text-ink-3">sem regras</span>}
          </div>
          <ActionForm action={addRule} submitLabel="+ regra" className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="categoryId" value={c.id} />
            <input name="pattern" placeholder="Padrão" required className="w-56 py-1 text-xs" />
            <input name="priority" type="number" placeholder="prio." defaultValue={0} className="w-16 py-1 text-xs" />
          </ActionForm>
        </Card>
      ))}
      <Card title="Nova categoria"><ActionForm action={upsertCategory} submitLabel="Adicionar">{renderCatFields()}</ActionForm></Card>
    </div>
  );
}
