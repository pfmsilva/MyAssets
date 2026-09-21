import { parseCsv } from "../csv";
import { ParsedImport, ParsedPosition, parsePtNumber } from "./types";

const FIAT = new Set(["EUR", "USD", "GBP", "CHF"]);

/**
 * Binance holdings export (CSV with one row per coin: código, quantidade, valor atual em EUR
 * e, opcionalmente, o valor de compra estimado e o ganho/perda não realizado).
 * Each row becomes a position; the account value is the sum of the rows.
 */
export function parseBinance(text: string): ParsedImport {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("Ficheiro vazio.");
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (...res: RegExp[]) => header.findIndex((h) => res.some((re) => re.test(h)));
  const cCode = col(/^codigo|^código|^ativo|^asset|^coin|^moeda|^symbol/);
  const cQty = col(/^quantidade|^quantity|^amount|^saldo|^balance/);
  const cValue = col(/valor_atual|^valor$|current_value|value.*eur|eur.*value/);
  const cPnl = col(/pnl|nao_realizado|não_realizado|unrealized/);
  const cCost = col(/compra|custo|cost|buy/);
  if (cCode < 0 || cQty < 0 || cValue < 0) throw new Error("Ficheiro Binance: faltam colunas (código do ativo, quantidade e valor em EUR).");

  const positions: ParsedPosition[] = [];
  const warnings: string[] = [];
  let zero = 0;
  let pnlTotal = 0;
  let costTotal = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const code = (r[cCode] ?? "").trim().toUpperCase();
    const quantity = parsePtNumber(r[cQty]);
    const valueEur = parsePtNumber(r[cValue]);
    if (!code || quantity === undefined || valueEur === undefined) continue;
    if (valueEur === 0 && quantity === 0) {
      zero++;
      continue;
    }
    const costEur = cCost >= 0 ? parsePtNumber(r[cCost]) : undefined;
    const pnl = cPnl >= 0 ? parsePtNumber(r[cPnl]) : undefined;
    if (costEur !== undefined) costTotal += costEur;
    if (pnl !== undefined) pnlTotal += pnl;
    positions.push({
      name: code,
      // Yahoo quotes crypto as "BTC-EUR": this key gives the position live prices like any other instrument
      isin: FIAT.has(code) ? "CASH" : `${code}-EUR`,
      quantity,
      price: quantity ? Math.round((valueEur / quantity) * 1e8) / 1e8 : undefined,
      currency: "EUR",
      value: valueEur,
      valueEur,
      avgPrice: costEur !== undefined && quantity ? Math.round((costEur / quantity) * 1e8) / 1e8 : undefined,
      costEur,
    });
  }
  if (!positions.length) throw new Error("Nenhum ativo com valor encontrado no ficheiro.");
  if (zero) warnings.push(`${zero} linha(s) sem quantidade nem valor foram ignoradas.`);
  const balance = Math.round(positions.reduce((s, p) => s + p.valueEur, 0) * 100) / 100;
  const meta: Record<string, string> = {
    ativos: String(positions.length),
    valor: `${balance.toFixed(2)} EUR`,
    ...(costTotal ? { custo_estimado: `${costTotal.toFixed(2)} EUR` } : {}),
    ...(pnlTotal ? { ganho_perda: `${pnlTotal.toFixed(2)} EUR` } : {}),
  };
  return { source: "binance", transactions: [], positions, balance, meta, warnings };
}
