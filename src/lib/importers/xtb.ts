import * as XLSX from "xlsx";
import { ParsedImport, ParsedPosition, ParsedRealizedTrade, ParsedTransaction, parsePtNumber, readWorkbook, toIsoDate } from "./types";

type Row = unknown[];

function sheetRows(wb: XLSX.WorkBook, namePart: string): Row[] | null {
  const name = wb.SheetNames.find((n) => n.toLowerCase().includes(namePart.toLowerCase()));
  if (!name) return null;
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
}

function cellDate(v: unknown): Date | undefined {
  if (v instanceof Date) return v;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, Math.floor(d.S))) : undefined;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** XTB xStation account report (.xlsx) with "Open Positions" and "Cash Operations" sheets. */
export function parseXtb(buffer: ArrayBuffer): ParsedImport {
  const wb = readWorkbook(buffer, { cellDates: true });
  const warnings: string[] = [];
  const meta: Record<string, string> = {};

  // ---------- Open positions ----------
  const open = sheetRows(wb, "Open Positions");
  if (!open) throw new Error('Ficheiro XTB: folha "Open Positions" não encontrada.');
  let reportDate: Date | undefined;
  for (const r of open.slice(0, 8)) {
    if (/^Account number/i.test(str(r[0]))) meta.account = str(r[1]);
    if (/report generated/i.test(str(r[0]))) reportDate = cellDate(r[1]);
  }
  const headerIdx = open.findIndex((r) => str(r[0]) === "Product" && r.some((c) => /Instrument/i.test(str(c))) && r.some((c) => /^Volume$/i.test(str(c))));
  if (headerIdx < 0) throw new Error('Ficheiro XTB: cabeçalho das posições (Product, Instrument/Position, Ticker, Volume, Value) não encontrado.');
  const h = open[headerIdx].map(str);
  const col = (re: RegExp) => h.findIndex((c) => re.test(c));
  const cProduct = col(/^Product$/i), cName = col(/^Instrument/i), cTicker = col(/^Ticker$/i), cCat = col(/^Category$/i), cType = col(/^Type$/i), cVol = col(/^Volume$/i), cVal = col(/^Value$/i), cOpen = col(/^Open price$/i), cNet = col(/^Net Profit$/i), cGross = col(/^Gross Profit$/i);
  const byTicker = new Map<string, { name: string; ticker: string; category: string; volume: number; value: number; openCost: number; netProfit: number; hasProfit: boolean; products: Set<string> }>();
  for (let i = headerIdx + 1; i < open.length; i++) {
    const r = open[i];
    const name = str(r[cName]);
    const ticker = str(r[cTicker]);
    if (!name || !ticker) continue;
    if (str(r[cType])) continue; // detail row (one per open trade); aggregates have an empty Type
    if (/^\d+$/.test(name)) continue;
    const volume = parsePtNumber(r[cVol]) ?? 0;
    const value = parsePtNumber(r[cVal]) ?? 0;
    const cur = byTicker.get(ticker) ?? { name, ticker, category: str(r[cCat]), volume: 0, value: 0, openCost: 0, netProfit: 0, hasProfit: false, products: new Set<string>() };
    cur.volume += volume;
    cur.value += value;
    const openPrice = cOpen >= 0 ? parsePtNumber(r[cOpen]) : undefined;
    if (openPrice !== undefined) cur.openCost += volume * openPrice;
    const net = cNet >= 0 ? parsePtNumber(r[cNet]) : cGross >= 0 ? parsePtNumber(r[cGross]) : undefined;
    if (net !== undefined) {
      cur.netProfit += net;
      cur.hasProfit = true;
    }
    cur.products.add(str(r[cProduct]));
    byTicker.set(ticker, cur);
  }
  const positions: ParsedPosition[] = [...byTicker.values()]
    .map((p) => ({
      name: p.name,
      isin: p.ticker,
      quantity: Math.round(p.volume * 1e6) / 1e6,
      price: p.volume ? Math.round((p.value / p.volume) * 1e4) / 1e4 : undefined,
      currency: "EUR",
      value: Math.round(p.value * 100) / 100,
      valueEur: Math.round(p.value * 100) / 100,
      avgPrice: p.volume && p.openCost ? Math.round((p.openCost / p.volume) * 1e4) / 1e4 : undefined,
      costEur: p.hasProfit ? Math.round((p.value - p.netProfit) * 100) / 100 : undefined,
    }))
    .sort((a, b) => b.valueEur - a.valueEur);
  if (!positions.length) warnings.push("Nenhuma posição aberta encontrada.");

  // ---------- Cash operations ----------
  const cash = sheetRows(wb, "Cash Operations");
  const transactions: ParsedTransaction[] = [];
  let cashBalance: number | undefined;
  if (cash) {
    let from: Date | undefined;
    for (const r of cash.slice(0, 8)) if (/^Date from/i.test(str(r[0]))) from = cellDate(r[1]);
    const hi = cash.findIndex((r) => str(r[0]) === "Type" && r.some((c) => /^Amount$/i.test(str(c))) && r.some((c) => /^Time$/i.test(str(c))));
    if (hi >= 0) {
      const ch = cash[hi].map(str);
      const cc = (re: RegExp) => ch.findIndex((c) => re.test(c));
      const kType = cc(/^Type$/i), kInst = cc(/^Instrument$/i), kTicker = cc(/^Ticker$/i), kTime = cc(/^Time$/i), kAmount = cc(/^Amount$/i), kId = cc(/^ID$/i), kComment = cc(/^Comment$/i);
      const raw: (ParsedTransaction & { time: Date })[] = [];
      let sum = 0;
      for (let i = hi + 1; i < cash.length; i++) {
        const r = cash[i];
        const type = str(r[kType]);
        const time = cellDate(r[kTime]);
        const amount = parsePtNumber(r[kAmount]);
        if (!type || !time || amount === undefined) continue;
        if (/^Total$/i.test(type)) continue;
        sum += amount;
        const comment = str(r[kComment])
          .replace(/,?\s*[A-Za-z_ ]*(provider|merchant|transaction)[^,]*id=[^,]*/gi, "")
          .replace(/,?\s*id=\S+/gi, "")
          .replace(/\s+/g, " ")
          .replace(/^[,\s]+|[,\s]+$/g, "")
          .trim();
        const desc = [type, [str(r[kInst]), str(r[kTicker])].filter(Boolean).join(" "), comment].filter(Boolean).join(" · ").slice(0, 200);
        raw.push({ date: toIsoDate(time), valueDate: toIsoDate(time), seq: 0, description: desc, amount, kind: type, status: "COMPLETED", externalId: str(r[kId]) || undefined, time });
      }
      raw.sort((a, b) => a.time.getTime() - b.time.getTime());
      raw.forEach((t, i) => (t.seq = i));
      for (const t of raw) {
        const { time: _t, ...rest } = t;
        void _t;
        transactions.push(rest);
      }
      cashBalance = Math.round(sum * 100) / 100;
      const first = raw[0]?.time;
      if (from && first && from.getTime() > first.getTime() - 86400e3 && from.getTime() > Date.UTC(2010, 0, 1)) {
        warnings.push(`As operações de caixa começam em ${toIsoDate(from)}; se a conta for anterior, o saldo em dinheiro calculado (${cashBalance} €) pode estar errado. Exporte desde o início da conta.`);
      }
    }
  } else {
    warnings.push('Folha "Cash Operations" não encontrada: importadas só as posições, sem saldo em dinheiro nem movimentos.');
  }
  if (cashBalance !== undefined && Math.abs(cashBalance) >= 0.01) {
    positions.push({ name: "Dinheiro disponível (XTB)", isin: "CASH", currency: "EUR", value: cashBalance, valueEur: cashBalance });
    warnings.push(`Saldo em dinheiro calculado a partir das operações de caixa: ${cashBalance.toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}. Confirme na app XTB.`);
  }

  // ---------- Closed positions (realised gains) ----------
  const realized: ParsedRealizedTrade[] = [];
  const closed = sheetRows(wb, "Closed Positions");
  if (closed) {
    const hi = closed.findIndex((r) => str(r[0]) === "Instrument" && r.some((c) => /^Close Time/i.test(str(c))) && r.some((c) => /^Profit/i.test(str(c))));
    if (hi >= 0) {
      const ch = closed[hi].map(str);
      const cc = (re: RegExp) => ch.findIndex((c) => re.test(c));
      const kName = cc(/^Instrument$/i), kTicker = cc(/^Ticker$/i), kVol = cc(/^Volume$/i), kOpenP = cc(/^Open Price$/i), kOpenT = cc(/^Open Time/i), kCloseP = cc(/^Close Price$/i), kCloseT = cc(/^Close Time/i), kPl = cc(/^Profit\/Loss$/i), kGross = cc(/^Gross Profit$/i), kComm = cc(/^Commission$/i), kPos = cc(/^Position ID$/i);
      for (let i = hi + 1; i < closed.length; i++) {
        const r = closed[i];
        const name = str(r[kName]);
        const closeTime = cellDate(r[kCloseT]);
        const profit = parsePtNumber(r[kPl]);
        if (!name || /^Profit\/loss$/i.test(name) || !closeTime || profit === undefined) continue;
        const volume = parsePtNumber(r[kVol]);
        const posId = str(r[kPos]).replace(/\.0+$/, "");
        realized.push({
          externalId: `${posId || name}|${closeTime.toISOString()}|${volume ?? ""}`,
          name,
          ticker: str(r[kTicker]) || undefined,
          quantity: volume,
          openPrice: parsePtNumber(r[kOpenP]),
          closePrice: parsePtNumber(r[kCloseP]),
          openTime: cellDate(r[kOpenT])?.toISOString(),
          closeTime: closeTime.toISOString(),
          profitEur: profit,
          grossEur: kGross >= 0 ? parsePtNumber(r[kGross]) : undefined,
          commission: kComm >= 0 ? parsePtNumber(r[kComm]) : undefined,
        });
      }
    }
  }

  const balance = Math.round(positions.reduce((s, p) => s + p.valueEur, 0) * 100) / 100;
  return { source: "xtb", transactions, positions, realized, balance, balanceDate: reportDate ? toIsoDate(reportDate) : undefined, meta, warnings };
}
