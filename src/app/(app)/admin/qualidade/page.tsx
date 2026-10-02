import Link from "next/link";
import { logView } from "@/lib/activity";
import { requireUser } from "@/lib/access";
import { checkDataQuality, type QualityLevel } from "@/lib/data-quality";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const LEVEL: Record<QualityLevel, { icon: string; label: string; cls: string }> = {
  error: { icon: "🔴", label: "Erros prováveis", cls: "text-bad" },
  warn: { icon: "🟡", label: "Avisos", cls: "text-warn" },
  info: { icon: "🔵", label: "Notas", cls: "text-ink-2" },
};

export default async function DataQualityPage() {
  const me = await requireUser("ADMIN");
  logView(me, "Admin · Qualidade dos dados");
  const r = await checkDataQuality();
  const levels = (["error", "warn", "info"] as const).filter((l) => r.counts[l]);
  return (
    <div className="space-y-4">
      <Card title="Qualidade dos dados">
        <p className="text-sm text-ink-2">
          Verificações de coerência sobre tudo o que está registado: totais que não batem com as posições, movimentos importados duas vezes, custos de aquisição em falta ou absurdos, registos com data no futuro, vendas de mais ações do que as compradas e despesas sem categoria.
          {" "}Nada aqui falhou: são sinais de que algum dado pode estar errado.
        </p>
        <p className="mt-2 text-sm">
          {r.issues.length ? (
            <>
              {r.counts.error ? <span className="mr-3">🔴 {r.counts.error} erro(s)</span> : null}
              {r.counts.warn ? <span className="mr-3">🟡 {r.counts.warn} aviso(s)</span> : null}
              {r.counts.info ? <span>🔵 {r.counts.info} nota(s)</span> : null}
            </>
          ) : (
            <span className="text-good">✓ Tudo coerente: nenhum sinal de dados errados.</span>
          )}
        </p>
        <p className="mt-1 text-xs text-ink-3">Verificado agora ({new Date(r.checkedAt).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}). As tarefas diárias repetem a verificação e avisam os administradores quando surge um aviso novo.</p>
      </Card>
      {levels.map((l) => (
        <Card key={l} title={`${LEVEL[l].icon} ${LEVEL[l].label} (${r.counts[l]})`}>
          <ul className="divide-y divide-border">
            {r.issues
              .filter((i) => i.level === l)
              .map((i, k) => (
                <li key={`${i.code}-${i.assetId ?? ""}-${k}`} className="py-3 text-sm">
                  <p className={`font-medium ${LEVEL[l].cls}`}>{i.title}</p>
                  {i.detail && <p className="mt-0.5 text-ink-2">{i.detail}</p>}
                  {i.assetId && (
                    <p className="mt-1 text-xs">
                      <Link className="text-accent underline" href={`/ativos/${i.assetId}`}>Abrir {i.assetName}</Link>
                      {i.code.includes("transactions") && <> · <Link className="text-accent underline" href="/movimentos">Movimentos</Link></>}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
