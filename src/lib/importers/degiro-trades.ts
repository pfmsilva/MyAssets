import { parseCsv } from "../csv";
import { ParsedImport, ParsedTrade, parsePtDate, parsePtNumber } from "./types";

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

/**
 * DEGIRO transaction history (CSV export "Transações", one row per executed order).
 * Each row becomes a purchase (positive quantity) or a sale (negative quantity) of the ISIN,
 * feeding a manual stock portfolio.
 */
export function parseDegiroTrades(text: string): ParsedImport {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("Ficheiro vazio.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const cDate = col("data", "date");
  const cTime = col("hora", "time");
  const cName = col("produto", "product");
  const cIsin = col("isin");
  const cQty = col("quantidade", "quantity");
  const cPrice = col("preços", "precos", "price");
  const cEur = header.findIndex((h) => /valor em eur|valor eur|value in eur|total eur/.test(h));
  const cFee = header.findIndex((h) => /custos de transação|custos de transacao|transaction and\/or third|comiss/.test(h));
  const cFx = header.findIndex((h) => /autofx/.test(h));
  const cOrder = header.findIndex((h) => /id da ordem|order id/.test(h));
  if (cDate < 0 || cName < 0 || cQty < 0 || cEur < 0) throw new Error("Ficheiro de transações: faltam colunas (Data, Produto, Quantidade, Valor EUR).");

  const warnings: string[] = [];
  const trades: ParsedTrade[] = [];
  const used = new Map<string, number>();
  let ignored = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = (r[cName] ?? "").trim();
    const date = parsePtDate(r[cDate]) ?? (/^\d{4}-\d{2}-\d{2}/.test((r[cDate] ?? "").trim()) ? (r[cDate] ?? "").trim().slice(0, 10) : undefined);
    const quantity = parsePtNumber(r[cQty]);
    const eur = parsePtNumber(r[cEur]);
    if (!name || !date || quantity === undefined || quantity === 0 || eur === undefined) {
      if (r.some((c) => (c ?? "").trim() !== "")) ignored++;
      continue;
    }
    const isin = (cIsin >= 0 ? (r[cIsin] ?? "").trim().toUpperCase() : "");
    if (!ISIN_RE.test(isin)) {
      warnings.push(`"${name}" (${date}) sem ISIN válido, linha ignorada.`);
      continue;
    }
    const fee = Math.abs(parsePtNumber(cFee >= 0 ? r[cFee] : undefined) ?? 0) + Math.abs(parsePtNumber(cFx >= 0 ? r[cFx] : undefined) ?? 0);
    const order = cOrder >= 0 ? (r[cOrder] ?? "").trim() : "";
    const time = cTime >= 0 ? (r[cTime] ?? "").trim() : "";
    // one order can be filled in several rows: the key keeps each of them distinct and stable
    const base = `${order || `${date}-${isin}`}|${time}|${quantity}|${eur.toFixed(2)}`;
    const n = used.get(base) ?? 0;
    used.set(base, n + 1);
    trades.push({
      date,
      seq: i,
      isin,
      name,
      quantity,
      amountEur: Math.abs(eur),
      feeEur: Math.round(fee * 100) / 100,
      externalId: n ? `${base}#${n}` : base,
      note: [time, cPrice >= 0 && r[cPrice] ? `${r[cPrice]} /un.` : ""].filter(Boolean).join(" · ") || undefined,
    });
  }
  if (!trades.length) throw new Error("Nenhuma compra ou venda encontrada no ficheiro.");
  if (ignored) warnings.push(`${ignored} linha(s) sem data, quantidade ou valor foram ignoradas.`);
  const dates = trades.map((t) => t.date).sort();
  const buys = trades.filter((t) => t.quantity > 0);
  const sells = trades.filter((t) => t.quantity < 0);
  const meta: Record<string, string> = {
    operações: String(trades.length),
    compras: String(buys.length),
    vendas: String(sells.length),
    período: `${dates[0]} a ${dates[dates.length - 1]}`,
    títulos: String(new Set(trades.map((t) => t.isin)).size),
  };
  return { source: "degiro-trades", transactions: [], positions: [], trades, meta, warnings };
}
