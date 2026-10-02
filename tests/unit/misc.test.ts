import { afterEach, describe, expect, it, vi } from "vitest";
import { matchCategory, normalize, ruleMatches } from "@/lib/categorize";
import { DEFAULT_SLOTS, activeSlots, lisbonNow, readSlots, toMin } from "@/lib/summary-slots";
import { linkCode, readLinkCode, webhookSecret, webhookSecretOk, telegramConfigured } from "@/lib/telegram";
import { fmtEur, fmtPct } from "@/lib/format";
import { summaryChartsPng } from "@/lib/chart-png";

describe("category rules", () => {
  it("ignores case and accents in plain patterns", () => {
    expect(ruleMatches("pingo doce", "COMPRA PINGO DOCE LISBOA")).toBe(true);
    expect(ruleMatches("café", "Pagamento CAFE central")).toBe(true);
    expect(ruleMatches("galp", "MB WAY continente")).toBe(false);
    expect(ruleMatches("   ", "qualquer")).toBe(false);
  });
  it("accepts /regex/ patterns, and survives an invalid one", () => {
    expect(ruleMatches("/^TRF\\s+\\d+/i", "trf 123 para joão")).toBe(true);
    expect(ruleMatches("/(/", "x")).toBe(false);
  });
  it("the higher priority wins, then the longer pattern", () => {
    const rules = [
      { id: "1", pattern: "super", priority: 0, categoryId: "geral" },
      { id: "2", pattern: "supermercado", priority: 0, categoryId: "mercado" },
      { id: "3", pattern: "super bock", priority: 5, categoryId: "bebidas" },
    ];
    expect(matchCategory(rules, "SUPER BOCK grupo")).toBe("bebidas");
    expect(matchCategory(rules, "supermercado X")).toBe("mercado");
    expect(matchCategory(rules, "outra coisa")).toBeNull();
  });
  it("normalize collapses spaces", () => {
    expect(normalize("  Água   Mineral ")).toBe("agua mineral");
  });
});

describe("personal summary times", () => {
  it("always gives four valid slots, whatever is stored", () => {
    expect(readSlots(null)).toHaveLength(4);
    const s = readSlots([{ on: true, time: "25:99", email: true }, "lixo", { on: true, time: "07:05", app: true, days: "all" }]);
    expect(s).toHaveLength(4);
    expect(s[0].time).toBe(DEFAULT_SLOTS[0].time); // invalid time falls back
    expect(s[0].email).toBe(true);
    expect(s[1]).toEqual(DEFAULT_SLOTS[1]);
    expect(s[2]).toMatchObject({ time: "07:05", app: true, days: "all" });
  });
  it("only counts slots that are on and have a channel", () => {
    const s = readSlots([{ on: true, time: "08:00", email: false, telegram: false, app: false }, { on: true, time: "09:00", telegram: true }, { on: false, time: "10:00", email: true }]);
    expect(activeSlots(s).map((x) => x.time)).toEqual(["09:00"]);
  });
  it("lisbonNow follows summer and winter time", () => {
    expect(lisbonNow(new Date("2026-07-01T12:00:00Z"))).toMatchObject({ date: "2026-07-01", minutes: 13 * 60, weekend: false });
    expect(lisbonNow(new Date("2026-01-15T12:00:00Z"))).toMatchObject({ date: "2026-01-15", minutes: 12 * 60 });
    // 23:30 UTC in summer is already the next day in Lisbon
    expect(lisbonNow(new Date("2026-07-01T23:30:00Z"))).toMatchObject({ date: "2026-07-02", minutes: 30 });
  });
  it("knows the weekend in Lisbon", () => {
    expect(lisbonNow(new Date("2026-10-03T10:00:00Z")).weekend).toBe(true); // Saturday
    expect(lisbonNow(new Date("2026-10-02T10:00:00Z")).weekend).toBe(false); // Friday
    expect(toMin("22:30")).toBe(1350);
  });
});

describe("Telegram link code and webhook secret", () => {
  afterEach(() => vi.useRealTimers());
  it("a code opens for its own user only", () => {
    const code = linkCode("user123");
    expect(code.length).toBeLessThanOrEqual(64);
    expect(readLinkCode(code)).toBe("user123");
  });
  it("rejects tampered codes", () => {
    const [id, exp, sig] = linkCode("user123").split("_");
    expect(readLinkCode(`other_${exp}_${sig}`)).toBeNull();
    expect(readLinkCode(`${id}_${exp}_${sig.replace(/.$/, sig.endsWith("0") ? "1" : "0")}`)).toBeNull();
    expect(readLinkCode("lixo")).toBeNull();
  });
  it("expires after a day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    const code = linkCode("u1");
    vi.setSystemTime(new Date("2026-10-02T09:59:00Z"));
    expect(readLinkCode(code)).toBe("u1");
    vi.setSystemTime(new Date("2026-10-02T10:01:00Z"));
    expect(readLinkCode(code)).toBeNull();
  });
  it("the webhook secret ignores how the token was pasted", () => {
    const token = "7712345678:AAEhBP0av28aWm1-9x_ZkQq3cY7uVbN5sTg";
    vi.stubEnv("TELEGRAM_BOT_TOKEN", token);
    const clean = webhookSecret();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", `  "bot${token}"\n`);
    expect(webhookSecret()).toBe(clean);
    expect(telegramConfigured()).toBe(true);
    expect(webhookSecretOk(clean)).toBe(true);
    expect(webhookSecretOk("errado")).toBe(false);
    expect(webhookSecretOk(null)).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("formatting", () => {
  it("formats euros and percentages in Portuguese", () => {
    expect(fmtEur(1234.5, 0).replace(/\s/g, " ")).toMatch(/1 ?235 ?€|1\s?235\s?€/);
    expect(fmtPct(0.1234)).toMatch(/12,3\s?%/);
  });
});

describe("summaryChartsPng", () => {
  const days = Array.from({ length: 7 }, (_, i) => ({ label: `0${i + 1}/10`, weekday: "seg", pnl: i === 2 ? null : (i - 3) * 100, cum: i * 50 - 100 }));
  it("renders a PNG with a footer", () => {
    const png = summaryChartsPng(days, { footer: "Cotações do Yahoo Finance · 02/10 19:05", scale: 1 });
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.length).toBeGreaterThan(5000);
  });
  it("is taller with a footer", () => {
    const h = (b: Buffer) => b.readUInt32BE(20);
    expect(h(summaryChartsPng(days, { footer: "x", scale: 1 }))).toBeGreaterThan(h(summaryChartsPng(days, { scale: 1 })));
  });
});
