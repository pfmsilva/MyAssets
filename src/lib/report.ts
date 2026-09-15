import PDFDocument from "pdfkit";
import { prisma } from "./prisma";
import { byMember, getCurrentValues, getExpenseSeries, getNetWorthSeries, groupBy } from "./analytics";
import { ASSET_TYPE_LABEL, fmtDate, fmtEur, fmtPct, monthLabel } from "./format";

const C = { text: "#0b0b0b", muted: "#52514e", faint: "#8a8985", line: "#e4e3df", accent: "#2a78d6", soft: "#f0efec" };
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

type Col = { title: string; width: number; align?: "left" | "right"; key: string };

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

  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true, info: { Title: "Pecúlio · Relatório do património da família", Author: "Pecúlio" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width - 80;
  /** Truncates text so it fits the given width with the current font (pdfkit would wrap otherwise). */
  const fit = (t: string, width: number) => {
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
  const h1 = (t: string) => {
    ensure(130);
    doc.moveDown(0.6).fillColor(C.text).font("Helvetica-Bold").fontSize(14).text(t, left);
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
  const invest = values.filter((a) => a.type === "BROKERAGE" || a.type === "CRYPTO").reduce((s, a) => s + a.value, 0);
  const ppr = values.filter((a) => a.type === "PPR").reduce((s, a) => s + a.value, 0);
  kpi([
    { label: "Património total", value: fmtEur(total, 0), hint: prev ? `${total - prev >= 0 ? "+" : "-"}${fmtEur(Math.abs(total - prev), 0)} vs. mês anterior` : undefined },
    { label: "Liquidez", value: fmtEur(liquid, 0), hint: "contas à ordem + dinheiro" },
    { label: "Investimentos", value: fmtEur(invest, 0), hint: "carteiras + cripto" },
    { label: "PPR", value: fmtEur(ppr, 0) },
  ]);

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
