import YahooFinance from "yahoo-finance2";
import { prisma } from "./prisma";

/** Minimal client surface so the logic can run against a fake in tests / offline (QUOTES_MOCK=true). */
export type QuoteResult = {
  symbol: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: Date | number;
  exchange?: string;
  fullExchangeName?: string;
  quoteType?: string;
};
export type SearchResult = { symbol: string; exchange?: string; exchDisp?: string; quoteType?: string; shortname?: string; longname?: string };
export type HistoricalPoint = { date: Date; close: number };
export type QuoteClient = {
  quote(symbols: string[]): Promise<QuoteResult[]>;
  search(query: string): Promise<SearchResult[]>;
  /** Monthly closes between the two dates (used to rebuild portfolio history). */
  historical?(symbol: string, from: Date, to: Date): Promise<HistoricalPoint[]>;
};

export const QUOTE_TTL_MS = 15 * 60 * 1000;
export const yahooUrl = (symbol: string) => `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
export const yahooSearchUrl = (q: string) => `https://finance.yahoo.com/lookup/?s=${encodeURIComponent(q)}`;

let client: QuoteClient | null = null;
export function setQuoteClient(c: QuoteClient) {
  client = c;
}

function realClient(): QuoteClient {
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
  return {
    async quote(symbols) {
      if (!symbols.length) return [];
      const out: QuoteResult[] = [];
      for (let i = 0; i < symbols.length; i += 50) {
        const chunk = symbols.slice(i, i + 50);
        const res = (await yf.quote(chunk, {}, { validateResult: false })) as unknown as QuoteResult[] | QuoteResult;
        out.push(...(Array.isArray(res) ? res : [res]));
      }
      return out;
    },
    async search(query) {
      const r = (await yf.search(query, { quotesCount: 10, newsCount: 0 }, { validateResult: false })) as unknown as { quotes?: SearchResult[] };
      return (r.quotes ?? []).filter((q) => q && typeof q.symbol === "string");
    },
    async historical(symbol, from, to) {
      const r = (await yf.chart(symbol, { period1: from, period2: to, interval: "1mo" }, { validateResult: false })) as unknown as { quotes?: { date: Date | string | number; close: number | null; adjclose?: number | null }[] };
      return (r.quotes ?? [])
        .map((q) => ({ date: q.date instanceof Date ? q.date : new Date(typeof q.date === "number" ? q.date * 1000 : q.date), close: q.close ?? q.adjclose ?? 0 }))
        .filter((q) => q.close > 0 && !Number.isNaN(q.date.getTime()));
    },
  };
}

/** Deterministic fake used when QUOTES_MOCK=true (local development without internet access). */
function mockClient(): QuoteClient {
  const priceFor = (s: string) => {
    let h = 7;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 100003;
    return 10 + (h % 4000) / 10;
  };
  return {
    async quote(symbols) {
      return symbols.map((symbol) => {
        const isFx = symbol.endsWith("=X");
        const crypto = /^[A-Z0-9]{1,15}-(EUR|USD)$/.test(symbol);
        const price = isFx ? (symbol.startsWith("USD") ? 0.92 : symbol.startsWith("GBP") ? 1.17 : 1) : priceFor(symbol);
        const prev = price / (1 + ((priceFor(symbol + "d") % 5) - 2.5) / 100);
        const currency = isFx ? "EUR" : crypto ? symbol.slice(-3) : symbol.endsWith(".L") ? "GBp" : symbol.includes(".") ? "EUR" : "USD";
        return { symbol, shortName: `${symbol} (simulado)`, currency, regularMarketPrice: price, regularMarketPreviousClose: prev, regularMarketChange: price - prev, regularMarketChangePercent: ((price - prev) / prev) * 100, regularMarketTime: new Date(), exchange: crypto ? "CCC" : "SIM", quoteType: crypto ? "CRYPTOCURRENCY" : "ETF" };
      });
    },
    async search(query) {
      if (/-(EUR|USD)$/i.test(query)) return [{ symbol: query.toUpperCase(), exchange: "CCC", exchDisp: "CCC", quoteType: "CRYPTOCURRENCY", shortname: `Simulado ${query}` }];
      return [{ symbol: `${query.slice(0, 4).toUpperCase()}.DE`, exchange: "GER", exchDisp: "XETRA", quoteType: "ETF", shortname: `Simulado ${query}` }];
    },
    async historical(symbol, from, to) {
      const out: HistoricalPoint[] = [];
      const base = priceFor(symbol);
      const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
      let i = 0;
      while (d.getTime() <= to.getTime()) {
        out.push({ date: new Date(d), close: Math.round(base * (0.75 + 0.02 * i) * 100) / 100 });
        d.setUTCMonth(d.getUTCMonth() + 1);
        i++;
      }
      return out;
    },
  };
}

