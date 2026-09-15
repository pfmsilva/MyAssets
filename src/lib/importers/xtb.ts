import * as XLSX from "xlsx";
import { ParsedImport, ParsedPosition, ParsedTransaction, parsePtNumber, readWorkbook, toIsoDate } from "./types";

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
  const cProduct = col(/^Product$/i), cName = col(/^Instrument/i), cTicker = col(/^Ticker$/i), cCat = col(/^Category$/i), cType = col(/^Type$/i), cVol = col(/^Volume$/i), cVal = col(/^Value$/i), cOpen = col(/^Open price$/i);
  const byTicker = new Map<string, { name: string; ticker: string; category: string; volume: number; value: number; products: Set<string> }>();
  for (let i = headerIdx + 1; i < open.length; i++) {
    const r = open[i];
    const name = str(r[cName]);
    const ticker = str(r[cTicker]);
    if (!name || !ticker) continue;
    if (str(r[cType])) continue; // detail row (one per open trade); aggregates have an empty Type
    if (/^\d+$/.test(name)) continue;
    const volume = parsePtNumber(r[cVol]) ?? 0;
    const value = parsePtNumber(r[cVal]) ?? 0;
    const cur = byTicker.get(ticker) ?? { name, ticker, category: str(r[cCat]), volume: 0, value: 0, products: new Set<string>() };
    cur.volume += volume;
    cur.value += value;
    cur.products.add(str(r[cProduct]));
    byTicker.set(ticker, cur);
  }
  void cOpen;
  const positions: ParsedPosition[] = [...byTicker.values()]
    .map((p) => ({
      name: p.name,
      isin: p.ticker,
      quantity: Math.round(p.volume * 1e6) / 1e6,
      price: p.volume ? Math.round((p.value / p.volume) * 1e4) / 1e4 : undefined,
      currency: "EUR",
      value: Math.round(p.value * 100) / 100,
      valueEur: Math.round(p.value * 100) / 100,
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

  const balance = Math.round(positions.reduce((s, p) => s + p.valueEur, 0) * 100) / 100;
  return { source: "xtb", transactions, positions, balance, balanceDate: reportDate ? toIsoDate(reportDate) : undefined, meta, warnings };
}
