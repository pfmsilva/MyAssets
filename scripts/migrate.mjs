// Runs `prisma migrate deploy` using whichever Postgres variable is available
// (manual DATABASE_URL or the ones injected by Vercel's Neon integration).
import { spawnSync } from "node:child_process";

const e = process.env;
const candidates = [e.DATABASE_URL_UNPOOLED, e.POSTGRES_URL_NON_POOLING, e.DIRECT_URL, e.DATABASE_URL, e.POSTGRES_PRISMA_URL, e.POSTGRES_URL];
const url = candidates.find((v) => v && v.trim() !== "")?.trim();

if (!url) {
  console.error(`
✖ Nenhuma connection string de Postgres encontrada.
  Defina DATABASE_URL (Vercel → Settings → Environment Variables) para Production, Preview e Development,
  ou ligue a base de dados Neon ao projeto (Vercel → Storage → Connect Project) nos mesmos ambientes.
  Variáveis aceites: DATABASE_URL, DATABASE_URL_UNPOOLED, POSTGRES_URL, POSTGRES_PRISMA_URL, POSTGRES_URL_NON_POOLING.
`);
  process.exit(1);
}

const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...e, DATABASE_URL: url }, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