export function quoteClient(): QuoteClient {
  return getClient();
}

function getClient(): QuoteClient {
  if (client) return client;
  client = process.env.QUOTES_MOCK === "true" ? mockClient() : realClient();
  return client;
}

// ---------- symbol resolution ----------

const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}\d$/;
/** XTB ticker suffix -> Yahoo suffix */
const XTB_SUFFIX: Record<string, string> = { DE: ".DE", NL: ".AS", UK: ".L", US: "", FR: ".PA", IT: ".MI", ES: ".MC", PT: ".LS", BE: ".BR", PL: ".WA", CH: ".SW", DK: ".CO", SE: ".ST", NO: ".OL", FI: ".HE", AT: ".VI", IE: ".IR", CZ: ".PR" };
/** Preferred Yahoo exchange codes (euro venues first) */
const EXCHANGE_RANK = ["GER", "FRA", "AMS", "MIL", "PAR", "MCE", "LIS", "BRU", "VIE", "EBS", "LSE", "IOB", "NMS", "NYQ", "NGM", "PCX"];

function rankSearch(quotes: SearchResult[]) {
  const ok = quotes.filter((q) => !q.quoteType || ["ETF", "EQUITY", "MUTUALFUND", "CRYPTOCURRENCY", "INDEX"].includes(q.quoteType));
  return ok.sort((a, b) => {
    const ra = EXCHANGE_RANK.indexOf(a.exchange ?? "");
    const rb = EXCHANGE_RANK.indexOf(b.exchange ?? "");
    return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
  });
}

/** "BTC-EUR", "SHIB-USD": a crypto pair written as Yahoo writes it. */
const CRYPTO_KEY_RE = /^([A-Z0-9]{1,15})-(EUR|USD|USDT|USDC)$/;
const isCryptoQuote = (q: QuoteResult) => q.quoteType === "CRYPTOCURRENCY" || /^[A-Z0-9]{1,15}-(EUR|USD)$/.test(q.symbol);

/** Only accepts quotes that really are cryptocurrencies, so a coin never matches a stock with the same ticker. */
async function pickCryptoCandidate(candidates: string[]): Promise<QuoteResult | undefined> {
  const list = candidates.filter((c, i) => c && candidates.indexOf(c) === i).slice(0, 5);
  if (!list.length) return undefined;
  const quotes = await getClient().quote(list);
  const valid = quotes.filter((q) => q.regularMarketPrice !== undefined && q.regularMarketPrice !== null && isCryptoQuote(q));
  return valid.find((q) => q.currency === "EUR") ?? valid[0];
}

async function pickEurCandidate(candidates: string[]): Promise<QuoteResult | undefined> {
  if (!candidates.length) return undefined;
  const quotes = await getClient().quote(candidates.slice(0, 5));
  const valid = quotes.filter((q) => q.regularMarketPrice !== undefined && q.regularMarketPrice !== null);
  return valid.find((q) => q.currency === "EUR") ?? valid[0];
}

