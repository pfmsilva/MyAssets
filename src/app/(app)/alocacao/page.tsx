import { hasRole, requireUser } from "@/lib/access";
import { getScope } from "@/lib/scope";
import { logView } from "@/lib/activity";
import { getAllocation } from "@/lib/allocation";
import { getSettings } from "@/lib/settings";
import { ASSET_CLASS_COLOR, ASSET_CLASS_LABEL, fmtEur, fmtPct } from "@/lib/format";
import { Card, PageHeader, StatTile } from "@/components/ui";
import { InvestSummary } from "@/components/InvestSummary";
import { Donut } from "@/components/charts/Donut";
import { AllocationEditor, ClassFixer } from "@/components/AllocationEditor";

export const dynamic = "force-dynamic";

export default async function AllocationPage() {
  const user = await requireUser();
  const editable = hasRole(user.role, "EDITOR");
  logView(user, "Alocação");
  const scope = await getScope(user);
  const settings = await getSettings();
  const a = await getAllocation({ live: true, bandPp: settings.allocationBandPp, assetIds: scope.assetIds });
  const hasTargets = a.targetTotal > 0;
  const off = a.rows.filter((r) => r.status === "over" || r.status === "under");
  const worst = [...a.rows].filter((r) => r.driftPp !== null).sort((x, y) => Math.abs(y.driftPp!) - Math.abs(x.driftPp!))[0];
  const donutCurrent = a.rows.filter((r) => r.current > 0).map((r) => ({ name: ASSET_CLASS_LABEL[r.assetClass], value: r.current, color: ASSET_CLASS_COLOR[r.assetClass] }));
  const donutTarget = a.rows.filter((r) => r.targetPct).map((r) => ({ name: ASSET_CLASS_LABEL[r.assetClass], value: Math.round(a.total * (r.targetPct as number)), color: ASSET_CLASS_COLOR[r.assetClass] }));
  return (
    <>
      <PageHeader
        title="Investimentos · alocação-alvo"
        subtitle={`Repartição do património por classe de ativo face ao alvo definido. ${a.usedLive ? "Valores às cotações do momento onde existem." : "Valores do último registo de cada ativo."}`}
      />
      <InvestSummary assetIds={scope.assetIds} />
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total considerado" value={fmtEur(a.total, 0)} hint={`todo o património · ${a.rows.filter((r) => r.current > 0).length} classes com valor`} />
        <StatTile label="Fora da tolerância" value={hasTargets ? String(off.length) : "—"} hint={hasTargets ? `tolerância de ${a.bandPp} pp` : "defina os alvos abaixo"} />
        <StatTile label="Maior desvio" value={worst?.driftPp != null ? `${worst.driftPp > 0 ? "+" : ""}${worst.driftPp.toFixed(1)} pp` : "—"} hint={worst ? ASSET_CLASS_LABEL[worst.assetClass] : undefined} />
        <StatTile label="Reforço para equilibrar" value={a.newMoneyNeeded != null ? fmtEur(a.newMoneyNeeded, 0) : "—"} hint="dinheiro novo, sem vender nada" />
      </div>
      <Card title="Classes de ativo" className="mt-4">
        <AllocationEditor rows={a.rows} total={a.total} bandPp={a.bandPp} editable={editable} />
        <p className="mt-3 text-xs text-ink-3">
          A barra mostra o peso atual e o traço vertical marca o alvo. <b>Ajustar</b> é quanto comprar (+) ou vender (−) para ficar exatamente no alvo; <b>só com reforço</b> é quanto investir de dinheiro novo em cada classe para chegar ao alvo sem vender nada.
        </p>
      </Card>
      {hasTargets && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Composição atual"><Donut data={donutCurrent} total={a.total} centerLabel="atual" /></Card>
          <Card title="Composição alvo"><Donut data={donutTarget} total={a.total} centerLabel="alvo" /></Card>
        </div>
      )}
      <Card title="Detalhe por classe" className="mt-4">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Classe</th><th>Posições</th><th className="text-right">Valor</th><th className="text-right">Peso</th></tr></thead>
            <tbody>
              {a.rows.filter((r) => r.current > 0).map((r) => (
                <tr key={r.assetClass}>
                  <td><span className="inline-flex items-center gap-2 whitespace-nowrap"><span className="h-2.5 w-2.5 rounded-full" style={{ background: ASSET_CLASS_COLOR[r.assetClass] }} />{ASSET_CLASS_LABEL[r.assetClass]}</span></td>
                  <td className="text-xs text-ink-2">{r.sources.slice(0, 6).map((s) => s.name).join(" · ")}{r.sources.length > 6 ? ` … +${r.sources.length - 6}` : ""}</td>
                  <td className="num text-right">{fmtEur(r.current, 0)}</td>
                  <td className="num text-right">{fmtPct(r.currentPct, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Classificação das posições" className="mt-4">
        <ClassFixer items={a.unclassified} editable={editable} />
      </Card>
    </>
  );
}
