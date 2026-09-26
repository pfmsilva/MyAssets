import * as XLSX from "xlsx";
import { IMPORTERS, type ImporterKey } from "./index";
import { readWorkbook } from "./types";

export type Detection = { importer: ImporterKey | null; reason: string; candidates: ImporterKey[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** First rows of every sheet, flattened into one lowercase string (enough to recognise a header). */
function workbookText(buffer: ArrayBuffer): { text: string; sheets: string } {
  const wb: XLSX.WorkBook = readWorkbook(buffer);
  let text = "";
  for (const name of wb.SheetNames) {
    const rows: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: null });
    text += rows.slice(0, 40).map((r) => r.map((c) => String(c ?? "")).join("|")).join("\n") + "\n";
  }
  return { text: norm(text), sheets: norm(wb.SheetNames.join("|")) };
}

/**
 * Recognises which importer a file belongs to, by its content (the extension alone is not enough:
 * three importers read .csv and three read .xlsx).
 */
export function detectImporter(fileName: string, buffer: ArrayBuffer): Detection {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (ext === "pdf") return { importer: "optimize", reason: "PDF: extrato mensal Optimize", candidates: ["optimize"] };

  if (ext === "csv" || ext === "txt") {
    const head = norm(new TextDecoder("utf-8").decode(buffer.slice(0, 4096))).split(/\r?\n/).slice(0, 3).join("\n");
    if (/codigo_binance|yahoo_finance_ticker|codigo_ativo|valor_atual_eur/.test(head)) return { importer: "binance", reason: "CSV com códigos de moedas (Binance)", candidates: ["binance"] };
    if (/id da ordem|order id|bolsa de referencia/.test(head) || (/isin/.test(head) && /quantidade|quantity/.test(head) && /preco|price|valor/.test(head)))
      return { importer: "degiro-trades", reason: "CSV de transações com ISIN e ID da ordem (DEGIRO)", candidates: ["degiro-trades"] };
    if (/data de inicio|started date|data de conclusao|completed date/.test(head) || (/tipo|type/.test(head) && /produto|product/.test(head) && /montante|amount/.test(head)))
      return { importer: "revolut", reason: "CSV de extrato Revolut", candidates: ["revolut"] };
    return { importer: null, reason: "CSV não reconhecido", candidates: ["revolut", "degiro-trades", "binance"] };
  }

  if (ext === "xlsx" || ext === "xls" || ext === "xlsm") {
    let text = "";
    let sheets = "";
    try {
      ({ text, sheets } = workbookText(buffer));
    } catch {
      return { importer: null, reason: "não foi possível ler o ficheiro Excel", candidates: [] };
    }
    if (/data mov\./.test(text) || /saldo a ordem contabil/.test(text)) return { importer: "bpi", reason: "Excel com «Data Mov.» (BPI)", candidates: ["bpi"] };
    if (/exportacao de movimentos/.test(text) || (/\bdata\b/.test(text) && /montante/.test(text) && /descri/.test(text) && /saldo/.test(text)))
      return { importer: "ctt", reason: "Excel de movimentos do Banco CTT", candidates: ["ctt"] };
    if (/open position/.test(sheets) || /cash operation/.test(sheets) || /\|instrument\|/.test(text) || /account number/.test(text))
      return { importer: "xtb", reason: "Excel de relatório XTB", candidates: ["xtb"] };
    if (/produto/.test(text) && /valor em eur|valor local|isin/.test(text)) return { importer: "degiro", reason: "Excel da carteira DEGIRO", candidates: ["degiro"] };
    return { importer: null, reason: "Excel não reconhecido", candidates: ["bpi", "ctt", "xtb", "degiro"] };
  }

  return { importer: null, reason: `extensão .${ext} não suportada`, candidates: [] };
}

export const importerLabel = (key: ImporterKey) => IMPORTERS[key].label;
