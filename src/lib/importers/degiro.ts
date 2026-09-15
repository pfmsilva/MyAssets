import * as XLSX from "xlsx";
import { ParsedImport, ParsedPosition, parsePtNumber } from "./types";

export function parseDegiro(buffer: ArrayBuffer): ParsedImport {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const headerIdx = rows.findIndex((r) => r.some((c) => /^Produto|^Product/i.test(String(c ?? ""))));
  if (headerIdx < 0) throw new Error("Ficheiro DEGIRO: cabeçalho 'Produto' não encontrado.");
  const header = rows[headerIdx].map((h) => String(h ?? "").trim());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cName = col(/^Produto|^Product/i);
  const cIsin = col(/ISIN|Symbol/i);
  const cQty = col(/^Quant|^Amount|^Qty/i);
  const cPrice = col(/^Preço|^Closing|^Price/i);
  const cValue = col(/^Valor$|^Value$|^Local value/i);
  const cValueEur = col(/Valor em EUR|Value in EUR|^Value \(EUR\)/i);
  const positions: ParsedPosition[] = [];
  const warnings: string[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[cName] ?? "").trim();
    if (!name) continue;
    // "Valor" column in DEGIRO export is a pair: currency in cValue, amount in cValue+1
    let currency = "EUR";
    let value: number | undefined;
    if (cValue >= 0) {
      const a = r[cValue];
      const b = r[cValue + 1];
      if (typeof a === "string" && /^[A-Z]{3}$/.test(a.trim())) {
        currency = a.trim();
        value = parsePtNumber(b);
      } else value = parsePtNumber(a);
    }
    const valueEur = cValueEur >= 0 ? parsePtNumber(r[cValueEur]) : undefined;
    const v = valueEur ?? (currency === "EUR" ? value : undefined);
    if (v === undefined) {
      warnings.push(`Linha "${name}" sem valor em EUR, ignorada.`);
      continue;
    }
    positions.push({
      name,
      isin: cIsin >= 0 && r[cIsin] ? String(r[cIsin]).trim() : undefined,
      quantity: cQty >= 0 ? parsePtNumber(r[cQty]) : undefined,
      price: cPrice >= 0 ? parsePtNumber(r[cPrice]) : undefined,
      currency,
      value,
      valueEur: v,
    });
  }
  const balance = Math.round(positions.reduce((s, p) => s + p.valueEur, 0) * 100) / 100;
  return { source: "degiro", transactions: [], positions, balance, meta: {}, warnings };
}
