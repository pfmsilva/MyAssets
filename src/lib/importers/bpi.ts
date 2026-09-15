import * as XLSX from "xlsx";
import { ParsedImport, ParsedTransaction, parsePtDate, parsePtNumber } from "./types";

export function parseBpi(buffer: ArrayBuffer): ParsedImport {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const meta: Record<string, string> = {};
  const warnings: string[] = [];
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const first = r[0] == null ? "" : String(r[0]).trim();
    if (/^Nome/i.test(first) && r[2]) meta.holder = String(r[2]).trim();
    if (/^Conta/i.test(first) && r[2]) meta.account = String(r[2]).trim();
    if (/^Data\/Hora/i.test(first) && r[2]) meta.exportedAt = String(r[2]).trim();
    if (/^Saldo à Ordem Contabil/i.test(first) && r[2]) meta.balance = String(r[2]).trim();
    if (/^Saldo à Ordem Dispon/i.test(first) && r[2]) meta.availableBalance = String(r[2]).trim();
    if (first === "Data Mov." || /^Data Mov/i.test(first)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("Ficheiro BPI: cabeçalho 'Data Mov.' não encontrado.");
  const header = rows[headerIdx].map((h) => String(h ?? "").trim());
  const col = (re: RegExp) => header.findIndex((h) => re.test(h));
  const cDate = col(/^Data Mov/i);
  const cValueDate = col(/^Data Valor/i);
  const cDesc = col(/^Descri/i);
  const cAmount = col(/^Valor em/i);
  const cBalance = col(/^Saldo em/i);
  if (cDate < 0 || cDesc < 0 || cAmount < 0) throw new Error("Ficheiro BPI: colunas em falta.");

  const raw: ParsedTransaction[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const date = parsePtDate(r[cDate]);
    if (!date) continue;
    const amount = parsePtNumber(r[cAmount]);
    if (amount === undefined) continue;
    raw.push({
      date,
      valueDate: cValueDate >= 0 ? parsePtDate(r[cValueDate]) : undefined,
      seq: 0,
      description: String(r[cDesc] ?? "").replace(/\s+/g, " ").trim(),
      amount,
      balanceAfter: cBalance >= 0 ? parsePtNumber(r[cBalance]) : undefined,
      status: "COMPLETED",
    });
  }
  // BPI lists newest first -> reverse to chronological order
  raw.reverse();
  raw.forEach((t, i) => (t.seq = i));

  let balance = parsePtNumber(meta.balance);
  let balanceDate = parsePtDate(meta.exportedAt);
  if (balance === undefined && raw.length) {
    const last = raw[raw.length - 1];
    balance = last.balanceAfter;
    balanceDate = last.date;
    warnings.push("Saldo lido da última linha de movimentos.");
  }
  if (!balanceDate && raw.length) balanceDate = raw[raw.length - 1].date;

  return { source: "bpi", transactions: raw, positions: [], balance, balanceDate, meta, warnings };
}