/** Finds the Yahoo symbol for a position key (ISIN or XTB ticker). */
export async function resolveSymbol(key: string, name: string): Promise<{ symbol: string; quote: QuoteResult } | { error: string }> {
  const c = getClient();
  try {
    const crypto = key.toUpperCase().match(CRYPTO_KEY_RE);
    if (crypto) {
      const code = crypto[1];
      // the euro pair first, then the dollar pair (converted with the FX rate)
      const direct = await pickCryptoCandidate([`${code}-EUR`, `${code}-USD`]);
      if (direct) return { symbol: direct.symbol, quote: direct };
      // Yahoo renames coins whose ticker collides (e.g. "S" -> "S32684-USD"): search, but only among cryptocurrencies
      const found = (await c.search(`${code}-EUR`)).concat(await c.search(code)).filter((q) => q.quoteType === "CRYPTOCURRENCY");
      const best = await pickCryptoCandidate(found.map((q) => q.symbol));
      if (best) return { symbol: best.symbol, quote: best };
      return { error: `Sem cotação de criptomoeda no Yahoo para ${code}. Indique o símbolo à mão (ex.: ${code}-EUR).` };
    }
    if (ISIN_RE.test(key)) {
      const found = rankSearch(await c.search(key));
      let best = await pickEurCandidate(found.map((q) => q.symbol));
      if (!best) best = await pickEurCandidate(rankSearch(await c.search(name)).map((q) => q.symbol));
      return best ? { symbol: best.symbol, quote: best } : { error: "Sem resultados no Yahoo para este ISIN/nome." };
    }
    const m = key.match(/^([A-Z0-9.\-]+?)\.([A-Z]{2})$/i);
    if (m && m[2].toUpperCase() in XTB_SUFFIX) {
      const candidate = `${m[1].toUpperCase()}${XTB_SUFFIX[m[2].toUpperCase()]}`;
      const direct = await pickEurCandidate([candidate]);
      if (direct) return { symbol: direct.symbol, quote: direct };
    }
    if (key.includes("-") || /^[A-Z0-9.=\-]+$/.test(key)) {
      const direct = await pickEurCandidate([key]);
      if (direct) return { symbol: direct.symbol, quote: direct };
    }
    const best = await pickEurCandidate(rankSearch(await c.search(name)).map((q) => q.symbol));
    return best ? { symbol: best.symbol, quote: best } : { error: "Sem resultados no Yahoo para este ticker/nome." };
  } catch (e) {
    return { error: e instanceof Error ? e.message.slice(0, 200) : "Erro ao contactar o Yahoo Finance." };
  }
}

// ---------- instruments ----------

export type PositionLike = { name: string; isin: string | null; quantity: number | null };

export function positionKey(p: PositionLike): string | null {
  if (!p.isin || p.quantity === null || p.quantity === undefined) return null;
  const k = p.isin.trim().toUpperCase();
  if (!k || k === "CASH") return null;
  return k;
}

/** Ensures an Instrument row exists for every quotable position and resolves missing symbols (best effort). */
export async function ensureInstruments(positions: PositionLike[], opts: { resolve?: boolean } = { resolve: true }) {
  const keys = new Map<string, string>();
  for (const p of positions) {
    const k = positionKey(p);
    if (k && !keys.has(k)) keys.set(k, p.name);
  }
  if (!keys.size) return [];
  const existing = await prisma.instrument.findMany({ where: { key: { in: [...keys.keys()] } } });
  const byKey = new Map(existing.map((i) => [i.key, i]));
  for (const [key, name] of keys)
    if (!byKey.has(key)) {
      // a crypto pair is a cryptocurrency for the allocation, whatever the coin is called
      const assetClass = CRYPTO_KEY_RE.test(key.toUpperCase()) ? ("CRYPTO" as const) : undefined;
      byKey.set(key, await prisma.instrument.create({ data: { key, name, assetClass } }));
    }
  if (opts.resolve) {
    const retryAfter = Date.now() - 6 * 60 * 60 * 1000;
    for (const inst of byKey.values()) {
      if (inst.symbol || inst.manual) continue;
      if (inst.resolvedAt && inst.resolvedAt.getTime() > retryAfter) continue; // failed recently
      const r = await resolveSymbol(inst.key, inst.name);
      const updated = await prisma.instrument.update({
        where: { id: inst.id },
        data: "symbol" in r ? { symbol: r.symbol, lastError: null, resolvedAt: new Date() } : { lastError: r.error, resolvedAt: new Date() },
      });
      byKey.set(inst.key, updated);
      if ("symbol" in r) await upsertQuotes([r.quote]);
    }
  }
  return [...byKey.values()];
}

// ---------- quotes cache ----------

async function upsertQuotes(quotes: QuoteResult[]) {
  const now = new Date();
  for (const q of quotes) {
    if (q.regularMarketPrice === undefined || q.regularMarketPrice === null) continue;
    const mt = q.regularMarketTime instanceof Date ? q.regularMarketTime : typeof q.regularMarketTime === "number" ? new Date(q.regularMarketTime * (q.regularMarketTime < 1e12 ? 1000 : 1)) : null;
    const data = { price: q.regularMarketPrice, currency: q.currency ?? "EUR", previousClose: q.regularMarketPreviousClose ?? null, change: q.regularMarketChange ?? null, changePercent: q.regularMarketChangePercent ?? null, marketTime: mt, shortName: q.shortName ?? q.longName ?? null, exchange: q.fullExchangeName ?? q.exchange ?? null, fetchedAt: now };
    await prisma.quote.upsert({ where: { symbol: q.symbol }, create: { symbol: q.symbol, ...data }, update: data });
  }
}

