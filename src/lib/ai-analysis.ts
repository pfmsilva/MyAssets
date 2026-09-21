import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { prisma } from "./prisma";
import { getAllocation } from "./allocation";
import { byMember, getCurrentValues, getExpenseSeries, getNetWorthSeries, groupBy } from "./analytics";
import { getPerformance } from "./performance";
import { getBudgetOverview } from "./budget";
import { getLiveValuations } from "./quotes";
import { getSettings } from "./settings";
import { ASSET_CLASS_LABEL, ASSET_TYPE_LABEL } from "./format";

export const AI_MODEL = "claude-opus-5";
// Anthropic list prices for Claude Opus 5, used only to show an estimated cost.
const USD_PER_INPUT_TOKEN = 5 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 25 / 1_000_000;

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// ---------- structured result ----------

const Gravidade = z.enum(["baixa", "media", "alta"]);
export const AnalysisSchema = z.object({
  resumo: z.string().describe("Três a quatro frases sobre o estado geral do património, em português de Portugal."),
  observacoes: z.array(z.object({ titulo: z.string(), detalhe: z.string() })).describe("Leituras objetivas dos números fornecidos."),
  riscos: z.array(z.object({ titulo: z.string(), detalhe: z.string(), gravidade: Gravidade })),
  sugestoes: z
    .array(
      z.object({
        titulo: z.string(),
        detalhe: z.string(),
        classe: z.string().nullable().describe("Classe de ativo a que se refere, ou null."),
        montanteIndicativo: z.number().nullable().describe("Montante em euros, se aplicável; null caso contrário."),
        prioridade: Gravidade,
      }),
    )
    .describe("Sugestões de reequilíbrio face à alocação-alvo indicada, nunca recomendações de produtos concretos."),
  perguntas: z.array(z.string()).describe("Perguntas que a família deve responder antes de decidir."),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

// ---------- deterministic snapshot ----------

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export type Snapshot = Awaited<ReturnType<typeof buildSnapshot>>;

/** Everything the model is allowed to reason about. All figures are computed here, never by the model. */
export async function buildSnapshot(opts: { anonymize: boolean; assetId?: string }) {
  const settings = await getSettings();
  const [values, allocation, perf, nw, expenses, budget] = await Promise.all([
    getCurrentValues(),
    getAllocation({ live: true, bandPp: settings.allocationBandPp }),
    getPerformance(),
    getNetWorthSeries(),
    getExpenseSeries({ months: 12 }),
    getBudgetOverview(new Date().toISOString().slice(0, 7)),
  ]);
  const total = values.reduce((s, a) => s + a.value, 0);
  const liveIds = values.filter((a) => ["BROKERAGE", "STOCK_PORTFOLIO", "CRYPTO"].includes(a.type)).map((a) => a.id);
  const live = await getLiveValuations(liveIds, { resolve: false });

  const positions = allocation.rows.flatMap((r) => r.sources.map((s) => ({ nome: s.name, classe: ASSET_CLASS_LABEL[r.assetClass] ?? r.assetClass, valor: round(s.value, 0), peso: round(total ? s.value / total : 0, 4) })));
  positions.sort((a, b) => b.valor - a.valor);
  const top = positions.slice(0, 20);
  const memberTotals = byMember(values);
  const months = nw.months.slice(-13);
  const incomeTotal = expenses.months.reduce((s, m) => s + m.income, 0);
  const expenseTotal = expenses.months.reduce((s, m) => s + m.expense, 0);

  return {
    dataAnalise: new Date().toISOString().slice(0, 10),
    moeda: "EUR",
    patrimonio: {
      total: round(total, 0),
      porTipo: groupBy(values, (a) => ASSET_TYPE_LABEL[a.type] ?? a.type, (a) => a.value).map((g) => ({ tipo: g.name, valor: round(g.value, 0), peso: round(total ? g.value / total : 0, 4) })),
      porMembro: memberTotals.map((m, i) => ({ membro: opts.anonymize ? `Membro ${i + 1}` : m.name, valor: round(m.value, 0), peso: round(total ? m.value / total : 0, 4) })),
      evolucao12m: months.map((m) => ({ mes: m.month, total: round(m.total, 0) })),
    },
    alocacao: {
      toleranciaPp: allocation.bandPp,
      alvoDefinido: allocation.targetTotal > 0,
      reforcoParaEquilibrar: allocation.newMoneyNeeded,
      classes: allocation.rows.map((r) => ({
        classe: ASSET_CLASS_LABEL[r.assetClass] ?? r.assetClass,
        valor: round(r.current, 0),
        pesoAtual: round(r.currentPct, 4),
        pesoAlvo: r.targetPct,
        desvioPp: r.driftPp !== null ? round(r.driftPp, 1) : null,
        ajusteEuros: r.delta,
        estado: r.status,
      })),
    },
    concentracao: {
      maiorPosicao: top[0] ? { nome: top[0].nome, peso: top[0].peso } : null,
      top5Peso: round(top.slice(0, 5).reduce((s, p) => s + p.peso, 0), 4),
      numeroPosicoes: positions.length,
      principaisPosicoes: top,
    },
    carteiras: perf.rows.map((r) => {
      const l = live.get(r.id);
      const since = r.periods.at(-1);
      const year = r.periods[0];
      return {
        nome: r.name,
        tipo: ASSET_TYPE_LABEL[r.type] ?? r.type,
        valor: round(r.value, 0),
        desde: r.firstDate ? r.firstDate.toISOString().slice(0, 10) : null,
        fluxosTotais: round(r.flowsTotal, 0),
        ganhoDesdeInicio: since?.gain != null ? round(since.gain, 0) : null,
        twrDesdeInicio: since?.twr != null ? round(since.twr, 4) : null,
        xirrAnualizado: since?.xirr != null ? round(since.xirr, 4) : null,
        twrEsteAno: year?.twr != null ? round(year.twr, 4) : null,
        variacaoDiaEuros: l ? round(l.dayChangeEur, 0) : null,
        naoRealizado: l?.unrealizedPnl != null ? round(l.unrealizedPnl, 0) : null,
      };
    }),
    global: (() => {
      const c = perf.combined?.periods.at(-1);
      const y = perf.combined?.periods[0];
      return { twrDesdeInicio: c?.twr != null ? round(c.twr, 4) : null, xirrAnualizado: c?.xirr != null ? round(c.xirr, 4) : null, twrEsteAno: y?.twr != null ? round(y.twr, 4) : null, ganho: c?.gain != null ? round(c.gain, 0) : null };
    })(),
    liquidezEDespesas: {
      liquidez: round(values.filter((a) => a.type === "CURRENT_ACCOUNT" || a.type === "CASH").reduce((s, a) => s + a.value, 0), 0),
      despesaMedia12m: round(expenses.months.length ? expenseTotal / expenses.months.length : 0, 0),
      rendimento12m: round(incomeTotal, 0),
      despesa12m: round(expenseTotal, 0),
      taxaPoupanca12m: incomeTotal > 0 ? round((incomeTotal - expenseTotal) / incomeTotal, 4) : null,
      principaisCategorias: expenses.categories.filter((c) => c.value > 0).slice(0, 8).map((c) => ({ categoria: c.name, valor12m: round(c.value, 0) })),
      orcamentoAcimaDoLimite: budget.rows.filter((r) => r.status === "over").map((r) => ({ categoria: r.name, gasto: round(r.spent, 0), limite: r.limit })),
    },
    ativosDesatualizados: values.filter((a) => !a.date).map((a) => a.name),
  };
}

// ---------- the call ----------

const SYSTEM = `És um analista financeiro a escrever para uma família portuguesa que gere o seu património numa aplicação chamada Pecúlio.

Recebes um retrato do património já calculado pela aplicação, em JSON. Regras absolutas:
- Todos os números já vêm calculados. Nunca recalcules totais, pesos ou rentabilidades, e nunca inventes valores que não estejam no JSON. Se algo não estiver no JSON, diz que não tens essa informação.
- Escreve em português de Portugal, claro e direto, sem jargão desnecessário e sem anglicismos evitáveis.
- As sugestões referem-se a classes de ativos e ao reequilíbrio face à alocação-alvo que a família definiu. Nunca recomendes produtos, ações, fundos ou corretoras concretos, nem dês instruções de compra ou venda de um título específico.
- Não és consultor financeiro certificado e isto não é aconselhamento financeiro. Apresenta as sugestões como opções a ponderar e acompanha-as de perguntas que ajudem a família a decidir.
- Sê concreto e útil: refere valores e percentagens do JSON quando sustentam uma observação.
- Se a alocação-alvo não estiver definida (alvoDefinido: false), diz que sem alvo definido as sugestões de reequilíbrio são limitadas, e centra-te em concentração, liquidez, custos e poupança.
- No máximo 4 observações, 4 riscos, 5 sugestões e 4 perguntas. Cada detalhe com duas a quatro frases.`;

export type RunResult = { id: string; result: Analysis; inputTokens: number; outputTokens: number; costUsd: number; model: string };

/** Sends the snapshot to Claude and stores the structured reading. */
export async function runAnalysis(opts: { by: string; anonymize: boolean }): Promise<RunResult> {
  if (!aiConfigured()) throw new Error("Falta a variável ANTHROPIC_API_KEY.");
  const snapshot = await buildSnapshot({ anonymize: opts.anonymize });
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: zodOutputFormat(AnalysisSchema) },
    messages: [{ role: "user", content: `Retrato do património da família (JSON):\n\n${JSON.stringify(snapshot)}\n\nAnalisa e responde no formato pedido.` }],
  });
  if (response.stop_reason === "refusal") throw new Error("O modelo recusou responder a este pedido.");
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("A resposta do modelo não pôde ser interpretada.");
  const inputTokens = response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0);
  const outputTokens = response.usage.output_tokens;
  const costUsd = round(inputTokens * USD_PER_INPUT_TOKEN + outputTokens * USD_PER_OUTPUT_TOKEN, 4);
  const saved = await prisma.aiAnalysis.create({
    data: { createdBy: opts.by, model: AI_MODEL, scope: "GLOBAL", input: snapshot as object, result: parsed as object, inputTokens, outputTokens, costUsd },
  });
  return { id: saved.id, result: parsed, inputTokens, outputTokens, costUsd, model: AI_MODEL };
}

export async function latestAnalysis() {
  return prisma.aiAnalysis.findFirst({ orderBy: { createdAt: "desc" } });
}
