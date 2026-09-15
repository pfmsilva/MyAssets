import { parseCsv } from "../csv";
import { ParsedImport, ParsedTransaction } from "./types";

function isoDate(s: string): string | undefined {
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : undefined;
}

export function parseRevolut(text: string): ParsedImport {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("Ficheiro Revolut vazio.");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const cType = col("tipo", "type");
  const cProduct = col("produto", "product");
  const cStart = col("data de início", "data de inicio", "started date");
  const cEnd = col("data de conclusão", "data de conclusao", "completed date");
  const cDesc = col("descrição", "descricao", "description");
  const cAmount = col("montante", "amount");
  const cFee = col("comissão", "comissao", "fee");
  const cCur = col("moeda", "currency");
  const cState = col("estado", "state");
  const cBalance = col("saldo", "balance");
  if (cStart < 0 || cDesc < 0 || cAmount < 0) throw new Error("Ficheiro Revolut: colunas em falta.");

  const warnings: string[] = [];
  const meta: Record<string, string> = {};
  const list: ParsedTransaction[] = [];
  let skippedReverted = 0;
  let otherCurrency = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const state = (cState >= 0 ? r[cState] : "").toUpperCase();
    if (state.includes("REVERT") || state.includes("REVERSED") || state.includes("FALH") || state.includes("FAILED") || state.includes("DECLINED") || state.includes("RECUSAD")) {
      skippedReverted++;
      continue;
    }
    if (cCur >= 0 && r[cCur] && r[cCur] !== "EUR") otherCurrency++;
    const date = isoDate(r[cStart]);
    if (!date) continue;
    const amount = Number(r[cAmount]);
    if (!Number.isFinite(amount)) continue;
    const pending = state.includes("PEND");
    const bal = cBalance >= 0 && r[cBalance] !== "" ? Number(r[cBalance]) : undefined;
    list.push({
      date,
      valueDate: cEnd >= 0 ? isoDate(r[cEnd] ?? "") : undefined,
      seq: i,
      description: r[cDesc].trim(),
      amount,
      fee: cFee >= 0 ? Number(r[cFee]) || 0 : 0,
      balanceAfter: Number.isFinite(bal as number) ? bal : undefined,
      kind: [cType >= 0 ? r[cType] : "", cProduct >= 0 ? r[cProduct] : ""].filter(Boolean).join(" / "),
      status: pending ? "PENDING" : "COMPLETED",
    });
  }
  if (skippedReverted) warnings.push(`${skippedReverted} movimentos revertidos ignorados.`);
  if (otherCurrency) warnings.push(`${otherCurrency} movimentos noutra moeda que não EUR (importados com o montante original).`);

  // balance follows completion order
  const completed = list
    .filter((t) => t.status === "COMPLETED" && t.balanceAfter !== undefined)
    .sort((a, b) => (a.valueDate ?? a.date).localeCompare(b.valueDate ?? b.date) || a.seq - b.seq);
  const last = completed[completed.length - 1];
  return {
    source: "revolut",
    transactions: list,
    positions: [],
    balance: last?.balanceAfter,
    balanceDate: last ? last.valueDate ?? last.date : undefined,
    meta,
    warnings,
  };
}
