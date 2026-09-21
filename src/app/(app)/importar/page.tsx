import Link from "next/link";
import { requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { assetIdScopeWhere, assetScopeWhere, getScope } from "@/lib/scope";
import { prisma } from "@/lib/prisma";
import { IMPORTERS } from "@/lib/importers";
import { fmtDate } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { ImportForm } from "@/components/ImportForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteImportBatch } from "@/app/actions/import";

export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ asset?: string }> }) {
  const user = await requireUser("EDITOR");
  const { asset } = await searchParams;
  logView(user, "Importar");
  const scope = await getScope(user);
  const [assets, batches] = await Promise.all([
    prisma.asset.findMany({ where: { active: true, ...assetScopeWhere(scope) }, orderBy: [{ importer: "asc" }, { sortOrder: "asc" }] }),
    prisma.importBatch.findMany({ where: assetIdScopeWhere(scope), orderBy: { createdAt: "desc" }, take: 20, include: { asset: true, user: { select: { name: true, email: true } } } }),
  ]);
  const importers = Object.entries(IMPORTERS).map(([key, v]) => ({ key, label: v.label, accept: v.accept, needsBalance: v.needsBalance }));
  return (
    <>
      <PageHeader title="Importar ficheiros" subtitle="Extratos BPI (.xlsx), Revolut (.csv), transações Revolut Investimentos (.csv), Banco CTT (.xlsx), carteira DEGIRO (.xls), relatório XTB (.xlsx) e extrato mensal Optimize (.pdf). Movimentos repetidos são ignorados; o histórico nunca é apagado." />
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3"><ImportForm assets={assets.map((a) => ({ id: a.id, name: a.name, importer: a.importer }))} importers={importers} initialAsset={asset} /></Card>
        <Card title="Como obter os ficheiros" className="lg:col-span-2 text-sm text-ink-2">
          <ul className="list-inside list-disc space-y-1">
            <li><b>BPI Net</b>: Contas → Movimentos → exportar para Excel (.xlsx). Inclui o saldo e os movimentos apresentados.</li>
            <li><b>Revolut</b>: App → Conta → Extrato → CSV (Excel). Pode exportar todo o histórico; só os novos são adicionados.</li>
            <li><b>Revolut Investimentos</b>: exportar as transações (CSV com Data, Produto, ISIN, Quantidade, Valor EUR e ID da ordem). Cada linha vira uma compra ou venda numa <b>carteira de ações</b>: escolha um ativo do tipo &laquo;Carteira de ações (manual)&raquo; e a app cria as ações por ISIN, calcula quantidade, preço médio, mais-valias e o valor ao momento pelo Yahoo. Pode importar o ficheiro desde o início; repetidos são ignorados.</li>
            <li><b>Banco CTT</b>: Conta à Ordem → Movimentos → Exportar (Excel). Não traz saldo: indique o saldo atual da app CTT.</li>
            <li><b>DEGIRO</b>: Carteira → Exportar → XLS. É um retrato do dia; indique a data.</li>
            <li><b>XTB</b>: xStation → Relatórios / Histórico de conta → exportar Excel com posições abertas e operações de caixa desde o início da conta. Regista a carteira à data do relatório (posições + dinheiro) e as operações como movimentos.</li>
            <li><b>Optimize</b>: Espaço Cliente → Consultas → Documentação → extrato mensal (PDF). Regista o valor no fim do mês (posições por subconta, custo médio e valia), o valor do mês anterior e os depósitos/subscrições. Importe os extratos de vários meses para construir o histórico.</li>
            <li>Ativos sem importador (PPR Save and Grow, Binance, dinheiro): registe o valor na página do ativo.</li>
          </ul>
        </Card>
      </div>
      <Card title="Últimas importações" className="mt-4">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Data</th><th>Ativo</th><th>Ficheiro</th><th className="text-right">Novos / total</th><th>Por</th><th></th></tr></thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap">{fmtDate(b.createdAt)}</td>
                  <td><Link href={`/ativos/${b.assetId}`} className="hover:underline">{b.asset.name}</Link></td>
                  <td className="max-w-[24ch] truncate" title={b.fileName}>{b.fileName}</td>
                  <td className="num text-right">{b.rowsNew} / {b.rowsTotal}</td>
                  <td className="text-xs text-ink-3">{b.user?.name ?? b.user?.email ?? "—"}</td>
                  <td className="text-right"><ConfirmButton label="anular" confirm="Anular esta importação apaga os movimentos e o snapshot que ela criou. Continuar?" action={deleteImportBatch.bind(null, b.id)} /></td>
                </tr>
              ))}
              {!batches.length && <tr><td colSpan={6} className="py-6 text-center text-ink-3">Ainda sem importações.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
