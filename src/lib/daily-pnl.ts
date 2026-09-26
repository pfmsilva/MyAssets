import { flowsByAsset, loadAssetsWithSnapshots, valueAt } from "./asset-series";
import { getLiveValuationsOnce } from "./quotes";

/** Asset types whose value is quoted live (Yahoo). */
export const LIVE_TYPES = ["BROKERAGE", "STOCK_PORTFOLIO", "CRYPTO"] as const;

export type Grouping = "day" | "week" | "month" | "year";

export type DailyPoint = {
  date: string; // YYYY-MM-DD (the last day of the bucket)
  label: string; // how the point is shown on the axis
  value: number; // total of the portfolios at the end of the bucket
  flow: number; // deposits (+) and withdrawals (−) in the bucket
  pnl: number; // value change with the flows taken out
  cumulative: number; // running sum of pnl since the first point shown
  live?: boolean; // includes today's value at the quotes of the moment
};

export type AssetPnl = {
  id: string;
  name: string;
  type: string;
  value: number; // live where there are quotes, last recorded value otherwise
  recorded: number; // last recorded value
  recordedAt: string | null;
  live: boolean; // has live quotes right now
  today: number | null; // day change from the quotes
  pnl: number; // gain in the window, flows taken out
  quoted: number;
  quotable: number;
};

export type DailyPnl = {
  points: DailyPoint[];
  assets: AssetPnl[];
  days: number;
  group: Grouping;
  onlyQuoted: boolean;
  from: string | null;
  totalPnl: number;
  bestDay: DailyPoint | null;
  worstDay: DailyPoint | null;
  positiveDays: number;
  negativeDays: number;
  todayLive: number | null;
  quotesAt: Date | null;
  liveError: string | null;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** ISO week (Monday to Sunday) of a date, as "2026-W39". */
function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - day + 3); // the Thursday of that week decides the year
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / 86400e3 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function bucketOf(dateIso: string, group: Grouping): { key: string; label: string } {
  const d = new Date(dateIso);
  if (group === "week") {
    const key = isoWeek(d);
    return { key, label: `sem. ${key.slice(6)}/${key.slice(2, 4)}` };
  }
  if (group === "month") return { key: dateIso.slice(0, 7), label: `${MONTHS[d.getUTCMonth()]} ${dateIso.slice(2, 4)}` };
  if (group === "year") return { key: dateIso.slice(0, 4), label: dateIso.slice(0, 4) };
  return { key: dateIso, label: `${dateIso.slice(8, 10)}/${dateIso.slice(5, 7)}` };
}

/** Sums the daily points into weeks, months or years (value = the last one of each bucket). */
function groupPoints(points: DailyPoint[], group: Grouping): DailyPoint[] {
  if (group === "day") return points;
  const out: DailyPoint[] = [];
  let cumulative = 0;
  for (const p of points) {
    const { key, label } = bucketOf(p.date, group);
    const last = out.at(-1);
    if (last && bucketOf(last.date, group).key === key) {
      last.date = p.date;
      last.value = p.value;
      last.flow = round(last.flow + p.flow);
      last.pnl = round(last.pnl + p.pnl);
      last.live = last.live || p.live;
    } else {
      out.push({ ...p, label });
    }
    void key;
  }
  for (const p of out) {
    cumulative = round(cumulative + p.pnl);
    p.cumulative = cumulative;
  }
  return out;
}

/**
 * Daily and cumulative gains of the live portfolios: the change in value between consecutive
 * records, with deposits and withdrawals taken out, plus today's value at the quotes of the moment.
 */
