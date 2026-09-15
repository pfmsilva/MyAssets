import * as XLSX from "xlsx";
import { ParsedImport, ParsedTransaction, parsePtDate, parsePtNumber } from "./types";

/** Banco CTT "Movimentos de Conta à Ordem" export (.xlsx). Has no running balance. */
export function parseCtt(buffer: ArrayBuffer): ParsedImport {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const meta: Record<string, string> = {};
  const warnings: string[] = [];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map((c) => String(c ?? "").trim());
    const m = cells.find((c) => /^Exporta[cç][aã]o de movimentos/i.test(c));
    if (m) meta.period = m.replace(/^Exporta[cç][aã]o de movimentos:?\s*/i, "");
    if (cells.includes("Data") && cells.some((c) => /^Montante/i.test(c)) && cells.some((c) => /^Descri/i.test(c))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("Ficheiro Banco CTT: cabeçalho (Data, Descrição, Montante) não encontrado.");
  const header = rows[headerIdx].map((h) => String(h ?? "").trim());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cDate = col(/^Data$/i);
  const cValueDate = col(/^Data Valor/i);
  const cType = col(/^Tipo/i);
  const cAccount = col(/^Conta/i);
  const cDesc = col(/^Descri/i);
  const cAmount = col(/^Montante/i);
  const cCur = col(/^Moeda/i);

  const raw: ParsedTransaction[] = [];
  let otherCurrency = 0;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parsePtDate(r[cDate]);
    const amount = parsePtNumber(r[cAmount]);
    if (!date || amount === undefined) continue;
    if (cAccount >= 0 && r[cAccount] && !meta.account) meta.account = String(r[cAccount]);
    if (cCur >= 0 && r[cCur] && String(r[cCur]) !== "EUR") otherCurrency++;
    raw.push({
      date,
      valueDate: cValueDate >= 0 ? parsePtDate(r[cValueDate]) : undefined,
      seq: 0,
      description: String(r[cDesc] ?? "").replace(/\s+/g, " ").trim(),
      amount,
      kind: cType >= 0 && r[cType] ? String(r[cType]) : undefined,
      status: "COMPLETED",
    });
  }
  if (otherCurrency) warnings.push(`${otherCurrency} movimentos noutra moeda que não EUR.`);
  // newest first in the file -> chronological
  raw.reverse();
  raw.forEach((t, i) => (t.seq = i));
  warnings.push("O ficheiro do Banco CTT não inclui o saldo: indique o saldo atual para registar o valor da conta e reconstruir o histórico mensal.");
  return { source: "ctt", transactions: raw, positions: [], meta, warnings };
}
