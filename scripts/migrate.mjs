// Runs `prisma migrate deploy` using whichever Postgres variable is available
// (manual DATABASE_URL or the ones injected by Vercel's Neon integration).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

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

const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url }, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
