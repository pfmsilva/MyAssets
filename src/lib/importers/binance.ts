import { parseCsv } from "../csv";
import { quoteClient, toEur } from "../quotes";
import { ParsedImport, ParsedPosition, parsePtNumber } from "./types";

const FIAT = new Set(["EUR", "USD", "GBP", "CHF"]);

type Row = { code: string; quantity: number; eurTicker?: string; usdTicker?: string; valueEur?: number; costEur?: number; pnl?: number };

/**
 * Binance holdings export (CSV, one row per coin). Two shapes are accepted:
 * - com o valor atual em EUR na própria folha;
 * - com os símbolos do Yahoo (par em euros e par em dólares) e sem valor, caso em que o valor
 *   de cada moeda é calculado com a cotação do momento.
 * Each row becomes a position; the account value is the sum of the rows.
 */
export async function parseBinance(text: string): Promise<ParsedImport> {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("Ficheiro vazio.");
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (...res: RegExp[]) => header.findIndex((h) => res.some((re) => re.test(h)));
  const cCode = col(/^codigo|^código|^ativo|^asset|^coin|^moeda|^symbol/);
  const cQty = col(/^quantidade|^quantity|^amount|^saldo|^balance/);
  const cValue = col(/valor_atual|^valor$|current_value|value.*eur|eur.*value/);
  const cPnl = col(/pnl|nao_realizado|não_realizado|unrealized/);
  const cCost = col(/compra|custo|cost|buy/);
  const cEurTicker = header.findIndex((h) => /(ticker|simbolo|símbolo|yahoo)/.test(h) && !/usd/.test(h));
  const cUsdTicker = header.findIndex((h) => /(ticker|simbolo|símbolo|yahoo)/.test(h) && /usd/.test(h));
  if (cCode < 0 || cQty < 0) throw new Error("Ficheiro Binance: faltam colunas (código do ativo e quantidade).");
  if (cValue < 0 && cEurTicker < 0 && cUsdTicker < 0) throw new Error("Ficheiro Binance: é preciso o valor em EUR ou o símbolo do Yahoo de cada moeda.");

  const warnings: string[] = [];
  const list: Row[] = [];
  let zero = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const code = (r[cCode] ?? "").trim().toUpperCase();
    const quantity = parsePtNumber(r[cQty]);
    if (!code || quantity === undefined) continue;
    const valueEur = cValue >= 0 ? parsePtNumber(r[cValue]) : undefined;
    if (quantity === 0 && !valueEur) {
      zero++;
      continue;
    }
    list.push({
      code,
      quantity,
      eurTicker: cEurTicker >= 0 ? (r[cEurTicker] ?? "").trim().toUpperCase() || undefined : undefined,
      usdTicker: cUsdTicker >= 0 ? (r[cUsdTicker] ?? "").trim().toUpperCase() || undefined : undefined,
      valueEur,
      costEur: cCost >= 0 ? parsePtNumber(r[cCost]) : undefined,
      pnl: cPnl >= 0 ? parsePtNumber(r[cPnl]) : undefined,
    });
  }
  if (!list.length) throw new Error("Nenhum ativo com quantidade encontrado no ficheiro.");

  // Rows without a value are priced with the quotes of the moment (euro pair first, then dollar pair).
  const prices = new Map<string, number>(); // symbol -> price in EUR
  const needsQuote = list.some((r) => r.valueEur === undefined && !FIAT.has(r.code));
  if (needsQuote) {
    const symbols = [...new Set(list.flatMap((r) => [r.eurTicker, r.usdTicker, defaultTicker(r)].filter((s): s is string => !!s)))];
    try {
      const quotes = await quoteClient().quote([...symbols, "USDEUR=X"]);
      const fx = new Map(quotes.filter((q) => q.regularMarketPrice).map((q) => [q.symbol, { price: q.regularMarketPrice as number }]));
      for (const q of quotes) {
        if (q.regularMarketPrice === undefined || q.regularMarketPrice === null) continue;
        const eur = toEur(q.regularMarketPrice, q.currency ?? "EUR", fx);
        if (eur !== null) prices.set(q.symbol, eur);
      }
    } catch (e) {
      warnings.push(`Não foi possível obter as cotações do Yahoo (${e instanceof Error ? e.message.slice(0, 80) : "erro"}); foi usado o valor de compra.`);
    }
  }

  const positions: ParsedPosition[] = [];
  let quoted = 0;
  let costTotal = 0;
  let pnlTotal = 0;
  for (const r of list) {
    const key = FIAT.has(r.code) ? "CASH" : r.eurTicker || r.usdTicker || defaultTicker(r) || `${r.code}-EUR`;
    const priceEur = prices.get(r.eurTicker ?? "") ?? prices.get(r.usdTicker ?? "") ?? prices.get(defaultTicker(r) ?? "");
    let valueEur = r.valueEur;
    if (valueEur === undefined && priceEur !== undefined) {
      valueEur = Math.round(r.quantity * priceEur * 100) / 100;
      quoted++;
    }
    if (valueEur === undefined) {
      valueEur = r.costEur ?? 0;
      if (needsQuote && !FIAT.has(r.code)) warnings.push(`${r.code}: sem cotação no Yahoo (${r.eurTicker ?? key}); foi usado o valor de compra.`);
    }
    if (r.costEur !== undefined) costTotal += r.costEur;
    if (r.pnl !== undefined) pnlTotal += r.pnl;
    positions.push({
      name: r.code,
      // Yahoo quotes crypto as "BTC-EUR": this key gives the position live prices like any other instrument
      isin: key,
      quantity: r.quantity,
      price: priceEur ?? (r.quantity ? Math.round((valueEur / r.quantity) * 1e8) / 1e8 : undefined),
      currency: "EUR",
      value: valueEur,
      valueEur,
      avgPrice: r.costEur !== undefined && r.quantity ? Math.round((r.costEur / r.quantity) * 1e8) / 1e8 : undefined,
      costEur: r.costEur,
    });
  }
  if (zero) warnings.push(`${zero} linha(s) sem quantidade nem valor foram ignoradas.`);
  const balance = Math.round(positions.reduce((s, p) => s + p.valueEur, 0) * 100) / 100;
  const meta: Record<string, string> = {
    ativos: String(positions.length),
    valor: `${balance.toFixed(2)} EUR`,
    ...(needsQuote ? { cotadas: `${quoted}/${positions.length}` } : {}),
    ...(costTotal ? { custo_estimado: `${costTotal.toFixed(2)} EUR` } : {}),
    ...(pnlTotal ? { ganho_perda: `${pnlTotal.toFixed(2)} EUR` } : {}),
  };
  return { source: "binance", transactions: [], positions, balance, meta, warnings };
}

const defaultTicker = (r: Row) => (FIAT.has(r.code) ? undefined : `${r.code}-EUR`);
