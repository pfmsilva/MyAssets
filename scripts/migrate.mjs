// Runs `prisma migrate deploy` using whichever Postgres variable is available
// (manual DATABASE_URL or the ones injected by Vercel's Neon integration).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

// Local runs: read .env.local / .env (deployments already have the variables in the environment).
for (const file of [".env.local", ".env"]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

const POOLED = ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"];
const DIRECT = ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DIRECT_URL"];
const ALL = [...POOLED, ...DIRECT];
// Same selection logic as src/lib/db-url.ts (keep in sync): one prefix, chosen deterministically.
const entries = Object.entries(process.env).filter(([, v]) => v && v.trim() !== "");
const candidates = entries.flatMap(([k, v]) => {
  const suffix = ALL.find((n) => k === n || k.endsWith("_" + n));
  return suffix ? [{ key: k, value: v.trim(), suffix, prefix: k === suffix ? "" : k.slice(0, -suffix.length - 1) }] : [];
});
if (!candidates.length) {
  console.error(`
✖ Nenhuma connection string de Postgres encontrada.
  Defina DATABASE_URL (Vercel → Settings → Environment Variables) para Production, Preview e Development,
  ou ligue a base de dados Neon ao projeto (Vercel → Storage → Connect Project) nos mesmos ambientes.
  Variáveis aceites (com ou sem prefixo, ex. peculio_DATABASE_URL): DATABASE_URL, DATABASE_URL_UNPOOLED,
  POSTGRES_URL, POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING.
`);
  process.exit(1);
}
const prefixes = [...new Set(candidates.map((c) => c.prefix))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)));
const prefix = prefixes[0];
let found;
for (const name of [...DIRECT, ...POOLED]) {
  found = candidates.find((c) => c.prefix === prefix && c.suffix === name);
  if (found) break;
}
const url = found.value;
console.log(`→ Migrações com a variável ${found.key}${prefixes.length > 1 ? ` (atenção: existem várias bases configuradas: ${prefixes.map((p) => p || "(sem prefixo)").join(", ")}; a app usa sempre "${prefix || "(sem prefixo)"}")` : ""}`);

const run = (args) => spawnSync("npx", ["prisma", ...args], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url }, shell: process.platform === "win32" });

// P3005 guard: a database with tables but no `_prisma_migrations` (Neon's sample table, or a
// schema created with `prisma db push`) needs a baseline before `migrate deploy` accepts it.
async function baselineIfNeeded() {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const rows = await prisma.$queryRawUnsafe(`select table_name from information_schema.tables where table_schema = current_schema()`);
    const tables = new Set(rows.map((r) => r.table_name));
    if (tables.size === 0 || tables.has("_prisma_migrations")) return;
    const ours = tables.has("User") && tables.has("Asset");
    const dirs = readdirSync("prisma/migrations", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    console.log(`→ Base com tabelas mas sem histórico de migrações (${[...tables].join(", ")}). ${ours ? "Esquema já existe: a registar migrações como aplicadas." : "A aplicar o esquema e a registar as migrações."}`);
    for (const dir of dirs) {
      if (!ours) {
        const r = run(["db", "execute", "--url", url, "--file", `prisma/migrations/${dir}/migration.sql`]);
        if (r.status !== 0) process.exit(r.status ?? 1);
      }
      const r = run(["migrate", "resolve", "--applied", dir]);
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
  } catch (e) {
    console.error(`(baseline) não foi possível inspecionar a base: ${String(e?.message ?? e).split("\n").find((l) => l.trim()) ?? e}`);
  } finally {
    await prisma.$disconnect();
  }
}

await baselineIfNeeded();
const r = run(["migrate", "deploy"]);
process.exit(r.status ?? 1);
