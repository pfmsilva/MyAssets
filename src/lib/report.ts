import PDFDocument from "pdfkit";
import { prisma } from "./prisma";
import { byMember, getCurrentValues, getExpenseSeries, getNetWorthSeries, groupBy } from "./analytics";
import { ASSET_CLASS_LABEL, ASSET_TYPE_LABEL, fmtDate, fmtEur, fmtPct, monthLabel } from "./format";
import { getAllocation } from "./allocation";
import { getSettings } from "./settings";
import { getPerformance } from "./performance";
import { getDailyPnl, LIVE_TYPES } from "./daily-pnl";
import { getBudgetOverview } from "./budget";
import { getLiveValuationsOnce } from "./quotes";
import { AnalysisSchema, latestAnalysis } from "./ai-analysis";
import { computeHolding } from "./stock-portfolio";

const C = { text: "#0b0b0b", muted: "#52514e", faint: "#8a8985", line: "#e4e3df", accent: "#2a78d6", soft: "#f0efec" };
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

type Col = { title: string; width: number; align?: "left" | "right"; key: string };

// The standard PDF fonts only have the Windows-1252 characters: anything else (for instance in the
// AI analysis text) would print as garbage, so it is replaced by the closest equivalent.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const REPLACE: Record<string, string> = { "−": "-", "→": "->", "←": "<-", "≈": "~", "≥": ">=", "≤": "<=", "≠": "!=", "▲": "+", "▼": "-", "✓": "v", "\u202f": " ", "\u2009": " ", "\u200b": "" };
export function pdfSafe(t: string): string {
  let out = "";
  for (const ch of t) {
    if (REPLACE[ch] !== undefined) out += REPLACE[ch];
    else if (ch.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else out += ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\xff]/g, "");
  }
  return out;
}

