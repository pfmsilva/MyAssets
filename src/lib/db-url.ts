/**
 * Resolves the Postgres URL from the variables Vercel's Neon integration injects
 * (DATABASE_URL, DATABASE_URL_UNPOOLED, POSTGRES_*) or a manually set DATABASE_URL.
 * `direct: true` prefers the non-pooled connection (needed for migrations).
 */
export function resolveDatabaseUrl(opts: { direct?: boolean } = {}): string | undefined {
  const e = process.env;
  const pooled = [e.DATABASE_URL, e.POSTGRES_PRISMA_URL, e.POSTGRES_URL];
  const direct = [e.DATABASE_URL_UNPOOLED, e.POSTGRES_URL_NON_POOLING, e.DIRECT_URL];
  const order = opts.direct ? [...direct, ...pooled] : [...pooled, ...direct];
  return order.find((v) => v && v.trim() !== "")?.trim();
}
