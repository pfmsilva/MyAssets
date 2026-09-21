import Link from "next/link";
import { hasRole, requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { getSettings } from "@/lib/settings";
import { aiConfigured, AI_MODEL, latestAnalysis, AnalysisSchema, type Analysis } from "@/lib/ai-analysis";
import { prisma } from "@/lib/prisma";
import { fmtEur } from "@/lib/format";
import { Alert, Card, Empty, PageHeader } from "@/components/ui";
import { getScope } from "@/lib/scope";
import { AiAnalysisRun } from "@/components/AiAnalysisRun";

export const dynamic = "force-dynamic";

const SEVERITY: Record<string, { label: string; cls: string }> = {
  alta: { label: "alta", cls: "bg-bad/10 text-bad" },
  media: { label: "média", cls: "bg-warn/10 text-warn" },
  baixa: { label: "baixa", cls: "bg-accent/10 text-accent" },
};

function Tag({ level }: { level: string }) {
  const s = SEVERITY[level] ?? SEVERITY.baixa;
  return <span className={`rounded-full px-2 py-0.5 text-xs ${s.cls}`}>{s.label}</span>;
}

const dateTime = (d: Date) => d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", dateStyle: "short", timeStyle: "short" });

export default async function AnalysisPage() {
  const user = await requireUser();
  logView(user, "Análise de IA");
  const isAdmin = hasRole(user.role, "ADMIN");
  const scope = await getScope(user);
  const s = await getSettings();
  if (!scope.all) {
    return (
      <>
        <PageHeader title="Análise de IA" subtitle="Leitura do património feita pelo Claude a partir dos números que a aplicação calcula." />
        <Alert kind="info">A análise cobre o património de toda a família, por isso só está disponível a quem vê todos os ativos.</Alert>
      </>
    );
  }
  const [last, history] = await Promise.all([
    latestAnalysis(),
    prisma.aiAnalysis.findMany({ orderBy: { createdAt: "desc" }, skip: 1, take: 10, select: { id: true, createdAt: true, createdBy: true, model: true, costUsd: true } }),
  ]);
  const parsed = last ? AnalysisSchema.safeParse(last.result) : null;
  const a: Analysis | null = parsed?.success ? parsed.data : null;

  return (
    <>
      <PageHeader
        title="Análise de IA"
        subtitle="Uma leitura do património feita pelo Claude a partir dos números que a aplicação calcula. Serve para levantar questões, não para decidir por si."
      />

      {!s.aiEnabled && (
        <Alert kind="info">
          A análise está desativada. {isAdmin ? <>Ative-a em <Link className="underline" href="/admin/definicoes">Administração · Definições</Link>.</> : "Peça a um administrador para a ativar."}
        </Alert>
      )}
      {s.aiEnabled && !aiConfigured() && <Alert kind="error">Falta a variável <code>ANTHROPIC_API_KEY</code> no ambiente (Vercel → Settings → Environment Variables).</Alert>}

      {isAdmin && (
        <Card title="Nova análise" className="mt-4">
          <p className="mb-3 text-sm text-ink-2">
            É enviado ao modelo um resumo do património já calculado — totais por tipo e por membro, evolução dos últimos 12 meses, alocação face ao alvo, as maiores posições, rentabilidade das carteiras, liquidez, despesa e poupança. Não são enviados movimentos, números de conta nem dados de acesso.{" "}
            {s.aiAnonymize ? "Os nomes dos membros vão substituídos por «Membro 1, 2, …»." : "Os nomes dos membros vão tal como estão registados."}
          </p>
          <AiAnalysisRun disabled={!s.aiEnabled || !aiConfigured()} hint={`Modelo ${AI_MODEL}. Cada análise custa poucos cêntimos, cobrados na conta Anthropic associada à chave.`} />
        </Card>
      )}

      {!a ? (
        <Card title="Última leitura" className="mt-4">
          <Empty>Ainda não há nenhuma análise.{isAdmin ? "" : " Peça a um administrador para executar a primeira."}</Empty>
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          <Card title={`Leitura de ${dateTime(last!.createdAt)}`}>
            <p className="text-sm leading-relaxed text-ink">{a.resumo}</p>
            <p className="mt-3 text-xs text-ink-3">Pedida por {last!.createdBy} · modelo {last!.model} · {last!.inputTokens.toLocaleString("pt-PT")} tokens de entrada, {last!.outputTokens.toLocaleString("pt-PT")} de saída · custo estimado {last!.costUsd.toFixed(3)} USD</p>
          </Card>

          {a.observacoes.length > 0 && (
            <Card title="Observações">
              <ul className="space-y-3">
                {a.observacoes.map((o, i) => (
                  <li key={i}>
                    <p className="text-sm font-medium">{o.titulo}</p>
                    <p className="text-sm text-ink-2">{o.detalhe}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {a.riscos.length > 0 && (
            <Card title="Riscos">
              <ul className="space-y-3">
                {a.riscos.map((r, i) => (
                  <li key={i}>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{r.titulo} <Tag level={r.gravidade} /></p>
                    <p className="text-sm text-ink-2">{r.detalhe}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {a.sugestoes.length > 0 && (
            <Card title="Sugestões">
              <ul className="space-y-3">
                {a.sugestoes.map((g, i) => (
                  <li key={i}>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {g.titulo} <Tag level={g.prioridade} />
                      {g.classe && <span className="text-xs text-ink-3">{g.classe}</span>}
                      {g.montanteIndicativo != null && <span className="num text-xs text-ink-3">{fmtEur(g.montanteIndicativo, 0)}</span>}
                    </p>
                    <p className="text-sm text-ink-2">{g.detalhe}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-ink-3">Os montantes são indicativos e partem da <Link className="underline" href="/alocacao">alocação-alvo</Link> que definiu.</p>
            </Card>
          )}

          {a.perguntas.length > 0 && (
            <Card title="Perguntas a responder antes de decidir">
              <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
                {a.perguntas.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </Card>
          )}
        </div>
      )}

      {history.length > 0 && (
        <Card title="Análises anteriores" className="mt-4">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Data</th><th>Pedida por</th><th>Modelo</th><th className="text-right">Custo (USD)</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap">{dateTime(h.createdAt)}</td>
                    <td>{h.createdBy}</td>
                    <td className="text-ink-3">{h.model}</td>
                    <td className="num text-right">{h.costUsd.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="mt-4 text-xs text-ink-3">
        Isto não é aconselhamento financeiro. O modelo interpreta os números que a aplicação calcula e pode enganar-se ou omitir contexto importante (impostos, objetivos, horizonte, situação familiar). Confirme sempre antes de agir.
      </p>
    </>
  );
}
