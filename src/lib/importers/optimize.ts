import { pdfLines } from "../pdf-text";
import { ParsedImport, ParsedPosition, ParsedTransaction } from "./types";

const MONTHS: Record<string, number> = { janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const num = (s: string) => (s === "---" ? 0 : Number(s.replace(/,/g, "")));
const iso = (d: number, m: number, y: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const ptDate = (s: string) => {
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
};
const longDate = (d: string, mon: string, y: string) => {
  const m = MONTHS[mon.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")] ?? MONTHS[mon.toLowerCase()];
  return m ? iso(Number(d), m, Number(y)) : undefined;
};

/** Optimize Investment Partners monthly statement (PDF): holdings per sub-account, previous month total and cash movements. */
export async function parseOptimize(buffer: ArrayBuffer): Promise<ParsedImport> {
  const pages = await pdfLines(buffer);
  const lines = pages.flat().filter((l) => !/Optimize Investment Partners SGOIC|^T\. \+351|^Capital Social/.test(l));
  const meta: Record<string, string> = {};
  const warnings: string[] = [];

  let periodEnd: string | undefined;
  let periodStart: string | undefined;
  let saldoInicial: number | undefined;
  let saldoFinal: number | undefined;
  for (const l of lines) {
    const p = l.match(/per[ií]odo de refer[êe]ncia de (\d{1,2}) de ([A-Za-zÀ-ÿ]+) de (\d{4}) a (\d{1,2}) de ([A-Za-zÀ-ÿ]+) de (\d{4})/i);
    if (p) {
      periodStart = longDate(p[1], p[2], p[3]);
      periodEnd = longDate(p[4], p[5], p[6]);
    }
    let m;
    if ((m = l.match(/^Saldo inicial (-?[\d,]+\.\d+|---) €/))) saldoInicial = num(m[1]);
    if ((m = l.match(/^Saldo final (-?[\d,]+\.\d+|---) €/))) saldoFinal = num(m[1]);
    if ((m = l.match(/^Potenciais (-?[\d,]+\.\d+|---) €/))) meta.valiasPotenciais = String(num(m[1]));
    if ((m = l.match(/Dep[óo]sitos (-?[\d,]+\.\d+|---) €/))) meta.depositosAcumulados = String(num(m[1]));
    if ((m = l.match(/^Ofertas (-?[\d,]+\.\d+|---) €/))) meta.ofertas = String(num(m[1]));
    if ((m = l.match(/^(\d{6,})\s+[A-Za-zÀ-ÿ]/)) && !meta.client) meta.client = m[1];
  }
  if (!periodEnd) throw new Error("Extrato Optimize: período de referência não encontrado (é um extrato mensal da Optimize?).");
  meta.period = `${periodStart} a ${periodEnd}`;

  // ---- holdings and movements ----
  const positions = new Map<string, ParsedPosition>();
  const prevTotals = new Map<string, { date: string; value: number }>();
  const txs: ParsedTransaction[] = [];
  const seenTx = new Set<string>();
  let account = "";
  let mode: "pos" | "mov" | "none" = "none";
  let cash = false;
  for (const l of lines) {
    const acc = l.match(/Dep[óo]sito UPs n[ºo°]?\s*([\w-]+)/i);
    if (acc) {
      const full = acc[1];
      account = meta.client && full.startsWith(meta.client + "-") ? full.slice(meta.client.length + 1) : full;
      mode = /^CONTA:/i.test(l) ? "mov" : "pos";
      cash = false;
      continue;
    }
    if (/^Movimentos no per[íi]odo/i.test(l)) {
      mode = "none";
      continue;
    }
    if (mode === "pos") {
      const t = l.match(/^Total a (\d{1,2}) de ([A-Za-zÀ-ÿ]+) de (\d{4})\s+(.*)$/i);
      if (t) {
        const date = longDate(t[1], t[2], t[3]);
        const nums = t[4].match(/-?[\d,]+\.\d+/g) ?? [];
        if (date && date !== periodEnd && nums.length === 1 && !prevTotals.has(account)) prevTotals.set(account, { date, value: num(nums[0]) });
        continue;
      }
      const r = l.match(/^(.+?)\s(-?[\d,]+\.\d+)\s(-?[\d,]+\.\d+) €\s(-?[\d,]+\.\d+) €\s(-?[\d,]+\.\d+) €\s(-?[\d,]+\.\d+) %\s(-?[\d,]+\.\d+) €\s(-?[\d,]+\.\d+) %$/);
      if (r) {
        const key = `${account}|${r[1]}`;
        if (!positions.has(key)) {
          const value = num(r[7]);
          const valia = num(r[5]);
          positions.set(key, {
            name: account ? `${r[1].trim()} · ${account}` : r[1].trim(),
            quantity: num(r[2]),
            avgPrice: num(r[3]),
            price: num(r[4]),
            currency: "EUR",
            value,
            valueEur: value,
            costEur: Math.round((value - valia) * 100) / 100,
          });
        }
      }
    } else if (mode === "mov") {
      if (/^Conta [àa] ordem/i.test(l)) {
        cash = true;
        continue;
      }
      if (/^Mercado de capitais/i.test(l)) {
        cash = false;
        continue;
      }
      if (!cash || /^Saldo (Inicial|Final)/i.test(l)) continue;
      const r = l.match(/^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ./-]*?)\s(\d{2}-\d{2}-\d{4})\s(\d{2}-\d{2}-\d{4})(?:\s(\d{2}-\d{2}-\d{4}))?\s(.+)$/);
      if (!r) continue;
      const money = r[5].match(/(-?[\d,]+\.\d+|---) €/g)?.map((s) => s.replace(" €", "")) ?? [];
      if (money.length < 6) continue;
      const [, , , debit, credit] = money.slice(-6);
      const amount = Math.round((num(credit) + num(debit)) * 100) / 100;
      if (!amount) continue;
      const fp = `${account}|${l}`;
      if (seenTx.has(fp)) continue; // the same account block printed twice (page break)
      seenTx.add(fp);
      const date = ptDate(r[2])!;
      txs.push({ date, valueDate: ptDate(r[3]), seq: txs.length, description: `${r[1].trim()} · ${account}`, amount, kind: r[1].trim(), status: "COMPLETED" });
    }
  }
  txs.sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq);
  txs.forEach((t, i) => (t.seq = i));

  const pos = [...positions.values()];
  const total = Math.round(pos.reduce((s, p) => s + p.valueEur, 0) * 100) / 100;
  if (!pos.length) warnings.push("Nenhuma posição encontrada na secção “Situação detalhada”.");
  if (saldoFinal !== undefined && Math.abs(total - saldoFinal) > 0.05) warnings.push(`A soma das posições (${total} €) difere do saldo final do extrato (${saldoFinal} €).`);
  const previousSnapshots: { date: string; value: number }[] = [];
  if (prevTotals.size) {
    const byDate = new Map<string, number>();
    for (const t of prevTotals.values()) byDate.set(t.date, (byDate.get(t.date) ?? 0) + t.value);
    for (const [date, value] of byDate) previousSnapshots.push({ date, value: Math.round(value * 100) / 100 });
    if (saldoInicial !== undefined && previousSnapshots.length === 1 && Math.abs(previousSnapshots[0].value - saldoInicial) > 0.05) warnings.push(`Total do mês anterior (${previousSnapshots[0].value} €) difere do saldo inicial (${saldoInicial} €).`);
  }
  return { source: "optimize", transactions: txs, positions: pos, previousSnapshots, balance: saldoFinal ?? total, balanceDate: periodEnd, meta, warnings };
}
