import { parseBpi } from "./bpi";
import { parseCtt } from "./ctt";
import { parseDegiro } from "./degiro";
import { parseRevolut } from "./revolut";
import { ParsedImport } from "./types";

export const IMPORTERS = {
  bpi: { label: "BPI (extrato .xlsx)", accept: ".xlsx,.xls", needsBalance: false, parse: (buf: ArrayBuffer) => parseBpi(buf) },
  revolut: { label: "Revolut (extrato .csv)", accept: ".csv", needsBalance: false, parse: (buf: ArrayBuffer) => parseRevolut(new TextDecoder("utf-8").decode(buf)) },
  degiro: { label: "DEGIRO (carteira .xls/.xlsx)", accept: ".xls,.xlsx", needsBalance: false, parse: (buf: ArrayBuffer) => parseDegiro(buf) },
  ctt: { label: "Banco CTT (movimentos .xlsx)", accept: ".xlsx,.xls", needsBalance: true, parse: (buf: ArrayBuffer) => parseCtt(buf) },
} as const;

export type ImporterKey = keyof typeof IMPORTERS;

export function parseFile(importer: ImporterKey, buf: ArrayBuffer): ParsedImport {
  const imp = IMPORTERS[importer];
  if (!imp) throw new Error(`Importador desconhecido: ${importer}`);
  return imp.parse(buf);
}
