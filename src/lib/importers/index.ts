import { parseBpi } from "./bpi";
import { parseCtt } from "./ctt";
import { parseDegiro } from "./degiro";
import { parseDegiroTrades } from "./degiro-trades";
import { parseRevolut } from "./revolut";
import { parseXtb } from "./xtb";
import { parseOptimize } from "./optimize";
import { ParsedImport } from "./types";

export const IMPORTERS = {
  bpi: { label: "BPI (extrato .xlsx)", accept: ".xlsx,.xls", needsBalance: false, parse: (buf: ArrayBuffer) => parseBpi(buf) },
  revolut: { label: "Revolut (extrato .csv)", accept: ".csv", needsBalance: false, parse: (buf: ArrayBuffer) => parseRevolut(new TextDecoder("utf-8").decode(buf)) },
  degiro: { label: "DEGIRO (carteira .xls/.xlsx)", accept: ".xls,.xlsx", needsBalance: false, parse: (buf: ArrayBuffer) => parseDegiro(buf) },
  "degiro-trades": { label: "DEGIRO (transações .csv)", accept: ".csv", needsBalance: false, parse: (buf: ArrayBuffer) => parseDegiroTrades(new TextDecoder("utf-8").decode(buf)) },
  ctt: { label: "Banco CTT (movimentos .xlsx)", accept: ".xlsx,.xls", needsBalance: true, parse: (buf: ArrayBuffer) => parseCtt(buf) },
  xtb: { label: "XTB (relatório de conta .xlsx)", accept: ".xlsx", needsBalance: false, parse: (buf: ArrayBuffer) => parseXtb(buf) },
  optimize: { label: "Optimize (extrato mensal .pdf)", accept: ".pdf", needsBalance: false, parse: (buf: ArrayBuffer) => parseOptimize(buf) },
} as const;

export type ImporterKey = keyof typeof IMPORTERS;

/** Importers whose rows are purchases and sales: they need an asset of type "Carteira de ações (manual)". */
export const PORTFOLIO_IMPORTERS: ImporterKey[] = ["degiro-trades"];
export const isPortfolioImporter = (key: string) => (PORTFOLIO_IMPORTERS as string[]).includes(key);

export async function parseFile(importer: ImporterKey, buf: ArrayBuffer): Promise<ParsedImport> {
  const imp = IMPORTERS[importer];
  if (!imp) throw new Error(`Importador desconhecido: ${importer}`);
  return await (imp.parse as (b: ArrayBuffer) => ParsedImport | Promise<ParsedImport>)(buf);
}
