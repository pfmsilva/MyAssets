import { Resvg } from "@resvg/resvg-js";

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
