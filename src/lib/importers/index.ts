import { parseBpi } from "./bpi";
import { parseDegiro } from "./degiro";
import { parseRevolut } from "./revolut";
import { ParsedImport } from "./types";

export const IMPORTERS = {
  bpi: { label: "BPI (extrato .xlsx)", accept: ".xlsx,.xls", parse: (buf: ArrayBuffer) => parseBpi(buf) },
  revolut: { label: "Revolut (extrato .csv)", accept: ".csv", parse: (buf: ArrayBuffer) => parseRevolut(new TextDecoder("utf-8").decode(buf)) },
  degiro: { label: "DEGIRO (carteira .xls/.xlsx)", accept: ".xls,.xlsx", parse: (buf: ArrayBuffer) => parseDegiro(buf) },
} as const;

export type ImporterKey = keyof typeof IMPORTERS;

export function parseFile(importer: ImporterKey, buf: ArrayBuffer): ParsedImport {
  const imp = IMPORTERS[importer];
  if (!imp) throw new Error(`Importador desconhecido: ${importer}`);
  return imp.parse(buf);
}