export async function getDailyPnl(opts: { assetIds?: string[]; days?: number; assetId?: string; group?: Grouping; onlyQuoted?: boolean } = {}): Promise<DailyPnl> {
  const days = opts.days ?? 90;
  const group: Grouping = opts.group ?? "day";
  const onlyQuoted = !!opts.onlyQuoted;
  const assets = await loadAssetsWithSnapshots({ types: [...LIVE_TYPES], assetIds: opts.assetIds, assetId: opts.assetId });
  const withSnapshots = assets.filter((a) => a.snapshots.length);
  const liveAll = await getLiveValuationsOnce(withSnapshots.map((a) => a.id), { resolve: false });
  // "só as carteiras com cotação" keeps the same set as the live card of the overview
  const withData = onlyQuoted ? withSnapshots.filter((a) => (liveAll.get(a.id)?.quoted ?? 0) > 0) : withSnapshots;
  if (!withData.length) {
    return { points: [], assets: [], days, group, onlyQuoted, from: null, totalPnl: 0, bestDay: null, worstDay: null, positiveDays: 0, negativeDays: 0, todayLive: null, quotesAt: null, liveError: null };
  }

  const today = new Date(iso(new Date()));
  const from = new Date(today.getTime() - days * 86400e3);

  // every date with a record, plus the last one before the window (the starting point of the first change)
  const all = new Set<string>();
  for (const a of withData) for (const s of a.snapshots) all.add(iso(s.date));
  const sorted = [...all].sort();
  const inWindow = sorted.filter((d) => new Date(d).getTime() >= from.getTime());
  const before = sorted.filter((d) => new Date(d).getTime() < from.getTime()).at(-1);
  const dates = (before ? [before, ...inWindow] : inWindow).map((d) => new Date(d));

  const flows = await flowsByAsset(withData);

  const live = liveAll;
  const liveTotal = withData.reduce((s, a) => {
    const l = live.get(a.id);
    return s + (l && l.quoted > 0 ? l.liveTotal : (valueAt(a.snapshots, today) ?? 0));
  }, 0);
  const anyLive = withData.some((a) => (live.get(a.id)?.quoted ?? 0) > 0);
  const quotesAt = [...live.values()].map((l) => l.quotesAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const liveError = [...live.values()].map((l) => l.error).find((e) => !!e) ?? null;

  const valueOn = (date: Date) => withData.reduce((s, a) => s + (valueAt(a.snapshots, date) ?? 0), 0);
  const flowOn = (date: Date) => {
    const d = iso(date);
    let total = 0;
    for (const list of flows.values()) for (const f of list) if (iso(f.date) === d) total += f.amount;
    return total;
  };

  const raw: { date: Date; value: number; flow: number; live?: boolean }[] = dates.map((d) => ({ date: d, value: valueOn(d), flow: flowOn(d) }));
  const lastDate = raw.at(-1)?.date;
  if (anyLive) {
    if (lastDate && iso(lastDate) === iso(today)) raw[raw.length - 1] = { date: today, value: liveTotal, flow: raw[raw.length - 1].flow, live: true };
    else raw.push({ date: today, value: liveTotal, flow: flowOn(today), live: true });
  }

  const points: DailyPoint[] = [];
  let cumulative = 0;
  for (let i = 1; i < raw.length; i++) {
    const prev = raw[i - 1];
    const cur = raw[i];
    const pnl = round(cur.value - prev.value - cur.flow);
    cumulative = round(cumulative + pnl);
    const d = iso(cur.date);
    points.push({ date: d, label: bucketOf(d, "day").label, value: round(cur.value), flow: round(cur.flow), pnl, cumulative, live: cur.live });
  }

  const rows: AssetPnl[] = withData.map((a) => {
    const l = live.get(a.id);
    const start = before ?? inWindow[0];
    const startValue = start ? (valueAt(a.snapshots, new Date(start)) ?? 0) : 0;
    const recorded = valueAt(a.snapshots, today) ?? 0;
    const hasLive = !!l && l.quoted > 0;
    const endValue = hasLive ? l.liveTotal : recorded;
    const windowFlows = (flows.get(a.id) ?? []).filter((f) => f.date.getTime() > new Date(start ?? iso(today)).getTime()).reduce((s, f) => s + f.amount, 0);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      value: round(endValue),
      recorded: round(recorded),
      recordedAt: a.snapshots.at(-1) ? iso(a.snapshots.at(-1)!.date) : null,
      live: hasLive,
      today: hasLive ? round(l.dayChangeEur) : null,
      pnl: round(endValue - startValue - windowFlows),
      quoted: l?.quoted ?? 0,
      quotable: l?.quotable ?? 0,
    };
  });

  // the live point is a partial day (and may cover several days when the last record is old): out of the day records
  const grouped = groupPoints(points, group);
  const withPnl = grouped.filter((p) => p.pnl !== 0 && !p.live);
  return {
    points: grouped,
    assets: rows,
    days,
    group,
    onlyQuoted,
    from: points[0]?.date ?? null,
    totalPnl: grouped.at(-1)?.cumulative ?? 0,
    bestDay: withPnl.length ? withPnl.reduce((b, p) => (p.pnl > b.pnl ? p : b)) : null,
    worstDay: withPnl.length ? withPnl.reduce((b, p) => (p.pnl < b.pnl ? p : b)) : null,
    positiveDays: grouped.filter((p) => p.pnl > 0 && !p.live).length,
    negativeDays: grouped.filter((p) => p.pnl < 0 && !p.live).length,
    todayLive: anyLive ? round(withData.reduce((s, a) => s + (live.get(a.id)?.dayChangeEur ?? 0), 0)) : null,
    quotesAt,
    liveError,
  };
}
