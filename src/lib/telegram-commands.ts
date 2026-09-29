import { Role } from "@prisma/client";
import { getScope } from "./scope";
import { getPerformance } from "./performance";
import { getLiveValuations, resolveSymbol, type LivePosition, type LiveValuation } from "./quotes";
import { getDailyPnl, LIVE_TYPES, type Grouping } from "./daily-pnl";
import { getBudgetOverview } from "./budget";
import { summaryChartsPng } from "./chart-png";
import { appUrl } from "./email";
import { escHtml } from "./telegram";
import { fmtEur, fmtNum, fmtPct } from "./format";

/** What a command answers: a text message, or an image with a caption. */
export type Reply = { html: string; png?: undefined; button?: { text: string; url: string } } | { png: Buffer; html: string; button?: undefined };

type Who = { id: string; role: Role };

const signed = (v: number, digits = 0) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${fmtEur(Math.abs(v), digits)}`;
const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${fmtPct(Math.abs(v))}`;
const dot = (v: number | null | undefined) => (v == null || Math.abs(v) < 0.005 ? "⚪" : v > 0 ? "🟢" : "🔴");
/** Letters and digits only, no accents: "Trading 212" → "trading212", "BTC-EUR" → "btceur". */
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
/** Tappable command for a name: Telegram only links /commands made of letters, digits and "_". */
const cmdFor = (cmd: string, name: string) => `/${cmd}_${norm(name).slice(0, 28)}`;
const hhmm = (d: Date | null) => (d ? d.toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" }) : null);
const priceFmt = (v: number, currency: string) => `${fmtNum(v, v >= 100 ? 2 : 4)} ${currency === "EUR" ? "€" : currency}`;

/** The investment portfolios the user can see, with the live figures where there are quotes. */
async function portfolios(user: Who) {
  const scope = await getScope(user);
  const { rows } = await getPerformance(scope.assetIds);
  const live = await getLiveValuations(
    rows.filter((r) => (LIVE_TYPES as readonly string[]).includes(r.type)).map((r) => r.id),
    { resolve: false },
  );
  return rows.map((r) => {
    const l = live.get(r.id);
    const hasLive = !!l && l.quoted > 0;
    const since = r.periods.at(-1);
    return {
      id: r.id,
      name: r.name,
      value: hasLive ? l.liveTotal : r.value,
      today: hasLive ? l.dayChangeEur : null,
      todayPct: hasLive ? l.dayChangePct : null,
      // gain since the first record, moved to the quotes of the moment
      gain: since?.gain != null ? since.gain + (hasLive ? l.delta : 0) : null,
      twr: since?.twr ?? null,
      live: hasLive ? l : null,
    };
  });
}

// ---------- /carteira ----------

export async function carteiraReply(user: Who, arg: string, showTotals: boolean): Promise<Reply> {
  const list = await portfolios(user);
  if (!list.length) return { html: "Não há carteiras de investimento visíveis para a sua conta." };
  const q = norm(arg);
  const matches = q ? list.filter((p) => norm(p.name) === q).concat(list.filter((p) => norm(p.name) !== q && norm(p.name).includes(q))) : [];

  if (!q || matches.length !== 1) {
    const head = q && !matches.length ? `Não encontrei a carteira «${escHtml(arg)}».\n\n` : "";
    const shown = matches.length > 1 ? matches : list;
    const lines = shown.map((p) =>
      [
        `${dot(p.today)} <b>${escHtml(p.name)}</b>${showTotals ? ` · ${fmtEur(p.value, 0)}` : ""}`,
        `   hoje ${p.today != null ? signed(p.today) : "—"} · desde o início ${p.gain != null ? signed(p.gain) : "—"}`,
        `   ${cmdFor("carteira", p.name)}`,
      ].join("\n"),
    );
    const totalToday = list.reduce((s, p) => s + (p.today ?? 0), 0);
    const totalGain = list.reduce((s, p) => s + (p.gain ?? 0), 0);
    return {
      html: `${head}<b>Carteiras</b>\n\n${lines.join("\n\n")}\n\nTotal: hoje <b>${signed(totalToday)}</b> · desde o início <b>${signed(totalGain)}</b>${showTotals ? ` · valor ${fmtEur(list.reduce((s, p) => s + p.value, 0), 0)}` : ""}\n<i>Toque num comando para ver as posições.</i>`,
    };
  }

  const p = matches[0];
  const l = p.live;
  const lines = [
    `<b>${escHtml(p.name)}</b>`,
    showTotals ? `Valor${l ? " em direto" : ""}: <b>${fmtEur(p.value, 0)}</b>` : null,
    `Hoje: <b>${p.today != null ? signed(p.today) : "—"}</b>${p.todayPct != null ? ` (${signedPct(p.todayPct)})` : ""}`,
    `Desde o início: <b>${p.gain != null ? signed(p.gain) : "—"}</b>${p.twr != null ? ` · TWR ${signedPct(p.twr)}` : ""}`,
    l?.unrealizedPnl != null ? `Mais-valia latente: ${signed(l.unrealizedPnl)}${l.unrealizedPnlPct != null ? ` (${signedPct(l.unrealizedPnlPct)})` : ""}` : null,
  ];
  if (l) {
    // without totals, a line with no quote and no gain (cash) would say nothing
    const positions = [...l.positions].filter((x) => (x.liveValueEur ?? x.snapshotValueEur) > 0.5 && (showTotals || x.dayChangeEur != null || x.pnlEur != null)).sort((a, b) => (b.liveValueEur ?? b.snapshotValueEur) - (a.liveValueEur ?? a.snapshotValueEur));
    const top = positions.slice(0, 20);
    lines.push("", `<b>Posições</b> (${positions.length})`);
    for (const x of top) lines.push(positionLine(x, showTotals));
    if (positions.length > top.length) lines.push(`… e mais ${positions.length - top.length}.`);
    if (l.quotesAt) lines.push("", `<i>cotações das ${hhmm(l.quotesAt)} · ${l.quoted} de ${l.quotable} posições com cotação</i>`);
  } else lines.push("", "<i>Sem cotações em direto: valores do último registo.</i>");
  return { html: lines.filter((x) => x !== null).join("\n"), button: appUrl() ? { text: "Abrir a carteira", url: `${appUrl()}/ativos/${p.id}` } : undefined };
}

/** Long fund names cut at a word, so a line fits a phone. */
const short = (name: string, max = 34) => (name.length <= max ? name : `${name.slice(0, max).replace(/\s+\S*$/, "")}…`);

function positionLine(x: LivePosition, showTotals: boolean) {
  const parts = [
    `${dot(x.dayChangeEur)} ${escHtml(short(x.name))}`,
    x.dayChangePct != null ? signedPct(x.dayChangePct / 100) : null,
    x.dayChangeEur != null ? `hoje ${signed(x.dayChangeEur)}` : null,
    x.pnlEur != null ? `ganho ${signed(x.pnlEur)}${x.pnlPct != null ? ` (${signedPct(x.pnlPct)})` : ""}` : null,
    showTotals ? fmtEur(x.liveValueEur ?? x.snapshotValueEur, 0) : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

// ---------- /ativo ----------

export async function ativoReply(user: Who, arg: string, showTotals: boolean): Promise<Reply> {
  const q = norm(arg);
  if (!q) return { html: "Indique o ativo: por exemplo <code>/ativo AAPL</code>, <code>/ativo apple</code>, <code>/ativo BTC</code> ou um ISIN." };
  const list = await portfolios(user);
  const held: { portfolio: string; pos: LivePosition; live: LiveValuation }[] = [];
  for (const p of list) for (const pos of p.live?.positions ?? []) held.push({ portfolio: p.name, pos, live: p.live! });
  // exact symbol / ISIN / code first, then the name
  const code = (pos: LivePosition) => [pos.symbol, pos.key, pos.symbol?.split(/[-.]/)[0], pos.key?.split(/[-.]/)[0]].filter(Boolean).map((s) => norm(s!));
  let found = held.filter((h) => code(h.pos).includes(q));
  if (!found.length) found = held.filter((h) => norm(h.pos.name).includes(q) || code(h.pos).some((c) => c.startsWith(q)));

  // a ticker the positions do not carry (e.g. MSFT for a position known by ISIN): ask Yahoo what it is and look again by name
  const resolved = found.length ? null : await resolveSymbol(arg.trim().toUpperCase(), arg.trim());
  if (resolved && !("error" in resolved)) {
    const word = norm((resolved.quote.longName ?? resolved.quote.shortName ?? "").split(/\s+/)[0] ?? "");
    found = held.filter((h) => h.pos.symbol === resolved.symbol || (word.length >= 4 && norm(h.pos.name).includes(word)));
  }

  if (found.length) {
    const bySymbol = new Map<string, typeof found>();
    for (const h of found) bySymbol.set(h.pos.symbol ?? h.pos.key ?? h.pos.name, [...(bySymbol.get(h.pos.symbol ?? h.pos.key ?? h.pos.name) ?? []), h]);
    if (bySymbol.size > 1) {
      const options = [...bySymbol.entries()].slice(0, 10).map(([sym, hs]) => `• ${escHtml(hs[0].pos.name)} (${escHtml(sym)}) · ${cmdFor("ativo", sym)}`);
      return { html: `Encontrei vários ativos com «${escHtml(arg)}»:\n${options.join("\n")}` };
    }
    const hs = [...bySymbol.values()][0];
    const x = hs[0].pos;
    const lines = [
      `<b>${escHtml(x.name)}</b>${x.symbol ? ` · ${escHtml(x.symbol)}` : ""}`,
      x.livePrice != null && x.liveCurrency ? `Cotação: <b>${priceFmt(x.livePrice, x.liveCurrency)}</b>${x.dayChangePct != null ? ` (${signedPct(x.dayChangePct / 100)} hoje)` : ""}` : "Sem cotação em direto.",
      x.quoteTime ? `<i>${x.quoteTime.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</i>` : null,
      "",
    ];
    let today = 0;
    let gain = 0;
    let value = 0;
    for (const h of hs) {
      const p = h.pos;
      today += p.dayChangeEur ?? 0;
      gain += p.pnlEur ?? 0;
      value += p.liveValueEur ?? p.snapshotValueEur;
      lines.push(
        `${dot(p.dayChangeEur)} <b>${escHtml(h.portfolio)}</b>${showTotals && p.quantity != null ? ` · ${fmtNum(p.quantity, 6)} un. · ${fmtEur(p.liveValueEur ?? p.snapshotValueEur, 0)}` : ""}`,
        `   hoje ${p.dayChangeEur != null ? signed(p.dayChangeEur) : "—"} · ganho ${p.pnlEur != null ? `${signed(p.pnlEur)}${p.pnlPct != null ? ` (${signedPct(p.pnlPct)})` : ""}` : "—"}${p.avgPrice != null && showTotals ? ` · preço médio ${fmtNum(p.avgPrice, 4)}` : ""}`,
      );
    }
    if (hs.length > 1) lines.push("", `Total: hoje <b>${signed(today)}</b> · ganho <b>${signed(gain)}</b>${showTotals ? ` · ${fmtEur(value, 0)}` : ""}`);
    return { html: lines.filter((l) => l !== null).join("\n") };
  }

  // not in any portfolio: just the quote
  const r = resolved;
  if (!r || "error" in r) return { html: `Não tem «${escHtml(arg)}» em nenhuma carteira e não encontrei a cotação no Yahoo Finance.` };
  const quote = r.quote;
  const change = quote.regularMarketChangePercent;
  return {
    html: [
      `<b>${escHtml(quote.longName ?? quote.shortName ?? r.symbol)}</b> · ${escHtml(r.symbol)}`,
      quote.regularMarketPrice != null ? `Cotação: <b>${priceFmt(quote.regularMarketPrice, quote.currency ?? "EUR")}</b>${change != null ? ` (${signedPct(change / 100)} hoje)` : ""}` : null,
      quote.fullExchangeName ? `<i>${escHtml(quote.fullExchangeName)}</i>` : null,
      "",
      "Não tem este ativo em nenhuma carteira.",
    ]
      .filter((l) => l !== null)
      .join("\n"),
  };
}

// ---------- /semana, /mes ----------

const MONTHS_LONG = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export async function periodReply(user: Who, group: Extract<Grouping, "week" | "month">, showTotals: boolean): Promise<Reply> {
  const scope = await getScope(user);
  const count = group === "week" ? 8 : 12;
  const pnl = await getDailyPnl({ assetIds: scope.assetIds, days: group === "week" ? count * 7 + 7 : 366 + 31, group, onlyQuoted: true });
  const points = pnl.points.slice(-count);
  if (!points.length) return { html: "Ainda não há registos suficientes das carteiras com cotação." };
  let cum = 0;
  const bars = points.map((p) => {
    cum = Math.round((cum + p.pnl) * 100) / 100;
    const d = new Date(p.date);
    return group === "week"
      ? { label: `até ${p.date.slice(8, 10)}/${p.date.slice(5, 7)}`, weekday: `sem. ${p.label.replace(/^sem\. /, "").split("/")[0]}`, pnl: p.pnl, cum }
      : { label: MONTHS_LONG[d.getUTCMonth()], weekday: String(d.getUTCFullYear()), pnl: p.pnl, cum };
  });
  const total = points.reduce((s, p) => s + p.pnl, 0);
  const best = points.reduce((a, b) => (b.pnl > a.pnl ? b : a));
  const worst = points.reduce((a, b) => (b.pnl < a.pnl ? b : a));
  const unit = group === "week" ? "semana" : "mês";
  const name = (p: (typeof points)[number]) => (group === "week" ? `a que acabou a ${p.date.slice(8, 10)}/${p.date.slice(5, 7)}` : `${MONTHS_LONG[new Date(p.date).getUTCMonth()]} ${p.date.slice(0, 4)}`);
  const png = summaryChartsPng(bars, { barsTitle: group === "week" ? "Variação por semana" : "Variação por mês", lineTitle: "Ganho acumulado" });
  const live = pnl.assets.filter((a) => a.live);
  const caption = [
    `<b>Pecúlio · ${group === "week" ? `últimas ${points.length} semanas` : `últimos ${points.length} meses`}</b>`,
    `Total: <b>${signed(total)}</b>${showTotals ? ` · carteiras ${fmtEur(live.reduce((s, a) => s + a.value, 0), 0)}` : ""}`,
    `Melhor ${unit}: ${name(best)} ${signed(best.pnl)} · pior: ${name(worst)} ${signed(worst.pnl)}`,
    `A ganhar: ${points.filter((p) => p.pnl > 0).length} · a perder: ${points.filter((p) => p.pnl < 0).length}`,
    points.at(-1)?.live ? `<i>a última ${group === "week" ? "semana" : "barra"} inclui hoje às cotações das ${hhmm(pnl.quotesAt) ?? "—"}</i>` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return { png, html: caption };
}

// ---------- /orcamento ----------

export async function orcamentoReply(user: Who): Promise<Reply> {
  const scope = await getScope(user);
  const month = new Date().toISOString().slice(0, 7);
  const b = await getBudgetOverview(month, scope.assetIds);
  const budgeted = b.rows.filter((r) => r.limit);
  const others = b.rows.filter((r) => !r.limit && r.spent > 0.5);
  const elapsed = b.daysElapsedPct;
  const icon = (s: string) => (s === "over" ? "🔴" : s === "warn" ? "🟡" : "🟢");
  const lines: (string | null)[] = [
    `<b>Orçamento de ${new Date().toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon", month: "long", year: "numeric" })}</b>`,
    `Já passou ${fmtPct(elapsed, 0)} do mês.`,
    "",
  ];
  if (budgeted.length) {
    const pct = b.totals.limit ? b.totals.spentBudgeted / b.totals.limit : 0;
    lines.push(`${icon(pct > 1 ? "over" : pct > elapsed + 0.1 ? "warn" : "ok")} Com orçamento: <b>${fmtEur(b.totals.spentBudgeted, 0)}</b> de ${fmtEur(b.totals.limit, 0)} (${fmtPct(pct, 0)})`);
    const left = b.totals.limit - b.totals.spentBudgeted;
    lines.push(left >= 0 ? `   restam ${fmtEur(left, 0)}` : `   <b>${fmtEur(-left, 0)} acima do orçamento</b>`, "");
    for (const r of budgeted) {
      const rest = (r.limit ?? 0) - r.spent;
      lines.push(`${icon(r.status)} ${escHtml(r.name)}: ${fmtEur(r.spent, 0)} / ${fmtEur(r.limit!, 0)} (${fmtPct(r.pct ?? 0, 0)})${rest < 0 ? ` · <b>+${fmtEur(-rest, 0)} acima</b>` : ""}`);
    }
  } else lines.push("Ainda não há orçamentos definidos (Gastos → Orçamento).");
  if (others.length) {
    lines.push("", "<b>Sem orçamento</b>");
    for (const r of others.slice(0, 6)) lines.push(`• ${escHtml(r.name)}: ${fmtEur(r.spent, 0)}`);
    if (others.length > 6) lines.push(`… e mais ${others.length - 6} categorias.`);
  }
  const credits = b.rows.filter((r) => r.spent < -0.5);
  lines.push(
    "",
    `Total gasto: <b>${fmtEur(b.totals.spent, 0)}</b>`,
    credits.length ? `<i>já descontados ${fmtEur(-credits.reduce((t, r) => t + r.spent, 0), 0)} de devoluções e créditos (${credits.map((r) => escHtml(r.name)).join(", ")})</i>` : null,
    `Mês anterior (completo): ${fmtEur(b.totals.prev, 0)}${b.totals.lastYear ? ` · há um ano: ${fmtEur(b.totals.lastYear, 0)}` : ""}`,
    elapsed < 1 && b.totals.spent > 0 ? `Ao ritmo atual, o mês fecha em cerca de ${fmtEur(b.totals.spent / Math.max(elapsed, 0.03), 0)}.` : null,
  );
  return { html: lines.filter((l) => l !== null).join("\n"), button: appUrl() ? { text: "Abrir o orçamento", url: `${appUrl()}/despesas#orcamento` } : undefined };
}