/** Builds the family assets summary as a PDF (A4). */
export async function buildFamilyReport(generatedBy: string): Promise<Buffer> {
  const [values, series, members, expenses] = await Promise.all([
    getCurrentValues(),
    getNetWorthSeries(),
    prisma.member.findMany({ orderBy: { sortOrder: "asc" } }),
    getExpenseSeries({ months: 12 }),
  ]);
  const total = values.reduce((s, a) => s + a.value, 0);
  const months = series.months.slice(-12);
  const prev = series.months.length >= 2 ? series.months[series.months.length - 2].total : null;
  const latestPositions = await prisma.snapshot.findMany({
    where: { positions: { some: {} } },
    orderBy: { date: "desc" },
    include: { positions: { orderBy: { valueEur: "desc" } }, asset: { select: { id: true, name: true, active: true, type: true } } },
  });
  const seenAsset = new Set<string>();
  const positionSnaps = latestPositions.filter((s) => (seenAsset.has(s.assetId) ? false : (seenAsset.add(s.assetId), true)));
  // every asset, including inactive ones and those without any recorded value
  const allAssets = await prisma.asset.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      ownerships: { include: { member: true } },
      snapshots: { orderBy: { date: "desc" }, select: { date: true, value: true, source: true } },
      _count: { select: { transactions: true, realizedTrades: true } },
    },
  });
  const inactive = allAssets.filter((a) => !a.active);
  const realizedByAsset = await prisma.realizedTrade.groupBy({ by: ["assetId"], _sum: { profitEur: true }, _count: { _all: true } });
  const allocation = await getAllocation({ live: false, bandPp: (await getSettings()).allocationBandPp }).catch(() => null);
  const month = new Date().toISOString().slice(0, 7);
  const liveIds = values.filter((a) => (LIVE_TYPES as readonly string[]).includes(a.type)).map((a) => a.id);
  const [perf, pnl30, pnlWeeks, budget, live, aiRow, realizedTrades] = await Promise.all([
    getPerformance().catch(() => null),
    getDailyPnl({ days: 30, onlyQuoted: true }).catch(() => null),
    getDailyPnl({ days: 180, group: "week", onlyQuoted: true }).catch(() => null),
    getBudgetOverview(month).catch(() => null),
    getLiveValuationsOnce(liveIds, { resolve: false }).catch(() => new Map()),
    latestAnalysis().catch(() => null),
    prisma.realizedTrade.findMany({ orderBy: { closeTime: "desc" }, take: 400, include: { asset: { select: { name: true } } } }),
  ]);
  // partial fills of the same sale become one line (same portfolio, title and day)
  const closed = new Map<string, { date: Date; asset: string; name: string; qty: number; pnl: number }>();
  for (const t of realizedTrades) {
    const key = `${t.assetId}|${t.name}|${t.closeTime.toISOString().slice(0, 10)}`;
    const cur = closed.get(key) ?? { date: t.closeTime, asset: t.asset.name, name: t.name, qty: 0, pnl: 0 };
    cur.qty += t.quantity ?? 0;
    cur.pnl += t.profitEur;
    closed.set(key, cur);
  }
  const closedList = [...closed.values()].sort((x, y) => y.date.getTime() - x.date.getTime()).slice(0, 20);
  // manual stock portfolios keep their realised gains in the trades themselves
  const manualHoldings = await prisma.holding.findMany({ where: { asset: { type: "STOCK_PORTFOLIO" } }, include: { trades: true, asset: { select: { id: true, name: true } } } });
  const manualRealized = new Map<string, { name: string; sum: number; n: number }>();
  for (const h of manualHoldings) {
    const st = computeHolding(h.trades.map((t) => ({ date: t.date, quantity: t.quantity, amount: t.amount, fee: t.fee })));
    if (!h.trades.some((t) => t.quantity < 0)) continue;
    const cur = manualRealized.get(h.asset.id) ?? { name: h.asset.name, sum: 0, n: 0 };
    cur.sum += st.realizedEur;
    cur.n += h.trades.filter((t) => t.quantity < 0).length;
    manualRealized.set(h.asset.id, cur);
  }
  const ai = aiRow ? AnalysisSchema.safeParse(aiRow.result) : null;
  const liveRows = values.filter((a) => (live.get(a.id)?.quoted ?? 0) > 0).map((a) => ({ a, v: live.get(a.id)! }));
  const liveDelta = liveRows.reduce((sum, r) => sum + r.v.delta, 0);
  const quotesAt = liveRows.map((r) => r.v.quotesAt).filter((d): d is Date => !!d).sort((x, y) => y.getTime() - x.getTime())[0] ?? null;
  const signed = (v: number, digits = 0) => `${v >= 0 ? "+" : "-"}${fmtEur(Math.abs(v), digits)}`;
  const lisbon = (d: Date) => d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true, info: { Title: "Pecúlio · Relatório do património da família", Author: "Pecúlio" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width - 80;
  /** Truncates text so it fits the given width with the current font (pdfkit would wrap otherwise). */
  const fit = (raw: string, width: number) => {
    const t = pdfSafe(raw);
    if (doc.widthOfString(t) <= width) return t;
    let out = t;
    while (out.length > 1 && doc.widthOfString(out + "…") > width) out = out.slice(0, -1);
    return out.trimEnd() + "…";
  };
  const left = 40;
  const bottom = () => doc.page.height - 50;
  const ensure = (h: number) => {
    if (doc.y + h > bottom()) doc.addPage();
  };
  const toc: { title: string; page: number }[] = [];
  const h1 = (t: string, opts: { newPage?: boolean } = {}) => {
    if (opts.newPage && doc.y > 120) doc.addPage();
    else ensure(130);
    toc.push({ title: t, page: doc.bufferedPageRange().start + doc.bufferedPageRange().count });
    doc.moveDown(0.6).fillColor(C.text).font("Helvetica-Bold").fontSize(14).text(pdfSafe(t), left);
    doc.moveTo(left, doc.y + 2).lineTo(left + W, doc.y + 2).strokeColor(C.line).lineWidth(0.8).stroke();
    doc.moveDown(0.5);
  };
  const h2 = (t: string) => {
    ensure(90);
    doc.moveDown(0.3).fillColor(C.muted).font("Helvetica-Bold").fontSize(10);
    const label = fit(t.toUpperCase(), W - t.length * 0.5 - 6); // account for characterSpacing
    doc.text(label, left, doc.y, { width: W, characterSpacing: 0.5, lineBreak: false });
    doc.moveDown(0.3);
  };
  const table = (cols: Col[], rows: Record<string, string>[], opts: { totalRow?: Record<string, string> } = {}) => {
    const rowH = 16;
    const used = cols.slice(0, -1).reduce((s, c) => s + c.width, 0);
    cols[cols.length - 1].width = Math.max(30, W - used);
    for (const c of cols) c.width = Math.max(20, c.width);
    const drawHeader = () => {
      let x = left;
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(C.faint);
      for (const c of cols) {
        doc.text(fit(c.title.toUpperCase(), c.width - 6), x + 3, y, { width: c.width - 6, align: c.align ?? "left", lineBreak: false });
        x += c.width;
      }
      doc.y = y + 12;
      doc.moveTo(left, doc.y).lineTo(left + W, doc.y).strokeColor(C.line).lineWidth(0.8).stroke();
      doc.y += 3;
    };
    ensure(rowH * 3);
    drawHeader();
    const drawRow = (r: Record<string, string>, bold = false) => {
      if (doc.y + rowH > bottom()) {
        doc.addPage();
        drawHeader();
      }
      let x = left;
      const y = doc.y;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(C.text);
      for (const c of cols) {
        doc.text(fit(r[c.key] ?? "", c.width - 6), x + 3, y + 2, { width: c.width - 6, align: c.align ?? "left", lineBreak: false });
        x += c.width;
      }
      doc.y = y + rowH;
      doc.moveTo(left, doc.y).lineTo(left + W, doc.y).strokeColor(C.line).lineWidth(0.3).stroke();
    };
    for (const r of rows) drawRow(r);
    if (opts.totalRow) drawRow(opts.totalRow, true);
    doc.y += 6;
  };
  const kpi = (items: { label: string; value: string; hint?: string }[]) => {
    ensure(60);
    const w = W / items.length;
    const y = doc.y;
    items.forEach((it, i) => {
      const x = left + i * w;
      doc.roundedRect(x + 2, y, w - 4, 52, 6).fillColor(C.soft).fill();
      doc.fillColor(C.faint).font("Helvetica").fontSize(7.5).text(fit(it.label.toUpperCase(), w - 20), x + 10, y + 9, { width: w - 20, lineBreak: false });
      doc.fillColor(C.text).font("Helvetica-Bold").fontSize(14).text(fit(it.value, w - 20), x + 10, y + 21, { width: w - 20, lineBreak: false });
      if (it.hint) doc.fillColor(C.muted).font("Helvetica").fontSize(7.5).text(fit(it.hint, w - 20), x + 10, y + 39, { width: w - 20, lineBreak: false });
    });
    doc.y = y + 60;
  };
  const barChart = (data: { label: string; value: number }[], height = 120) => {
    if (!data.length) return;
    ensure(height + 30);
    const y0 = doc.y;
    const max = Math.max(...data.map((d) => d.value), 1);
    const gap = 6;
    const bw = (W - gap * (data.length - 1)) / data.length;
    doc.moveTo(left, y0 + height).lineTo(left + W, y0 + height).strokeColor(C.line).lineWidth(0.8).stroke();
    data.forEach((d, i) => {
      const h = Math.max(1, (d.value / max) * (height - 14));
      const x = left + i * (bw + gap);
      doc.roundedRect(x, y0 + height - h, bw, h, 3).fillColor(C.accent).fill();
      doc.fillColor(C.faint).font("Helvetica").fontSize(7).text(d.label, x - 4, y0 + height + 4, { width: bw + 8, align: "center", lineBreak: false });
      doc.fillColor(C.muted).fontSize(6.5).text(fmtEur(d.value, 0), x - 6, y0 + height - h - 9, { width: bw + 12, align: "center", lineBreak: false });
    });
    doc.y = y0 + height + 18;
  };
  const para = (t: string, o: { size?: number; color?: string; bold?: boolean; indent?: number; gap?: number } = {}) => {
    ensure(24);
    doc.fillColor(o.color ?? C.text).font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(o.size ?? 9.5).text(pdfSafe(t), left + (o.indent ?? 0), doc.y, { width: W - (o.indent ?? 0), lineGap: 1.5 });
    doc.y += o.gap ?? 4;
  };
  const tagColor: Record<string, string> = { alta: "#e34948", media: "#eda100", baixa: "#2a78d6" };
  const bullet = (title: string, detail: string, tag?: string, extra?: string) => {
    ensure(40);
    const y = doc.y;
    doc.circle(left + 4, y + 5, 2).fillColor(C.accent).fill();
    let x = left + 12;
    if (tag) {
      const label = tag === "media" ? "MÉDIA" : tag.toUpperCase();
      doc.font("Helvetica-Bold").fontSize(7);
      const tw = doc.widthOfString(label) + 8;
      doc.roundedRect(x, y, tw, 11, 3).fillColor(tagColor[tag] ?? C.faint).fill();
      doc.fillColor("#ffffff").text(label, x + 4, y + 2, { lineBreak: false });
      x += tw + 6;
    }
    doc.fillColor(C.text).font("Helvetica-Bold").fontSize(9.5).text(fit(title + (extra ? ` · ${extra}` : ""), left + W - x), x, y, { width: left + W - x, lineBreak: false });
    doc.y = y + 14;
    doc.fillColor(C.muted).font("Helvetica").fontSize(9).text(pdfSafe(detail), left + 12, doc.y, { width: W - 12, lineGap: 1.5 });
    doc.y += 6;
  };
  /** Bars above and below zero (gains and losses). */
  const signedBars = (data: { label: string; value: number }[], height = 110) => {
    if (!data.length) return;
    ensure(height + 26);
    const y0 = doc.y;
    const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
    const mid = y0 + height / 2;
    const gap = data.length > 20 ? 2 : 4;
    const bw = (W - gap * (data.length - 1)) / data.length;
    doc.moveTo(left, mid).lineTo(left + W, mid).strokeColor(C.line).lineWidth(0.8).stroke();
    doc.fillColor(C.faint).font("Helvetica").fontSize(6.5).text(`+${fmtEur(max, 0)}`, left, y0 - 2, { lineBreak: false }).text(`-${fmtEur(max, 0)}`, left, y0 + height - 6, { lineBreak: false });
    const every = Math.ceil(data.length / 10);
    data.forEach((d, i) => {
      const h = Math.max(0.8, (Math.abs(d.value) / max) * (height / 2 - 6));
      const x = left + i * (bw + gap);
      doc.rect(x, d.value >= 0 ? mid - h : mid, bw, h).fillColor(d.value >= 0 ? "#1baf7a" : "#e34948").fill();
      if (i % every === 0) doc.fillColor(C.faint).font("Helvetica").fontSize(6.5).text(d.label, x - 10, y0 + height + 3, { width: bw + 20, align: "center", lineBreak: false });
    });
    doc.y = y0 + height + 16;
  };
  const legendBars = (data: { name: string; value: number; color?: string }[]) => {
    // horizontal share bars
    const sum = data.reduce((s, d) => s + d.value, 0) || 1;
    for (const [i, d] of data.entries()) {
      ensure(16);
      const y = doc.y;
      doc.rect(left, y + 3, 8, 8).fillColor(d.color ?? SERIES[i % SERIES.length]).fill();
      doc.fillColor(C.text).font("Helvetica").fontSize(9).text(fit(d.name, 196), left + 14, y + 2, { width: 200, lineBreak: false });
      const bx = left + 220;
      const bwMax = W - 220 - 130;
      doc.rect(bx, y + 4, bwMax, 6).fillColor(C.soft).fill();
      doc.rect(bx, y + 4, Math.max(1, (d.value / sum) * bwMax), 6).fillColor(d.color ?? SERIES[i % SERIES.length]).fill();
      doc.fillColor(C.muted).fontSize(8.5).text(fmtPct(d.value / sum, 0), bx + bwMax + 6, y + 2, { width: 40, align: "right", lineBreak: false });
      doc.fillColor(C.text).font("Helvetica-Bold").fontSize(9).text(fmtEur(d.value, 0), bx + bwMax + 50, y + 2, { width: 74, align: "right", lineBreak: false });
      doc.y = y + 15;
    }
    doc.y += 4;
  };

  // ---------- Header ----------
  doc.rect(0, 0, doc.page.width, 70).fillColor(C.accent).fill();
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("Pecúlio", left, 22, { lineBreak: false });
  doc.font("Helvetica").fontSize(10).text("Relatório do património da família", left + 90, 30, { lineBreak: false });
  doc.fontSize(8.5).text(`Gerado em ${new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })} por ${generatedBy}`, left, 48, { width: W, align: "right", lineBreak: false });
  doc.y = 90;

  // ---------- KPIs ----------
  const liquid = values.filter((a) => a.type === "CURRENT_ACCOUNT" || a.type === "CASH").reduce((s, a) => s + a.value, 0);
  const invest = values.filter((a) => a.type === "BROKERAGE" || a.type === "STOCK_PORTFOLIO" || a.type === "CRYPTO").reduce((s, a) => s + a.value, 0);
  const ppr = values.filter((a) => a.type === "PPR").reduce((s, a) => s + a.value, 0);
  kpi([
    { label: "Património total", value: fmtEur(total, 0), hint: prev ? `${total - prev >= 0 ? "+" : "-"}${fmtEur(Math.abs(total - prev), 0)} vs. mês anterior` : undefined },
    { label: "Liquidez", value: fmtEur(liquid, 0), hint: "contas à ordem + dinheiro" },
    { label: "Investimentos", value: fmtEur(invest, 0), hint: "carteiras + cripto" },
    { label: "PPR", value: fmtEur(ppr, 0) },
  ]);
  if (liveRows.length) {
    doc.fillColor(C.muted).font("Helvetica").fontSize(8.5).text(
      `Em direto: ${fmtEur(total + liveDelta, 0)} (${signed(liveDelta)} face aos últimos registos de ${liveRows.map((r) => r.a.name).join(", ")})${quotesAt ? ` · cotações Yahoo Finance de ${lisbon(quotesAt)}` : ""}.`,
      left, doc.y, { width: W },
    );
    doc.y += 4;
  }
  // table of contents, filled in at the end once every section knows its page
  const tocY = doc.y + 6;
  doc.y = tocY + 150;

  // ---------- Distribution ----------
  h1("Distribuição do património");
  h2("Por tipo de ativo");
  legendBars(groupBy(values, (a) => a.type, (a) => a.value).map((g, i) => ({ name: ASSET_TYPE_LABEL[g.name] ?? g.name, value: g.value, color: SERIES[i % SERIES.length] })));
  h2("Por instituição");
  legendBars(groupBy(values, (a) => a.institution, (a) => a.value));
  h2("Por membro da família");
  const perMember = byMember(values);
  legendBars(perMember.map((m) => ({ name: m.name, value: m.value, color: m.color })));

  // ---------- Assets ----------
  h1("Ativos");
  table(
    [
      { title: "Ativo", key: "name", width: 122 },
      { title: "Tipo", key: "type", width: 118 },
      { title: "Titulares", key: "owners", width: 113 },
      { title: "Valor", key: "value", width: 75, align: "right" },
      { title: "%", key: "pct", width: 35, align: "right" },
      { title: "Atualizado", key: "date", width: W - 463, align: "right" },
    ],
    values.map((a) => ({
      name: a.name,
      type: ASSET_TYPE_LABEL[a.type] ?? a.type,
      owners: a.owners.map((o) => `${o.memberName}${o.percent < 100 ? ` ${o.percent}%` : ""}`).join(", "),
      value: fmtEur(a.value),
      pct: total ? `${((a.value / total) * 100).toFixed(1)} %` : "",
      date: a.date ? fmtDate(a.date) : "-",
    })),
    { totalRow: { name: "Total", value: fmtEur(total), pct: "100 %" } },
  );
  if (inactive.length) {
    h2("Ativos inativos (não contam para os totais)");
    table(
      [
        { title: "Ativo", key: "name", width: 160 },
        { title: "Tipo", key: "type", width: 120 },
        { title: "Titulares", key: "owners", width: 120 },
        { title: "Último valor", key: "value", width: 75, align: "right" },
        { title: "Data", key: "date", width: W - 475, align: "right" },
      ],
      inactive.map((a) => ({
        name: a.name,
        type: ASSET_TYPE_LABEL[a.type] ?? a.type,
        owners: a.ownerships.map((o) => `${o.member.name}${o.percent < 100 ? ` ${o.percent}%` : ""}`).join(", "),
        value: a.snapshots[0] ? fmtEur(a.snapshots[0].value) : "-",
        date: a.snapshots[0] ? fmtDate(a.snapshots[0].date) : "-",
      })),
    );
  }

  // ---------- Per member ----------
  h1("Património por membro");
  for (const m of members) {
    const mine = values
      .map((a) => ({ a, share: (a.owners.find((o) => o.memberId === m.id)?.percent ?? 0) / 100 }))
      .filter((x) => x.share > 0);
    if (!mine.length) {
      h2(`${m.name} · sem ativos atribuídos`);
      continue;
    }
    const mt = mine.reduce((s, x) => s + x.a.value * x.share, 0);
    h2(`${m.name} · ${fmtEur(mt, 0)} (${total ? fmtPct(mt / total, 0) : "0 %"} do total)`);
    table(
      [
        { title: "Ativo", key: "name", width: 200 },
        { title: "Tipo", key: "type", width: 120 },
        { title: "Quota", key: "share", width: 60, align: "right" },
        { title: "Valor da quota", key: "value", width: W - 380, align: "right" },
      ],
      mine.map((x) => ({ name: x.a.name, type: ASSET_TYPE_LABEL[x.a.type] ?? x.a.type, share: `${x.share * 100} %`, value: fmtEur(x.a.value * x.share) })),
    );
  }

  // ---------- Evolution ----------
  h1("Evolução (últimos 12 meses)");
  barChart(months.map((m) => ({ label: monthLabel(m.month), value: m.total })));
  table(
    [
      { title: "Mês", key: "month", width: 100 },
      { title: "Total", key: "total", width: 110, align: "right" },
      { title: "Variação", key: "delta", width: 110, align: "right" },
      { title: "%", key: "pct", width: W - 320, align: "right" },
    ],
    [...months].reverse().map((m, i, arr) => {
      const p = arr[i + 1]?.total;
      const d = p !== undefined ? m.total - p : null;
      return { month: monthLabel(m.month), total: fmtEur(m.total), delta: d !== null ? `${d >= 0 ? "+" : "-"}${fmtEur(Math.abs(d))}` : "-", pct: d !== null && p ? `${((d / p) * 100).toFixed(1)} %` : "" };
    }),
  );

  // ---------- Live portfolios ----------
  if (liveRows.length) {
    h1("Investimentos em direto");
    para(`Valores às cotações do Yahoo Finance${quotesAt ? ` de ${lisbon(quotesAt)}` : ""}, comparados com o último registo de cada carteira.`, { color: C.muted, size: 8.5 });
    table(
      [
        { title: "Carteira", key: "name", width: 110 },
        { title: "Último registo", key: "rec", width: 80, align: "right" },
        { title: "Em direto", key: "live", width: 80, align: "right" },
        { title: "Variação", key: "delta", width: 70, align: "right" },
        { title: "Hoje", key: "day", width: 70, align: "right" },
        { title: "Ganho/perda", key: "pnl", width: W - 410, align: "right" },
      ],
      liveRows.map(({ a, v }) => ({
        name: `${a.name} (${v.quoted}/${v.quotable})`,
        rec: fmtEur(v.snapshotTotal, 0),
        live: fmtEur(v.liveTotal, 0),
        delta: signed(v.delta),
        day: signed(v.dayChangeEur),
        pnl: v.unrealizedPnl !== null ? `${signed(v.unrealizedPnl)}${v.unrealizedPnlPct !== null ? ` (${v.unrealizedPnlPct >= 0 ? "+" : ""}${fmtPct(v.unrealizedPnlPct, 1)})` : ""}` : "sem custo",
      })),
      {
        totalRow: {
          name: "Total",
          rec: fmtEur(liveRows.reduce((sum, r) => sum + r.v.snapshotTotal, 0), 0),
          live: fmtEur(liveRows.reduce((sum, r) => sum + r.v.liveTotal, 0), 0),
          delta: signed(liveDelta),
          day: signed(liveRows.reduce((sum, r) => sum + r.v.dayChangeEur, 0)),
          pnl: signed(liveRows.reduce((sum, r) => sum + (r.v.unrealizedPnl ?? 0), 0)),
        },
      },
    );
  }

  // ---------- Performance ----------
  if (perf && perf.rows.length) {
    h1("Rentabilidade");
    para("Ganho = valor − valor no início do período − depósitos e levantamentos. TWR: rentabilidade encadeada mês a mês, independente do momento dos depósitos. XIRR: taxa anual do dinheiro investido.", { color: C.muted, size: 8.5 });
    const pc = (v: number | null) => (v === null ? "-" : `${v >= 0 ? "+" : ""}${fmtPct(v, 1)}`);
    const all = perf.combined ? [...perf.rows, perf.combined] : perf.rows;
    table(
      [
        { title: "Carteira", key: "name", width: 115 },
        { title: "Valor", key: "value", width: 70, align: "right" },
        { title: "Fluxos", key: "flows", width: 65, align: "right" },
        { title: "Este ano", key: "ytd", width: 90, align: "right" },
        { title: "Desde o início", key: "all", width: 90, align: "right" },
        { title: "XIRR a.a.", key: "xirr", width: W - 430, align: "right" },
      ],
      all.map((r) => {
        const y = r.periods[0];
        const i = r.periods.at(-1);
        return {
          name: r.id === "all" ? "Todos os investimentos" : r.name,
          value: fmtEur(r.value, 0),
          flows: fmtEur(r.flowsTotal, 0),
          ytd: y?.gain != null ? `${signed(y.gain)} · ${pc(y.twr)}` : "-",
          all: i?.gain != null ? `${signed(i.gain)} · ${pc(i.twr)}` : "-",
          xirr: pc(i?.xirr ?? null),
        };
      }),
    );
  }

  // ---------- Gains and losses ----------
  if (pnl30 && pnl30.points.length) {
    h1("Ganhos e perdas das carteiras cotadas");
    kpi([
      { label: "Últimos 30 dias", value: signed(pnl30.totalPnl), hint: pnl30.from ? `desde ${fmtDate(pnl30.from)}` : undefined },
      { label: "Hoje (em direto)", value: pnl30.todayLive !== null ? signed(pnl30.todayLive) : "-" },
      { label: "Melhor dia", value: pnl30.bestDay ? signed(pnl30.bestDay.pnl) : "-", hint: pnl30.bestDay ? fmtDate(pnl30.bestDay.date) : undefined },
      { label: "Pior dia", value: pnl30.worstDay ? signed(pnl30.worstDay.pnl) : "-", hint: pnl30.worstDay ? fmtDate(pnl30.worstDay.date) : undefined },
    ]);
    h2("Variação diária (30 dias)");
    signedBars(pnl30.points.map((pt) => ({ label: pt.label, value: pt.pnl })));
    if (pnlWeeks && pnlWeeks.points.length > 1) {
      h2(`Variação semanal (6 meses · acumulado ${signed(pnlWeeks.totalPnl)})`);
      signedBars(pnlWeeks.points.map((pt) => ({ label: pt.label.replace("sem. ", "S"), value: pt.pnl })), 90);
    }
    para("Variação entre registos consecutivos das carteiras com cotação, descontando depósitos e levantamentos; o último ponto inclui o valor de hoje às cotações do momento.", { color: C.faint, size: 8 });
  }

  // ---------- Allocation ----------
  if (allocation && allocation.rows.some((r) => r.current > 0)) {
    h1("Alocação por classe de ativo");
    if (allocation.targetTotal > 0) {
      table(
        [
          { title: "Classe", key: "name", width: 150 },
          { title: "Valor", key: "value", width: 85, align: "right" },
          { title: "Peso", key: "pct", width: 55, align: "right" },
          { title: "Alvo", key: "target", width: 55, align: "right" },
          { title: "Desvio", key: "drift", width: 60, align: "right" },
          { title: "Ajustar", key: "delta", width: W - 405, align: "right" },
        ],
        allocation.rows
          .filter((r) => r.current > 0 || r.targetPct)
          .map((r) => ({
            name: ASSET_CLASS_LABEL[r.assetClass] ?? r.assetClass,
            value: fmtEur(r.current, 0),
            pct: fmtPct(r.currentPct, 1),
            target: r.targetPct !== null ? fmtPct(r.targetPct, 1) : "-",
            drift: r.driftPp !== null ? `${r.driftPp > 0 ? "+" : ""}${r.driftPp.toFixed(1)} pp` : "-",
            delta: r.delta !== null ? `${r.delta > 0 ? "+" : ""}${fmtEur(r.delta, 0)}` : "-",
          })),
        { totalRow: { name: "Total", value: fmtEur(allocation.total, 0), pct: "100 %", target: allocation.targetTotal ? `${allocation.targetTotal.toFixed(0)} %` : "" } },
      );
      if (allocation.newMoneyNeeded !== null && allocation.newMoneyNeeded > 0) {
        doc.fillColor(C.muted).font("Helvetica").fontSize(8.5).text(`Reforço necessário para equilibrar sem vender: ${fmtEur(allocation.newMoneyNeeded, 0)} (tolerância de ${allocation.bandPp} pp).`, left, doc.y, { width: W });
        doc.y += 12;
      }
    } else {
      legendBars(allocation.rows.filter((r) => r.current > 0).map((r) => ({ name: ASSET_CLASS_LABEL[r.assetClass] ?? r.assetClass, value: r.current })));
    }
  }

  // ---------- Positions ----------
  if (positionSnaps.length) {
    h1("Composição das carteiras e planos");
    for (const snap of positionSnaps) {
      const withCost = snap.positions.filter((p) => p.costEur !== null);
      const cost = withCost.reduce((s, p) => s + p.costEur!, 0);
      const pnl = withCost.reduce((s, p) => s + (p.valueEur - p.costEur!), 0);
      const realized = realizedByAsset.find((r) => r.assetId === snap.assetId);
      const bits = [`${fmtEur(snap.value)} em ${fmtDate(snap.date)}`];
      if (withCost.length) bits.push(`ganho/perda ${pnl >= 0 ? "+" : "-"}${fmtEur(Math.abs(pnl), 0)}${cost ? ` (${pnl >= 0 ? "+" : ""}${fmtPct(pnl / cost)})` : ""}`);
      if (realized?._sum.profitEur !== undefined && realized._sum.profitEur !== null) bits.push(`realizado ${realized._sum.profitEur >= 0 ? "+" : "-"}${fmtEur(Math.abs(realized._sum.profitEur), 0)} em ${realized._count._all} posições fechadas`);
      h2(`${snap.asset.name}${snap.asset.active ? "" : " (inativo)"} · ${bits.join(" · ")}`);
      const hasCost = withCost.length > 0;
      const cols = hasCost
        ? [
            { title: "Produto", key: "name", width: 132 },
            { title: "ISIN / Ticker", key: "isin", width: 50 },
            { title: "Qtd.", key: "qty", width: 48, align: "right" as const },
            { title: "P. médio", key: "avg", width: 48, align: "right" as const },
            { title: "Preço", key: "price", width: 48, align: "right" as const },
            { title: "Valor", key: "value", width: 62, align: "right" as const },
            { title: "Ganho/perda", key: "pnl", width: 84, align: "right" as const },
            { title: "%", key: "pct", width: W - 472, align: "right" as const },
          ]
        : [
            { title: "Produto", key: "name", width: 200 },
            { title: "ISIN / Ticker", key: "isin", width: 85 },
            { title: "Qtd.", key: "qty", width: 55, align: "right" as const },
            { title: "Preço", key: "price", width: 60, align: "right" as const },
            { title: "Valor", key: "value", width: 75, align: "right" as const },
            { title: "%", key: "pct", width: W - 475, align: "right" as const },
          ];
      table(
        cols,
        snap.positions.slice(0, 40).map((p) => ({
          name: p.name,
          isin: p.isin ?? "",
          qty: p.quantity != null ? p.quantity.toLocaleString("pt-PT", { maximumFractionDigits: 4 }) : "",
          avg: p.avgPrice != null ? p.avgPrice.toLocaleString("pt-PT", { maximumFractionDigits: 3 }) : "",
          price: p.price != null ? p.price.toLocaleString("pt-PT", { maximumFractionDigits: 3 }) : "",
          value: fmtEur(p.valueEur),
          pnl: p.costEur != null ? `${p.valueEur - p.costEur >= 0 ? "+" : "-"}${fmtEur(Math.abs(p.valueEur - p.costEur), 0)}${p.costEur ? ` (${p.valueEur - p.costEur >= 0 ? "+" : ""}${fmtPct((p.valueEur - p.costEur) / p.costEur, 0)})` : ""}` : "",
          pct: snap.value ? `${((p.valueEur / snap.value) * 100).toFixed(1)} %` : "",
        })),
      );
      if (snap.positions.length > 40) doc.fillColor(C.faint).font("Helvetica").fontSize(8).text(`… e mais ${snap.positions.length - 40} posições`, left, doc.y);
    }
  }

  // ---------- Realized gains ----------
  if (realizedByAsset.length || manualRealized.size) {
    h1("Mais-valias realizadas");
    const summary = [
      ...realizedByAsset.map((r) => ({ name: allAssets.find((a) => a.id === r.assetId)?.name ?? r.assetId, n: String(r._count._all), sum: r._sum.profitEur ?? 0 })),
      ...[...manualRealized.values()].map((r) => ({ name: `${r.name} (compras e vendas registadas)`, n: String(r.n), sum: r.sum })),
    ];
    table(
      [
        { title: "Carteira", key: "name", width: 240 },
        { title: "Vendas", key: "n", width: 90, align: "right" },
        { title: "Resultado", key: "sum", width: W - 330, align: "right" },
      ],
      summary.map((r) => ({ name: r.name, n: r.n, sum: signed(r.sum, 2) })),
      { totalRow: { name: "Total", sum: signed(summary.reduce((acc, r) => acc + r.sum, 0), 2) } },
    );
    if (closedList.length) {
      h2("Últimas vendas (execuções parciais agrupadas)");
      table(
        [
          { title: "Data", key: "date", width: 60 },
          { title: "Carteira", key: "asset", width: 80 },
          { title: "Título", key: "name", width: 170 },
          { title: "Qtd.", key: "qty", width: 55, align: "right" },
          { title: "Resultado", key: "pnl", width: W - 365, align: "right" },
        ],
        closedList.map((t) => ({ date: fmtDate(t.date), asset: t.asset, name: t.name, qty: t.qty ? t.qty.toLocaleString("pt-PT", { maximumFractionDigits: 4 }) : "", pnl: signed(t.pnl, 2) })),
      );
    }
  }

  // ---------- Expenses ----------
  if (expenses.months.length) {
    const inc = expenses.months.reduce((s, m) => s + m.income, 0);
    const exp = expenses.months.reduce((s, m) => s + m.expense, 0);
    h1("Rendimentos, despesas e poupança (12 meses)");
    kpi([
      { label: "Rendimentos", value: fmtEur(inc, 0) },
      { label: "Despesas", value: fmtEur(exp, 0), hint: `média ${fmtEur(exp / expenses.months.length, 0)}/mês` },
      { label: "Poupança", value: fmtEur(inc - exp, 0), hint: inc > 0 ? `taxa ${fmtPct((inc - exp) / inc)}` : undefined },
      { label: "Investido", value: fmtEur(expenses.months.reduce((s, m) => s + m.investment, 0), 0) },
    ]);
    h2("Despesas por categoria");
    legendBars(expenses.categories.filter((c) => c.value > 0).slice(0, 10));
    h2("Mês a mês");
    table(
      [
        { title: "Mês", key: "month", width: 90 },
        { title: "Rendimentos", key: "inc", width: 95, align: "right" },
        { title: "Despesas", key: "exp", width: 95, align: "right" },
        { title: "Poupança", key: "sav", width: 95, align: "right" },
        { title: "Taxa", key: "rate", width: 60, align: "right" },
        { title: "Investido", key: "inv", width: W - 435, align: "right" },
      ],
      [...expenses.months].reverse().map((m) => ({
        month: monthLabel(m.month),
        inc: fmtEur(m.income, 0),
        exp: fmtEur(m.expense, 0),
        sav: signed(m.savings),
        rate: m.savingsRate != null ? fmtPct(m.savingsRate, 0) : "-",
        inv: fmtEur(m.investment, 0),
      })),
    );
  }

  // ---------- Budget ----------
  if (budget && budget.rows.some((r) => r.spent || r.limit)) {
    h1(`Orçamento de ${monthLabel(month)}`);
    const withLimit = budget.rows.filter((r) => r.limit);
    para(
      `Gasto no mês: ${fmtEur(budget.totals.spent, 0)}${budget.totals.limit ? ` · categorias com limite: ${fmtEur(budget.totals.spentBudgeted, 0)} de ${fmtEur(budget.totals.limit, 0)} (${fmtPct(budget.totals.spentBudgeted / budget.totals.limit, 0)})` : " · sem limites definidos"} · mês anterior ${fmtEur(budget.totals.prev, 0)} · mesmo mês do ano anterior ${fmtEur(budget.totals.lastYear, 0)}. ${withLimit.filter((r) => r.status === "over").length} categoria(s) acima do limite.`,
      { color: C.muted, size: 8.5 },
    );
    table(
      [
        { title: "Categoria", key: "name", width: 150 },
        { title: "Gasto", key: "spent", width: 75, align: "right" },
        { title: "Limite", key: "limit", width: 70, align: "right" },
        { title: "Execução", key: "pct", width: 65, align: "right" },
        { title: "Mês anterior", key: "prev", width: 75, align: "right" },
        { title: "Ano anterior", key: "ly", width: W - 435, align: "right" },
      ],
      budget.rows.filter((r) => r.spent || r.limit || r.prev).map((r) => ({
        name: r.status === "over" ? `${r.name} (!)` : r.name,
        spent: fmtEur(r.spent, 0),
        limit: r.limit ? fmtEur(r.limit, 0) : "-",
        pct: r.pct !== null ? fmtPct(r.pct, 0) : "-",
        prev: fmtEur(r.prev, 0),
        ly: fmtEur(r.lastYear, 0),
      })),
      { totalRow: { name: "Total", spent: fmtEur(budget.totals.spent, 0), limit: budget.totals.limit ? fmtEur(budget.totals.limit, 0) : "", prev: fmtEur(budget.totals.prev, 0), ly: fmtEur(budget.totals.lastYear, 0) } },
    );
  }

  // ---------- AI analysis ----------
  h1("Análise de IA", { newPage: true });
  if (aiRow && ai?.success) {
    const a = ai.data;
    para(`Última análise: ${lisbon(aiRow.createdAt)} · pedida por ${aiRow.createdBy} · modelo ${aiRow.model}. Os números foram calculados pela aplicação; o modelo apenas os interpreta.`, { color: C.muted, size: 8.5 });
    h2("Resumo");
    para(a.resumo, { size: 10, gap: 8 });
    if (a.observacoes.length) {
      h2("Observações");
      for (const o of a.observacoes) bullet(o.titulo, o.detalhe);
    }
    if (a.riscos.length) {
      h2("Riscos");
      for (const r of a.riscos) bullet(r.titulo, r.detalhe, r.gravidade);
    }
    if (a.sugestoes.length) {
      h2("Sugestões");
      for (const g of a.sugestoes) bullet(g.titulo, g.detalhe, g.prioridade, [g.classe, g.montanteIndicativo != null ? fmtEur(g.montanteIndicativo, 0) : null].filter(Boolean).join(" · ") || undefined);
    }
    if (a.perguntas.length) {
      h2("Perguntas a responder antes de decidir");
      for (const q of a.perguntas) para(`•  ${q}`, { indent: 4, size: 9 });
    }
    para("Isto não é aconselhamento financeiro. O modelo pode enganar-se ou omitir contexto importante (impostos, objetivos, horizonte, situação familiar); confirme sempre antes de agir.", { color: C.faint, size: 8, gap: 6 });
  } else {
    para("Ainda não foi feita nenhuma análise de IA. Pode pedi-la em Investimentos > Análise de IA (requer a chave ANTHROPIC_API_KEY e a ativação em Administração > Definições).", { color: C.muted });
  }

  // ---------- Per asset detail ----------
  h1("Detalhe por ativo");
  table(
    [
      { title: "Ativo", key: "name", width: 120 },
      { title: "Instituição", key: "inst", width: 70 },
      { title: "Registos", key: "n", width: 45, align: "right" },
      { title: "Primeiro", key: "first", width: 55, align: "right" },
      { title: "Último", key: "last", width: 55, align: "right" },
      { title: "Valor", key: "value", width: 70, align: "right" },
      { title: "12 meses", key: "y", width: 70, align: "right" },
      { title: "Mov.", key: "tx", width: W - 485, align: "right" },
    ],
    allAssets.map((a) => {
      const latest = a.snapshots[0];
      const yearAgo = new Date(Date.now() - 365 * 86400e3);
      const old = a.snapshots.find((s) => s.date <= yearAgo);
      const y = latest && old ? latest.value - old.value : null;
      return {
        name: `${a.name}${a.active ? "" : " (inativo)"}`,
        inst: a.institution,
        n: String(a.snapshots.length),
        first: a.snapshots.length ? fmtDate(a.snapshots[a.snapshots.length - 1].date) : "-",
        last: latest ? fmtDate(latest.date) : "-",
        value: latest ? fmtEur(latest.value) : "sem valor",
        y: y !== null ? `${y >= 0 ? "+" : "-"}${fmtEur(Math.abs(y), 0)}` : "-",
        tx: a._count.transactions ? String(a._count.transactions) : "-",
      };
    }),
  );

  // ---------- Notes ----------
  h1("Notas e metodologia");
  for (const t of [
    "Valores: último valor registado de cada ativo (importações, registos manuais e valor diário das carteiras). Ativos inativos não contam para os totais.",
    "Em direto: posições das carteiras avaliadas às cotações do Yahoo Finance, convertidas para euros ao câmbio do momento; as restantes mantêm o último valor registado.",
    "Titularidade: o património de cada membro é a soma das quotas que detém em cada ativo.",
    "Despesas: movimentos das contas à ordem categorizados; transferências e investimentos não contam como despesa. Reembolsos reduzem o gasto da categoria.",
    "Rentabilidade: TWR pelo método de Dietz modificado mês a mês; XIRR sobre os fluxos (depósitos e levantamentos) conhecidos de cada carteira.",
  ])
    para(`•  ${t}`, { size: 8.5, color: C.muted });

  // ---------- Table of contents (first page) ----------
  doc.switchToPage(0);
  doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(9).text("ÍNDICE", left, tocY, { characterSpacing: 0.5, lineBreak: false });
  const perCol = Math.ceil(toc.length / 2);
  const colW = W / 2 - 10;
  toc.forEach((entry, i) => {
    const col = i < perCol ? 0 : 1;
    const x = left + col * (W / 2 + 10);
    const y = tocY + 16 + (i % perCol) * 14;
    doc.fillColor(C.text).font("Helvetica").fontSize(9).text(fit(entry.title, colW - 30), x, y, { width: colW - 30, lineBreak: false });
    doc.fillColor(C.faint).text(String(entry.page), x + colW - 30, y, { width: 30, align: "right", lineBreak: false });
    doc.moveTo(x, y + 11).lineTo(x + colW, y + 11).strokeColor(C.line).lineWidth(0.3).stroke();
  });

  // ---------- Footer with page numbers ----------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fillColor(C.faint).font("Helvetica").fontSize(7.5).text(`Pecúlio · Relatório do património da família · página ${i + 1} de ${range.count}`, left, doc.page.height - 32, { width: W, align: "center", lineBreak: false });
    doc.page.margins.bottom = bottomMargin;
  }
  doc.end();
  return done;
}
