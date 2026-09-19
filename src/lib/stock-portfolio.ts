import { prisma } from "./prisma";
import { ensureInstruments, fxSymbol, getQuotes, quoteClient, resolveSymbol, toEur, yahooUrl } from "./quotes";

export type TradeInput = { id?: string; date: Date; quantity: number; amount: number; fee?: number };

export type HoldingState = {
  quantity: number;
  costEur: number; // remaining acquisition cost of the shares still held
  avgPrice: number | null; // costEur / quantity
  realizedEur: number; // gains/losses already realised on sales
  invested: number; // total paid on purchases (fees included)
  proceeds: number; // total received on sales (fees deducted)
  firstTrade: Date | null;
  lastTrade: Date | null;
  warning: string | null;
};

/**
 * Average-cost bookkeeping for one holding. Purchases have quantity > 0 and `amount` is what was paid;
 * sales have quantity < 0 and `amount` is what was received. Fees always increase the cost of a purchase
 * and reduce the proceeds of a sale.
 */
export function computeHolding(trades: TradeInput[]): HoldingState {
  const sorted = [...trades].sort((a, b) => a.date.getTime() - b.date.getTime());
  let quantity = 0;
  let costEur = 0;
  let realizedEur = 0;
  let invested = 0;
  let proceeds = 0;
  let warning: string | null = null;
  for (const t of sorted) {
    const fee = t.fee ?? 0;
    if (t.quantity > 0) {
      quantity += t.quantity;
      costEur += t.amount + fee;
      invested += t.amount + fee;
    } else if (t.quantity < 0) {
      const asked = Math.abs(t.quantity);
      const sold = Math.min(asked, quantity);
      if (asked - sold > 1e-9) warning = "Há vendas de mais ações do que as registadas como compradas; o excesso foi ignorado.";
      const avg = quantity > 0 ? costEur / quantity : 0;
      const costOut = avg * sold;
      const net = t.amount - fee;
      const netForSold = asked > 0 ? (net * sold) / asked : 0;
      realizedEur += netForSold - costOut;
      proceeds += net;
      costEur -= costOut;
      quantity -= sold;
    }
  }
  if (quantity < 1e-9) {
    quantity = 0;
    costEur = 0;
  }
  return {
    quantity: Math.round(quantity * 1e6) / 1e6,
    costEur: Math.round(costEur * 100) / 100,
    avgPrice: quantity > 0 ? Math.round((costEur / quantity) * 1e4) / 1e4 : null,
    realizedEur: Math.round(realizedEur * 100) / 100,
    invested: Math.round(invested * 100) / 100,
    proceeds: Math.round(proceeds * 100) / 100,
    firstTrade: sorted[0]?.date ?? null,
    lastTrade: sorted[sorted.length - 1]?.date ?? null,
    warning,
  };
}

/** Shares held on a given date (used to rebuild history). */
export function quantityAt(trades: TradeInput[], date: Date): number {
  return computeHolding(trades.filter((t) => t.date.getTime() <= date.getTime())).quantity;
}

export type HoldingRow = {
  id: string;
  isin: string;
  name: string;
  note: string | null;
  symbol: string | null; // Yahoo symbol actually used
  manualSymbol: boolean;
  yahooUrl: string | null;
  quoteError: string | null;
  state: HoldingState;
  livePrice: number | null;
  liveCurrency: string | null;
  livePriceEur: number | null;
  liveValueEur: number | null;
  dayChangePct: number | null;
  dayChangeEur: number | null;
  quoteTime: Date | null;
  valueEur: number; // live value when quoted, cost otherwise
  pnlEur: number | null;
  pnlPct: number | null;
  trades: { id: string; date: Date; quantity: number; amount: number; fee: number; note: string | null }[];
};

export type PortfolioView = {
  assetId: string;
  holdings: HoldingRow[];
  totals: {
    value: number;
    cost: number;
    pnl: number;
    pnlPct: number | null;
    realized: number;
    invested: number;
    proceeds: number;
    dayChangeEur: number;
    dayChangePct: number | null;
    quoted: number;
    quotable: number;
  };
  quotesAt: Date | null;
  error: string | null;
};

