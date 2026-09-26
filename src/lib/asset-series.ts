import { prisma } from "./prisma";
import { normalize } from "./categorize";

/** Snapshots and flows of the assets: the base every series in the app is built from. */

export type SnapshotPoint = { date: Date; value: number };

export type Flow = { date: Date; amount: number; source: string; description: string }; // amount > 0 = money into the asset

/** Kinds of an asset's own transactions that are external cash flows (in/out of the asset). */
const FLOW_IN = [/^deposit$/i, /^dep[óo]sito$/i, /^fluxo manual/i, /^transfer[êe]ncia recebida/i];
const FLOW_OUT = [/^withdrawal$/i, /^levantamento$/i, /^resgate$/i, /^transfer[êe]ncia enviada/i];

function isFlowKind(kind: string | null, amount: number): boolean {
  if (!kind) return false;
  if (FLOW_IN.some((r) => r.test(kind))) return true;
  if (FLOW_OUT.some((r) => r.test(kind))) return true;
  void amount;
  return false;
}

/** External cash flows of an asset: its own deposit/withdrawal transactions, or (when it has none)
 *  transfers from current accounts categorised as investment whose description names the asset. */
export async function getAssetFlows(asset: { id: string; name: string; institution: string; type: string }): Promise<Flow[]> {
  const own = await prisma.transaction.findMany({ where: { assetId: asset.id, status: "COMPLETED" }, orderBy: [{ date: "asc" }, { seq: "asc" }], select: { date: true, amount: true, kind: true, description: true } });
  const ownFlows: Flow[] = own.filter((t) => isFlowKind(t.kind, t.amount)).map((t) => ({ date: t.date, amount: t.amount, source: "movimento", description: t.description }));
  if (ownFlows.length) return ownFlows;
  if (asset.type === "CURRENT_ACCOUNT" || asset.type === "CASH") return [];
  // transfers from current accounts (category kind INVESTMENT) mentioning the asset
  const candidates = await prisma.transaction.findMany({
    where: { status: "COMPLETED", asset: { type: "CURRENT_ACCOUNT" }, category: { kind: "INVESTMENT" } },
    orderBy: { date: "asc" },
    select: { date: true, amount: true, description: true, asset: { select: { name: true } } },
  });
  const keys = [asset.institution, asset.name].map(normalize).filter((k) => k.length >= 3);
  return candidates
    .filter((t) => keys.some((k) => normalize(t.description).includes(k)))
    .map((t) => ({ date: t.date, amount: -t.amount, source: `transferência ${t.asset.name}`, description: t.description }));
}

export function valueAt(snapshots: { date: Date; value: number }[], date: Date): number | null {
  let v: number | null = null;
  for (const s of snapshots) {
    if (s.date.getTime() <= date.getTime()) v = s.value;
    else break;
  }
  return v;
}


/** Months from "YYYY-MM" to "YYYY-MM", inclusive. */
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export type AssetWithSnapshots = {
  id: string;
  name: string;
  institution: string;
  type: string;
  snapshots: SnapshotPoint[];
  ownerships?: { memberId: string; percent: number }[];
};

/** Active assets with their snapshots in chronological order. */
export async function loadAssetsWithSnapshots(opts: { types?: string[]; assetId?: string; assetIds?: string[]; memberId?: string; withOwnerships?: boolean } = {}): Promise<AssetWithSnapshots[]> {
  const assets = await prisma.asset.findMany({
    where: {
      active: true,
      ...(opts.types ? { type: { in: opts.types as never } } : {}),
      ...(opts.assetId ? { id: opts.assetId } : opts.assetIds ? { id: { in: opts.assetIds } } : {}),
      ...(opts.memberId ? { ownerships: { some: { memberId: opts.memberId } } } : {}),
    },
    orderBy: { sortOrder: "asc" },
    include: {
      snapshots: { orderBy: { date: "asc" }, select: { date: true, value: true } },
      ...(opts.withOwnerships ? { ownerships: { select: { memberId: true, percent: true } } } : {}),
    },
  });
  return assets as unknown as AssetWithSnapshots[];
}

/** External flows of each asset, in one pass. */
export async function flowsByAsset(assets: { id: string; name: string; institution: string; type: string }[]): Promise<Map<string, Flow[]>> {
  const out = new Map<string, Flow[]>();
  for (const a of assets) out.set(a.id, await getAssetFlows(a));
  return out;
}

/** One series for several assets: every date with a record, each asset carried forward. */
export function combineSeries(assets: { snapshots: SnapshotPoint[] }[]): SnapshotPoint[] {
  const dates = new Set<string>();
  for (const a of assets) for (const s of a.snapshots) dates.add(s.date.toISOString().slice(0, 10));
  return [...dates].sort().map((d) => {
    const date = new Date(d);
    return { date, value: assets.reduce((sum, a) => sum + (valueAt(a.snapshots, date) ?? 0), 0) };
  });
}