export function fxSymbol(currency: string): string | null {
  const c = currency.toUpperCase();
  if (c === "EUR") return null;
  if (c === "GBP" || c === "GBX") return "GBPEUR=X";
  return `${c}EUR=X`;
}

/** Returns cached quotes for the symbols (plus needed FX pairs), refreshing stale ones. Never throws. */
export async function getQuotes(symbols: string[], opts: { force?: boolean } = {}): Promise<{ quotes: Map<string, Awaited<ReturnType<typeof prisma.quote.findMany>>[number]>; error: string | null; refreshed: boolean }> {
  const wanted = [...new Set(symbols.filter(Boolean))];
  let error: string | null = null;
  let refreshed = false;
  const load = async () => new Map((await prisma.quote.findMany({ where: { symbol: { in: wanted } } })).map((q) => [q.symbol, q]));
  let cached = await load();
  const staleBefore = Date.now() - QUOTE_TTL_MS;
  const stale = wanted.filter((s) => opts.force || !cached.has(s) || cached.get(s)!.fetchedAt.getTime() < staleBefore);
  if (stale.length) {
    try {
      const res = await getClient().quote(stale);
      await upsertQuotes(res);
      refreshed = true;
      // FX for non-EUR currencies
      const fx = [...new Set(res.map((q) => fxSymbol(q.currency ?? "EUR")).filter((s): s is string => !!s))];
      const fxMissing = fx.filter((s) => !wanted.includes(s));
      if (fxMissing.length) {
        const fxRes = await getClient().quote(fxMissing);
        await upsertQuotes(fxRes);
      }
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 200) : "Erro ao obter cotações.";
    }
  }
  // always include FX pairs for whatever currencies are cached
  cached = await load();
  const fxNeeded = [...new Set([...cached.values()].map((q) => fxSymbol(q.currency)).filter((s): s is string => !!s))].filter((s) => !cached.has(s));
  if (fxNeeded.length) {
    const fxRows = await prisma.quote.findMany({ where: { symbol: { in: fxNeeded } } });
    const missing = fxNeeded.filter((s) => !fxRows.some((r) => r.symbol === s));
    if (missing.length && !error) {
      try {
        await upsertQuotes(await getClient().quote(missing));
      } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 200) : "Erro ao obter câmbios.";
      }
    }
    for (const r of await prisma.quote.findMany({ where: { symbol: { in: fxNeeded } } })) cached.set(r.symbol, r);
  }
  return { quotes: cached, error, refreshed };
}

// ---------- live valuation ----------

export type LivePosition = {
  id: string;
  name: string;
  key: string | null;
  symbol: string | null;
  yahooUrl: string | null;
  quantity: number | null;
  snapshotPrice: number | null;
  snapshotValueEur: number;
  avgPrice: number | null;
  costEur: number | null;
  pnlEur: number | null; // vs. live value when available, else snapshot value
  pnlPct: number | null;
  livePrice: number | null;
  liveCurrency: string | null;
  liveValueEur: number | null;
  dayChangePct: number | null;
  dayChangeEur: number | null;
  quoteTime: Date | null;
  error: string | null;
};

export type LiveValuation = {
  assetId: string;
  snapshotDate: Date;
  snapshotTotal: number;
  liveTotal: number; // live where available, snapshot value otherwise
  delta: number;
  deltaPct: number | null;
  dayChangeEur: number;
  dayChangePct: number | null;
  quoted: number;
  quotable: number;
  costTotal: number | null; // sum of known acquisition costs
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  quotesAt: Date | null;
  error: string | null;
  positions: LivePosition[];
};

/** Converts a quoted price to EUR using the cached FX pairs (Yahoo quotes LSE prices in pence). */
export function toEur(price: number, currency: string, quotes: Map<string, { price: number }>): number | null {
  const c = currency.toUpperCase();
  if (c === "EUR") return price;
  const base = c === "GBP" || c === "GBX" ? price / 100 : price; // Yahoo returns LSE prices in pence (GBp)
  const fx = fxSymbol(c);
  const rate = fx ? quotes.get(fx)?.price : undefined;
  if (c === "GBP" && currency !== "GBp" && currency !== "GBX") return rate ? price * rate : null; // real GBP (rare)
  return rate ? base * rate : null;
}