/** Current state of a manual stock portfolio, with live Yahoo prices where available. */
export async function getPortfolio(assetId: string, opts: { force?: boolean; resolve?: boolean } = {}): Promise<PortfolioView> {
  const holdings = await prisma.holding.findMany({
    where: { assetId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { trades: { orderBy: { date: "asc" } } },
  });
  // resolve ISIN -> Yahoo symbol for holdings without an explicit symbol
  const needResolve = holdings.filter((h) => !h.symbol);
  const instruments = await ensureInstruments(
    needResolve.map((h) => ({ name: h.name, isin: h.isin, quantity: 1 })),
    { resolve: opts.resolve ?? true },
  );
  const instByKey = new Map(instruments.map((i) => [i.key.toUpperCase(), i]));
  const symbolOf = (h: (typeof holdings)[number]) => h.symbol ?? instByKey.get(h.isin.toUpperCase())?.symbol ?? null;
  const symbols = holdings.map(symbolOf).filter((s): s is string => !!s);
  const { quotes, error } = await getQuotes(symbols, { force: opts.force });

  const rows: HoldingRow[] = holdings.map((h) => {
    const state = computeHolding(h.trades);
    const symbol = symbolOf(h);
    const q = symbol ? quotes.get(symbol) : undefined;
    const priceEur = q ? toEur(q.price, q.currency, quotes) : null;
    const liveValueEur = priceEur !== null && state.quantity > 0 ? Math.round(state.quantity * priceEur * 100) / 100 : null;
    let dayChangeEur: number | null = null;
    if (q?.previousClose && state.quantity > 0) {
      const prevEur = toEur(q.previousClose, q.currency, quotes);
      if (prevEur !== null && priceEur !== null) dayChangeEur = Math.round(state.quantity * (priceEur - prevEur) * 100) / 100;
    }
    const valueEur = liveValueEur ?? state.costEur;
    const pnlEur = state.quantity > 0 ? Math.round((valueEur - state.costEur) * 100) / 100 : null;
    return {
      id: h.id,
      isin: h.isin,
      name: h.name,
      note: h.note,
      symbol,
      manualSymbol: !!h.symbol,
      yahooUrl: symbol ? yahooUrl(symbol) : null,
      quoteError: symbol ? null : (instByKey.get(h.isin.toUpperCase())?.lastError ?? "Sem símbolo Yahoo para este ISIN."),
      state,
      livePrice: q?.price ?? null,
      liveCurrency: q?.currency ?? null,
      livePriceEur: priceEur,
      liveValueEur,
      dayChangePct: q?.changePercent ?? null,
      dayChangeEur,
      quoteTime: q?.marketTime ?? q?.fetchedAt ?? null,
      valueEur,
      pnlEur,
      pnlPct: pnlEur !== null && state.costEur ? pnlEur / state.costEur : null,
      trades: h.trades.map((t) => ({ id: t.id, date: t.date, quantity: t.quantity, amount: t.amount, fee: t.fee, note: t.note })),
    };
  });

  const open = rows.filter((r) => r.state.quantity > 0);
  const value = Math.round(rows.reduce((s, r) => s + (r.state.quantity > 0 ? r.valueEur : 0), 0) * 100) / 100;
  const cost = Math.round(open.reduce((s, r) => s + r.state.costEur, 0) * 100) / 100;
  const dayChangeEur = Math.round(rows.reduce((s, r) => s + (r.dayChangeEur ?? 0), 0) * 100) / 100;
  const quotedValue = open.filter((r) => r.liveValueEur !== null).reduce((s, r) => s + r.liveValueEur!, 0);
  const times = rows.map((r) => r.quoteTime).filter((t): t is Date => !!t);
  return {
    assetId,
    holdings: rows,
    totals: {
      value,
      cost,
      pnl: Math.round((value - cost) * 100) / 100,
      pnlPct: cost ? (value - cost) / cost : null,
      realized: Math.round(rows.reduce((s, r) => s + r.state.realizedEur, 0) * 100) / 100,
      invested: Math.round(rows.reduce((s, r) => s + r.state.invested, 0) * 100) / 100,
      proceeds: Math.round(rows.reduce((s, r) => s + r.state.proceeds, 0) * 100) / 100,
      dayChangeEur,
      dayChangePct: quotedValue && quotedValue - dayChangeEur !== 0 ? dayChangeEur / (quotedValue - dayChangeEur) : null,
      quoted: open.filter((r) => r.liveValueEur !== null).length,
      quotable: open.length,
    },
    quotesAt: times.length ? new Date(Math.min(...times.map((t) => t.getTime()))) : null,
    error,
  };
}

/** Writes today's value of the portfolio as a snapshot with one position per holding. */
export async function syncPortfolioSnapshot(assetId: string, opts: { force?: boolean } = {}) {
  const view = await getPortfolio(assetId, { force: opts.force });
  const open = view.holdings.filter((h) => h.state.quantity > 0);
  const today = new Date(new Date().toISOString().slice(0, 10));
  const existing = await prisma.snapshot.findUnique({ where: { assetId_date: { assetId, date: today } } });
  if (existing && existing.source === "MANUAL") return { ...view, snapshot: null, skipped: "Já existe um valor manual registado hoje." };
  const snap = await prisma.snapshot.upsert({
    where: { assetId_date: { assetId, date: today } },
    create: { assetId, date: today, value: view.totals.value, source: "DERIVED", note: "Carteira de ações (cotações Yahoo)" },
    update: { value: view.totals.value, source: "DERIVED", note: "Carteira de ações (cotações Yahoo)" },
  });
  await prisma.position.deleteMany({ where: { snapshotId: snap.id } });
  if (open.length) {
    await prisma.position.createMany({
      data: open.map((h) => ({
        snapshotId: snap.id,
        name: h.name,
        isin: h.isin,
        quantity: h.state.quantity,
        price: h.livePrice ?? h.state.avgPrice,
        currency: h.liveCurrency ?? "EUR",
        value: h.livePrice !== null ? Math.round(h.state.quantity * h.livePrice * 100) / 100 : h.state.costEur,
        valueEur: h.valueEur,
        avgPrice: h.state.avgPrice,
        costEur: h.state.costEur,
      })),
    });
  }
  return { ...view, snapshot: snap, skipped: null };
}

/** Month-end history from Yahoo monthly closes and the shares held at each month end. */
export async function rebuildPortfolioHistory(assetId: string): Promise<{ months: number; written: number; skipped: string[] }> {
  const view = await getPortfolio(assetId, { resolve: true });
  const client = quoteClient();
  const skipped: string[] = [];
  if (!client.historical) return { months: 0, written: 0, skipped: ["Cotações históricas não disponíveis."] };
  const first = view.holdings.map((h) => h.state.firstTrade).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0];
  if (!first) return { months: 0, written: 0, skipped: ["Sem compras registadas."] };
  const from = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  // monthly closes per holding, converted to EUR with the current FX rate (approximation for past months)
  const { quotes } = await getQuotes(view.holdings.map((h) => h.symbol).filter((s): s is string => !!s));
  const series = new Map<string, Map<string, number>>(); // holdingId -> "YYYY-MM" -> price in EUR
  for (const h of view.holdings) {
    if (!h.symbol) {
      skipped.push(`${h.name}: sem símbolo Yahoo`);
      continue;
    }
    try {
      const points = await client.historical(h.symbol, from, to);
      const currency = h.liveCurrency ?? quotes.get(h.symbol)?.currency ?? "EUR";
      const m = new Map<string, number>();
      for (const p of points) {
        const eur = toEur(p.close, currency, quotes);
        if (eur !== null) m.set(p.date.toISOString().slice(0, 7), eur);
      }
      series.set(h.id, m);
    } catch (e) {
      skipped.push(`${h.name}: ${e instanceof Error ? e.message.slice(0, 80) : "erro"}`);
    }
  }

  // one snapshot per month end, valuing the shares held at that date
  const months: string[] = [];
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  const todayIso = new Date().toISOString().slice(0, 10);
  let written = 0;
  for (const month of months) {
    const [y, m] = month.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(y, m, 0));
    const date = monthEnd.toISOString().slice(0, 10) > todayIso ? new Date(todayIso) : monthEnd;
    let value = 0;
    let priced = false;
    for (const h of view.holdings) {
      const qty = quantityAt(h.trades, date);
      if (qty <= 0) continue;
      const price = series.get(h.id)?.get(month);
      if (price !== undefined) {
        value += qty * price;
        priced = true;
      } else {
        const st = computeHolding(h.trades.filter((t) => t.date.getTime() <= date.getTime()));
        value += st.costEur;
      }
    }
    if (!priced && value === 0) continue;
    const existing = await prisma.snapshot.findUnique({ where: { assetId_date: { assetId, date } } });
    if (existing && existing.source !== "DERIVED") continue;
    await prisma.snapshot.upsert({
      where: { assetId_date: { assetId, date } },
      create: { assetId, date, value: Math.round(value * 100) / 100, source: "DERIVED", note: "Histórico reconstruído (cotações Yahoo)" },
      update: { value: Math.round(value * 100) / 100, note: "Histórico reconstruído (cotações Yahoo)" },
    });
    written++;
  }
  await syncPortfolioSnapshot(assetId);
  return { months: months.length, written, skipped };
}

/** Looks up the Yahoo symbol for an ISIN (used when adding a stock). */
export async function lookupIsin(isin: string, name: string) {
  const r = await resolveSymbol(isin.trim().toUpperCase(), name);
  if ("symbol" in r) return { symbol: r.symbol, name: r.quote.shortName ?? r.quote.longName ?? name, currency: r.quote.currency ?? "EUR", price: r.quote.regularMarketPrice ?? null };
  return { error: r.error };
}

export const fxNote = (currency: string) => (currency.toUpperCase() === "EUR" ? null : `Convertido de ${currency} com o câmbio ${fxSymbol(currency)}.`);
