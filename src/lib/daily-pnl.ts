import { prisma } from "./prisma";
import { getAssetFlows, valueAt, type Flow } from "./performance";
import { getLiveValuations } from "./quotes";

/** Asset types whose value is quoted live (Yahoo). */
export const LIVE_TYPES = ["BROKERAGE", "STOCK_PORTFOLIO", "CRYPTO"] as const;

export type DailyPoint = {
  date: string; // YYYY-MM-DD
  value: number; // total of the portfolios on that date
  flow: number; // deposits (+) and withdrawals (−) on that date
  pnl: number; // value change with the flows taken out
  cumulative: number; // running sum of pnl since the first point shown
  live?: boolean; // the last point, valued at the quotes of the moment
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

/**
 * Daily and cumulative gains of the live portfolios: the change in value between consecutive
 * records, with deposits and withdrawals taken out, plus today's value at the quotes of the moment.
 */
export async function getDailyPnl(opts: { assetIds?: string[]; days?: number; assetId?: string } = {}): Promise<DailyPnl> {
  const days = opts.days ?? 90;
  const assets = await prisma.asset.findMany({
    where: {
      active: true,
      type: { in: [...LIVE_TYPES] },
      ...(opts.assetIds ? { id: { in: opts.assetIds } } : {}),
      ...(opts.assetId ? { id: opts.assetId } : {}),
    },
    orderBy: { sortOrder: "asc" },
    include: { snapshots: { orderBy: { date: "asc" }, select: { date: true, value: true } } },
  });
  const withData = assets.filter((a) => a.snapshots.length);
  if (!withData.length) {
    return { points: [], assets: [], days, from: null, totalPnl: 0, bestDay: null, worstDay: null, positiveDays: 0, negativeDays: 0, todayLive: null, quotesAt: null, liveError: null };
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

  const flowsByAsset = new Map<string, Flow[]>();
  for (const a of withData) flowsByAsset.set(a.id, await getAssetFlows(a));

  const live = await getLiveValuations(withData.map((a) => a.id), { resolve: false });
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
    for (const list of flowsByAsset.values()) for (const f of list) if (iso(f.date) === d) total += f.amount;
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
    points.push({ date: iso(cur.date), value: round(cur.value), flow: round(cur.flow), pnl, cumulative, live: cur.live });
  }

  const rows: AssetPnl[] = withData.map((a) => {
    const l = live.get(a.id);
    const start = before ?? inWindow[0];
    const startValue = start ? (valueAt(a.snapshots, new Date(start)) ?? 0) : 0;
    const recorded = valueAt(a.snapshots, today) ?? 0;
    const hasLive = !!l && l.quoted > 0;
    const endValue = hasLive ? l.liveTotal : recorded;
    const windowFlows = (flowsByAsset.get(a.id) ?? []).filter((f) => f.date.getTime() > new Date(start ?? iso(today)).getTime()).reduce((s, f) => s + f.amount, 0);
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
  const withPnl = points.filter((p) => p.pnl !== 0 && !p.live);
  return {
    points,
    assets: rows,
    days,
    from: points[0]?.date ?? null,
    totalPnl: points.at(-1)?.cumulative ?? 0,
    bestDay: withPnl.length ? withPnl.reduce((b, p) => (p.pnl > b.pnl ? p : b)) : null,
    worstDay: withPnl.length ? withPnl.reduce((b, p) => (p.pnl < b.pnl ? p : b)) : null,
    positiveDays: points.filter((p) => p.pnl > 0 && !p.live).length,
    negativeDays: points.filter((p) => p.pnl < 0 && !p.live).length,
    todayLive: anyLive ? round(withData.reduce((s, a) => s + (live.get(a.id)?.dayChangeEur ?? 0), 0)) : null,
    quotesAt,
    liveError,
  };
}