/** Live valuation of the latest snapshot of each asset (brokerage/crypto). */
export async function getLiveValuations(assetIds: string[], opts: { force?: boolean; resolve?: boolean } = {}): Promise<Map<string, LiveValuation>> {
  const out = new Map<string, LiveValuation>();
  if (!assetIds.length) return out;
  const snaps = await prisma.snapshot.findMany({
    where: { assetId: { in: assetIds }, positions: { some: {} } },
    orderBy: { date: "desc" },
    include: { positions: true },
  });
  const latest = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) if (!latest.has(s.assetId)) latest.set(s.assetId, s);
  const allPositions = [...latest.values()].flatMap((s) => s.positions);
  const instruments = await ensureInstruments(allPositions, { resolve: opts.resolve ?? true });
  const instByKey = new Map(instruments.map((i) => [i.key, i]));
  const symbols = instruments.map((i) => i.symbol).filter((s): s is string => !!s);
  const { quotes, error } = await getQuotes(symbols, { force: opts.force });
  for (const [assetId, snap] of latest) {
    const positions: LivePosition[] = snap.positions.map((p) => {
      const key = positionKey(p);
      const inst = key ? instByKey.get(key) : undefined;
      const q = inst?.symbol ? quotes.get(inst.symbol) : undefined;
      let liveValueEur: number | null = null;
      let dayChangeEur: number | null = null;
      if (q && p.quantity !== null) {
        const priceEur = toEur(q.price, q.currency, quotes);
        if (priceEur !== null) {
          liveValueEur = p.quantity * priceEur;
          if (q.previousClose) {
            const prevEur = toEur(q.previousClose, q.currency, quotes);
            if (prevEur !== null) dayChangeEur = p.quantity * (priceEur - prevEur);
          }
        }
      }
      const valueForPnl = liveValueEur ?? p.valueEur;
      const pnlEur = p.costEur !== null && p.costEur !== undefined ? valueForPnl - p.costEur : null;
      return {
        id: p.id,
        name: p.name,
        key,
        symbol: inst?.symbol ?? null,
        yahooUrl: inst?.symbol ? yahooUrl(inst.symbol) : null,
        quantity: p.quantity,
        snapshotPrice: p.price,
        snapshotValueEur: p.valueEur,
        avgPrice: p.avgPrice ?? null,
        costEur: p.costEur ?? null,
        pnlEur,
        pnlPct: pnlEur !== null && p.costEur ? pnlEur / p.costEur : null,
        livePrice: q?.price ?? null,
        liveCurrency: q?.currency ?? null,
        liveValueEur,
        dayChangePct: q?.changePercent ?? null,
        dayChangeEur,
        quoteTime: q?.marketTime ?? q?.fetchedAt ?? null,
        error: inst?.lastError ?? null,
      };
    });
    const snapshotTotal = snap.value;
    const liveTotal = positions.reduce((s, p) => s + (p.liveValueEur ?? p.snapshotValueEur), 0);
    const dayChangeEur = positions.reduce((s, p) => s + (p.dayChangeEur ?? 0), 0);
    const quotable = positions.filter((p) => p.key).length;
    const quoted = positions.filter((p) => p.liveValueEur !== null).length;
    const quotedLive = positions.filter((p) => p.liveValueEur !== null).reduce((s, p) => s + p.liveValueEur!, 0);
    const times = positions.map((p) => p.quoteTime).filter((t): t is Date => !!t);
    const withCost = positions.filter((p) => p.costEur !== null);
    const costTotal = withCost.length ? withCost.reduce((s, p) => s + p.costEur!, 0) : null;
    const unrealizedPnl = withCost.length ? withCost.reduce((s, p) => s + (p.pnlEur ?? 0), 0) : null;
    out.set(assetId, {
      assetId,
      snapshotDate: snap.date,
      snapshotTotal,
      liveTotal,
      delta: liveTotal - snapshotTotal,
      deltaPct: snapshotTotal ? (liveTotal - snapshotTotal) / snapshotTotal : null,
      dayChangeEur,
      dayChangePct: quotedLive ? dayChangeEur / (quotedLive - dayChangeEur) : null,
      quoted,
      quotable,
      costTotal,
      unrealizedPnl,
      unrealizedPnlPct: unrealizedPnl !== null && costTotal ? unrealizedPnl / costTotal : null,
      quotesAt: times.length ? new Date(Math.min(...times.map((t) => t.getTime()))) : null,
      error,
      positions,
    });
  }
  return out;
}
