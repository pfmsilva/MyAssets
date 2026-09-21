export type ParsedTransaction = {
  date: string; // YYYY-MM-DD
  valueDate?: string;
  seq: number; // chronological order within the file
  description: string;
  amount: number;
  fee?: number;
  balanceAfter?: number;
  kind?: string;
  status: "COMPLETED" | "PENDING";
  externalId?: string; // stable id from the source, used for de-duplication when present
};

export type ParsedPosition = {
  name: string;
  isin?: string;
  quantity?: number;
  price?: number;
  currency: string;
  value?: number;
  valueEur: number;
  avgPrice?: number; // average purchase price (instrument currency)
  costEur?: number; // acquisition cost in EUR
};

export type ParsedRealizedTrade = {
  externalId: string;
  name: string;
  ticker?: string;
  quantity?: number;
  openPrice?: number;
  closePrice?: number;
  openTime?: string; // ISO datetime
  closeTime: string; // ISO datetime
  profitEur: number;
  grossEur?: number;
  commission?: number;
};

export type ParsedTrade = {
  date: string; // YYYY-MM-DD
  seq: number; // chronological order within the file
  isin: string;
  name: string;
  quantity: number; // positive on purchases, negative on sales
  amountEur: number; // always positive: paid on a purchase, received on a sale
  feeEur: number;
  externalId: string; // stable id from the file, used for de-duplication
  note?: string;
};

export type ParsedImport = {
  source: "bpi" | "revolut" | "degiro" | "ctt" | "xtb" | "optimize" | "revolut-invest";
  transactions: ParsedTransaction[];
  positions: ParsedPosition[];
  realized?: ParsedRealizedTrade[];
  trades?: ParsedTrade[]; // purchases and sales for a manual stock portfolio
  previousSnapshots?: { date: string; value: number }[]; // earlier valuations stated in the file (e.g. previous month total)
  balance?: number; // total value of the account at balanceDate
  balanceDate?: string;
  meta: Record<string, string>;
  warnings: string[];
};

import * as XLSX from "xlsx";

/** Reads a workbook while muting SheetJS zip-size warnings some exports trigger (e.g. XTB). */
export function readWorkbook(buffer: ArrayBuffer, opts: XLSX.ParsingOptions = {}): XLSX.WorkBook {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && /Bad uncompressed size/i.test(args[0])) return;
    original(...args);
  };
  try {
    return XLSX.read(buffer, { type: "array", ...opts });
  } finally {
    console.error = original;
  }
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parsePtNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return v;
  let s = String(v).trim().replace(/\s|EUR|€/g, "");
  if (!s) return undefined;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** dd-mm-yyyy or dd/mm/yyyy -> yyyy-mm-dd */
export function parsePtDate(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return toIsoDate(v);
  const m = String(v).trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (!m) return undefined;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
