import { combineSeries, flowsByAsset, loadAssetsWithSnapshots, valueAt, type Flow } from "./asset-series";

export { getAssetFlows, valueAt, type Flow } from "./asset-series";

// ---------- XIRR ----------
export function xirr(flows: { date: Date; amount: number }[]): number | null {
  const fs = flows.filter((f) => f.amount !== 0);
  if (fs.length < 2 || !fs.some((f) => f.amount > 0) || !fs.some((f) => f.amount < 0)) return null;
  const t0 = Math.min(...fs.map((f) => f.date.getTime()));
  const years = fs.map((f) => (f.date.getTime() - t0) / (365.25 * 86400e3));
  const span = Math.max(...years);
  if (span <= 0) return null;
  const npv = (r: number) => fs.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, years[i]), 0);
  const dnpv = (r: number) => fs.reduce((s, f, i) => s - (years[i] * f.amount) / Math.pow(1 + r, years[i] + 1), 0);
  let r = 0.05;
  for (let i = 0; i < 60; i++) {
    const v = npv(r);
    const d = dnpv(r);
    if (!Number.isFinite(v) || !Number.isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (!Number.isFinite(next) || next <= -0.999) break;
    if (Math.abs(next - r) < 1e-9) return next;
    r = next;
  }
  // bisection fallback
  let lo = -0.99, hi = 10;
  let flo = npv(lo), fhi = npv(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

// ---------- TWR (monthly Modified Dietz, chained) ----------
export function twr(snapshots: { date: Date; value: number }[], flows: Flow[], from: Date, to: Date): { twr: number | null; months: number } {
  const startVal = valueAt(snapshots, from);
  if (startVal === null) return { twr: null, months: 0 };
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0)); // end of the from-month
  let index = 1;
  let months = 0;
  let prevVal = startVal;
  let prevDate = from;
  while (cursor.getTime() <= to.getTime() + 86400e3) {
    const end = cursor.getTime() > to.getTime() ? to : cursor;
    const endVal = valueAt(snapshots, end);
    if (endVal !== null) {
      const periodFlows = flows.filter((f) => f.date.getTime() > prevDate.getTime() && f.date.getTime() <= end.getTime());
      const F = periodFlows.reduce((s, f) => s + f.amount, 0);
      const len = Math.max(1, end.getTime() - prevDate.getTime());
      const weighted = periodFlows.reduce((s, f) => s + f.amount * ((end.getTime() - f.date.getTime()) / len), 0);
      const denom = prevVal + weighted;
      if (denom > 0) {
        const r = (endVal - prevVal - F) / denom;
        if (Number.isFinite(r) && r > -1) {
          index *= 1 + r;
          months++;
        }
      }
      prevVal = endVal;
      prevDate = end;
    }
    if (cursor.getTime() >= to.getTime()) break;
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 2, 0));
  }
  return { twr: months ? index - 1 : null, months };
}

export type PeriodPerf = { label: string; from: Date | null; startValue: number | null; invested: number; gain: number | null; xirr: number | null; twr: number | null; annualized: number | null };
export type AssetPerf = {
  id: string;
  name: string;
  type: string;
  value: number;
  valueDate: Date | null;
  firstDate: Date | null;
  firstValue: number | null;
  flows: Flow[]; // all known external flows (may include flows before the first valuation)
  flowsTotal: number; // Σ known flows (in − out)
  periods: PeriodPerf[];
};

function periodStarts(now: Date): { label: string; from: Date | null }[] {
  const y = now.getUTCFullYear();
  return [
    { label: "Este ano", from: new Date(Date.UTC(y - 1, 11, 31)) },
    { label: "1 ano", from: new Date(now.getTime() - 365 * 86400e3) },
    { label: "3 anos", from: new Date(now.getTime() - 3 * 365.25 * 86400e3) },
    { label: "Desde o início", from: null },
  ];
}

/** Performance is measured from the first valuation: gain = value − start value − flows in between. */
export function computeAssetPerf(asset: { id: string; name: string; type: string }, snapshots: { date: Date; value: number }[], flows: Flow[], now = new Date()): AssetPerf {
  const sorted = [...snapshots].sort((a, b) => a.date.getTime() - b.date.getTime());
  const latest = sorted[sorted.length - 1];
  const first = sorted[0];
  const value = latest?.value ?? 0;
  const flowsAsc = [...flows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const periods: PeriodPerf[] = periodStarts(now).map((p) => {
    if (!first || !latest) return { ...p, startValue: null, invested: 0, gain: null, xirr: null, twr: null, annualized: null };
    const from = p.from && p.from.getTime() > first.date.getTime() ? p.from : first.date;
    if (from.getTime() >= latest.date.getTime()) return { label: p.label, from, startValue: null, invested: 0, gain: null, xirr: null, twr: null, annualized: null };
    const startValue = valueAt(sorted, from) ?? first.value;
    const periodFlows = flowsAsc.filter((f) => f.date.getTime() > from.getTime() && f.date.getTime() <= latest.date.getTime());
    const invested = periodFlows.reduce((s, f) => s + f.amount, 0);
    const gain = value - startValue - invested;
    const cf = [{ date: from, amount: -startValue }, ...periodFlows.map((f) => ({ date: f.date, amount: -f.amount })), { date: latest.date, amount: value }];
    const r = xirr(cf);
    const t = twr(sorted, flowsAsc, from, latest.date);
    const years = (latest.date.getTime() - from.getTime()) / (365.25 * 86400e3);
    const annualized = t.twr !== null && years > 0 ? (years >= 1 ? Math.pow(1 + t.twr, 1 / years) - 1 : t.twr) : null;
    return { label: p.label, from, startValue, invested, gain, xirr: r, twr: t.twr, annualized };
  });
  return { id: asset.id, name: asset.name, type: asset.type, value, valueDate: latest?.date ?? null, firstDate: first?.date ?? null, firstValue: first?.value ?? null, flows: flowsAsc, flowsTotal: flowsAsc.reduce((s, f) => s + f.amount, 0), periods };
}

/** Performance of investment assets (brokerage, PPR, crypto) plus the combined portfolio. */
export async function getPerformance(assetIds?: string[]) {
  const assets = await loadAssetsWithSnapshots({ types: ["BROKERAGE", "STOCK_PORTFOLIO", "PPR", "CRYPTO"], assetIds });
  const withData = assets.filter((a) => a.snapshots.length);
  const flows = await flowsByAsset(withData);
  const now = new Date();
  const rows: AssetPerf[] = withData.map((a) => computeAssetPerf(a, a.snapshots, flows.get(a.id) ?? [], now));
  // combined portfolio: carried values summed at every valuation date; an asset joining later counts as an
  // inflow of its first value on that date, and its later flows are kept.
  const combinedSnaps = combineSeries(withData);
  const combinedStart = combinedSnaps[0]?.date;
  const combinedFlows: Flow[] = [];
  for (const r of rows) {
    if (r.firstDate && combinedStart && r.firstDate.getTime() > combinedStart.getTime()) combinedFlows.push({ date: r.firstDate, amount: r.firstValue ?? 0, source: "valor inicial", description: `${r.name}: primeiro registo` });
    for (const f of r.flows) if (r.firstDate && f.date.getTime() > r.firstDate.getTime()) combinedFlows.push(f);
  }
  const combined = combinedSnaps.length ? computeAssetPerf({ id: "all", name: "Todos os investimentos", type: "ALL" }, combinedSnaps, combinedFlows, now) : null;
  return { rows, combined };
}
