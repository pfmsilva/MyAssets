import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

/** Fonts shipped with the app (DejaVu, free licence): the servers have no fonts of their own. */
const FONTS = [join(process.cwd(), "assets/fonts/DejaVuSans.ttf"), join(process.cwd(), "assets/fonts/DejaVuSans-Bold.ttf")];

/**
 * Monotone cubic curve through the points (Fritsch–Carlson), the same shape as the
 * "monotone" lines of the charts in the app: smooth, never overshooting between points.
 */
function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (p.y - pts[i].y) / dx[i]);
  const tangent = pts.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    if (slope[i - 1] * slope[i] <= 0) return 0;
    const w1 = 2 * dx[i] + dx[i - 1];
    const w2 = dx[i] + 2 * dx[i - 1];
    return (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  });
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i].x + h).toFixed(1)},${(pts[i].y + h * tangent[i]).toFixed(1)} ${(pts[i + 1].x - h).toFixed(1)},${(pts[i + 1].y - h * tangent[i + 1]).toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

/**
 * Line chart with a shaded area down to zero, as a PNG for e-mails (clients do not show SVG).
 * It has no text: the dates and values are written in HTML under the image, one column per
 * point, so each point sits at the centre of its column.
 */
export function lineChartPng(values: (number | null)[], opts: { width?: number; height?: number; scale?: number } = {}): Buffer {
  const W = opts.width ?? 560;
  const H = opts.height ?? 150;
  const scale = opts.scale ?? 2;
  const pad = 10;
  const known = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  const all = known.map((p) => p.v);
  const max = Math.max(0, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const y = (v: number) => pad + ((max - v) / span) * (H - 2 * pad);
  const x = (i: number) => ((i + 0.5) * W) / values.length;
  const pts = known.map((p) => ({ x: x(p.i), y: y(p.v) }));
  const last = known.at(-1)?.v ?? 0;
  const color = last >= 0 ? "#008300" : "#e34948";
  const zero = y(0);
  const line = monotonePath(pts);
  const area = pts.length ? `${line} L${pts[pts.length - 1].x.toFixed(1)},${zero.toFixed(1)} L${pts[0].x.toFixed(1)},${zero.toFixed(1)} Z` : "";
  const grid = [0.25, 0.5, 0.75].map((f) => pad + f * (H - 2 * pad));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/><stop offset="100%" stop-color="${color}" stop-opacity="0.04"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${grid.map((gy) => `<line x1="0" x2="${W}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="#e4e3df" stroke-width="1" stroke-dasharray="2 4"/>`).join("")}
  <line x1="0" x2="${W}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}" stroke="#c9c8c3" stroke-width="1"/>
  ${area ? `<path d="${area}" fill="url(#g)"/>` : ""}
  ${line ? `<path d="${line}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
  ${pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#ffffff" stroke="${color}" stroke-width="2"/>`).join("")}
</svg>`;
  return new Resvg(svg, { fitTo: { mode: "zoom", value: scale }, background: "#ffffff" }).render().asPng();
}

const xmlEsc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** "+4,4 k€" style labels, short enough for seven columns. */
function compactEur(v: number) {
  const a = Math.abs(v);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  if (a >= 1e6) return `${sign}${(a / 1e6).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} M€`;
  if (a >= 1000) return `${sign}${(a / 1000).toLocaleString("pt-PT", { maximumFractionDigits: a >= 1e4 ? 0 : 1 })} k€`;
  return `${sign}${Math.round(a)} €`;
}

export type SummaryDay = { label: string; weekday: string; pnl: number | null; cum: number };

/**
 * The two charts of the daily summary in one image, with titles, dates and values drawn in
 * (for Telegram, which shows images but not HTML): bars of each day's change and the cumulative line.
 */
export function summaryChartsPng(days: SummaryDay[], opts: { title?: string; scale?: number; barsTitle?: string; lineTitle?: string; footer?: string } = {}): Buffer {
  const W = 760;
  const padX = 24;
  const colW = (W - 2 * padX) / days.length;
  const cx = (i: number) => padX + (i + 0.5) * colW;
  const txt = (x: number, y: number, s: string, o: { size?: number; color?: string; bold?: boolean; anchor?: string } = {}) =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="DejaVu Sans" font-size="${o.size ?? 13}" fill="${o.color ?? "#52514e"}" ${o.bold ? 'font-weight="bold"' : ""} text-anchor="${o.anchor ?? "middle"}">${xmlEsc(s)}</text>`;
  const green = "#1baf7a";
  const red = "#e34948";
  let y = 0;
  const parts: string[] = [];
  if (opts.title) {
    parts.push(txt(padX, 30, opts.title, { size: 18, color: "#0b0b0b", bold: true, anchor: "start" }));
    y = 44;
  }

  // ---- bars: change of each day ----
  parts.push(txt(padX, y + 26, opts.barsTitle ?? "Variação por dia", { size: 15, color: "#0b0b0b", bold: true, anchor: "start" }));
  const bTop = y + 58;
  const bH = 150;
  const vals = days.map((d) => d.pnl ?? 0);
  const bMax = Math.max(0, ...vals);
  const bMin = Math.min(0, ...vals);
  const bSpan = bMax - bMin || 1;
  const by = (v: number) => bTop + ((bMax - v) / bSpan) * bH;
  const bZero = by(0);
  parts.push(`<line x1="${padX}" x2="${W - padX}" y1="${bZero.toFixed(1)}" y2="${bZero.toFixed(1)}" stroke="#c9c8c3" stroke-width="1"/>`);
  days.forEach((d, i) => {
    const x = cx(i);
    const bw = Math.min(colW * 0.62, 72);
    if (d.pnl === null) {
      parts.push(txt(x, bZero - 6, "—", { color: "#c9c8c3" }));
      return;
    }
    const top = Math.min(by(d.pnl), bZero);
    const h = Math.max(1.5, Math.abs(by(d.pnl) - bZero));
    const color = d.pnl >= 0 ? green : red;
    parts.push(`<rect x="${(x - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${color}"/>`);
    const ly = d.pnl >= 0 ? top - 6 : top + h + 15;
    parts.push(txt(x, ly, compactEur(d.pnl), { size: 12, color }));
  });
  const bLabels = bTop + bH + 34;
  days.forEach((d, i) => {
    parts.push(txt(cx(i), bLabels, d.label, { size: 12, color: "#52514e" }));
    parts.push(txt(cx(i), bLabels + 15, d.weekday, { size: 11, color: "#8a8985" }));
  });

  // ---- line: cumulative gain ----
  const lTitle = bLabels + 50;
  parts.push(txt(padX, lTitle, opts.lineTitle ?? "Ganho acumulado", { size: 15, color: "#0b0b0b", bold: true, anchor: "start" }));
  const lTop = lTitle + 32;
  const lH = 150;
  const cums = days.map((d) => d.cum);
  const lMax = Math.max(0, ...cums);
  const lMin = Math.min(0, ...cums);
  const lSpan = lMax - lMin || 1;
  const ly = (v: number) => lTop + ((lMax - v) / lSpan) * lH;
  const lZero = ly(0);
  const pts = days.map((d, i) => ({ x: cx(i), y: ly(d.cum) }));
  const last = cums.at(-1) ?? 0;
  const lc = last >= 0 ? "#008300" : red;
  const line = monotonePath(pts);
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${lZero.toFixed(1)} L${pts[0].x.toFixed(1)},${lZero.toFixed(1)} Z`;
  parts.push(`<line x1="${padX}" x2="${W - padX}" y1="${lZero.toFixed(1)}" y2="${lZero.toFixed(1)}" stroke="#c9c8c3" stroke-width="1"/>`);
  parts.push(`<path d="${area}" fill="url(#g)"/>`);
  parts.push(`<path d="${line}" fill="none" stroke="${lc}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`);
  days.forEach((d, i) => {
    const p = pts[i];
    parts.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#ffffff" stroke="${lc}" stroke-width="2.5"/>`);
    if (d.pnl !== null) parts.push(txt(p.x, d.cum >= 0 ? p.y - 11 : p.y + 21, compactEur(d.cum), { size: 12, color: d.cum >= 0 ? "#008300" : red }));
  });
  const lLabels = lTop + lH + 48;
  days.forEach((d, i) => {
    parts.push(txt(cx(i), lLabels, d.label, { size: 12, color: "#52514e" }));
    parts.push(txt(cx(i), lLabels + 15, d.weekday, { size: 11, color: "#8a8985" }));
  });

  const H = lLabels + 30 + (opts.footer ? 30 : 0);
  if (opts.footer) parts.push(txt(W - padX, H - 14, opts.footer, { size: 12, color: "#8a8985", anchor: "end" }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="${lc}" stop-opacity="0.28"/><stop offset="100%" stop-color="${lc}" stop-opacity="0.04"/>
  </linearGradient></defs>
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  ${parts.join("\n  ")}
</svg>`;
  return new Resvg(svg, { fitTo: { mode: "zoom", value: opts.scale ?? 2 }, background: "#ffffff", font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" } }).render().asPng();
}
