/**
 * Resolves the Postgres URL from the environment. Accepts a plain DATABASE_URL, the
 * variables Vercel's Neon integration injects, and the same names with a custom prefix
 * (e.g. `peculio_DATABASE_URL`). When several prefixes exist, the same one is chosen
 * every time (unprefixed first, then alphabetical) so runtime and migrations agree.
 * `direct: true` prefers the non-pooled connection (migrations).
 */
const POOLED = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"];
const DIRECT = ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DIRECT_URL"];
const ALL = [...POOLED, ...DIRECT];

type Found = { name: string; value: string; prefix: string; prefixes: string[] };

export function findDatabaseUrl(opts: { direct?: boolean } = {}): Found | undefined {
  const entries = Object.entries(process.env).filter(([, v]) => v && v.trim() !== "") as [string, string][];
  const candidates = entries.flatMap(([k, v]) => {
    const suffix = ALL.find((n) => k === n || k.endsWith("_" + n));
    return suffix ? [{ key: k, value: v.trim(), suffix, prefix: k === suffix ? "" : k.slice(0, -suffix.length - 1) }] : [];
  });
  if (!candidates.length) return undefined;
  const prefixes = [...new Set(candidates.map((c) => c.prefix))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
  const prefix = prefixes[0];
  const order = opts.direct ? [...DIRECT, ...POOLED] : [...POOLED, ...DIRECT];
  for (const name of order) {
    const hit = candidates.find((c) => c.prefix === prefix && c.suffix === name);
    if (hit) return { name: hit.key, value: hit.value, prefix, prefixes };
  }
  return undefined;
}

/** Postgres schema used by the app unless the URL already sets `schema=`. Keeps the app isolated
 *  when the database is shared with other projects (e.g. a Neon database reused by another app). */
export const APP_SCHEMA = "peculio";

export function withSchema(url: string, schema = APP_SCHEMA): string {
  if (/[?&]schema=/.test(url)) return url;
  return url + (url.includes("?") ? "&" : "?") + "schema=" + schema;
}

export function resolveDatabaseUrl(opts: { direct?: boolean } = {}): string | undefined {
  const found = findDatabaseUrl(opts);
  return found ? withSchema(found.value) : undefined;
}
