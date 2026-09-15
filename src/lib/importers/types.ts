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
};

export type ParsedPosition = {
  name: string;
  isin?: string;
  quantity?: number;
  price?: number;
  currency: string;
  value?: number;
  valueEur: number;
};

export type ParsedImport = {
  source: "bpi" | "revolut" | "degiro" | "ctt";
  transactions: ParsedTransaction[];
  positions: ParsedPosition[];
  balance?: number; // total value of the account at balanceDate
  balanceDate?: string;
  meta: Record<string, string>;
  warnings: string[];
};

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
