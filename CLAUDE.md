# Pecúlio

Ver README.md para arquitetura, comandos e deploy.

- `npm run typecheck` e `npm run lint` antes de commit.
- Esquema em `prisma/schema.prisma`; alterações via `npx prisma migrate dev --name <nome>`.
- Novos importadores em `src/lib/importers/` (registar em `index.ts`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
- Passagem a produção: depois de validar (typecheck, lint, testes), fazer commit e push para o branch de trabalho **e** para `main` (branch de produção no Vercel: `git push origin <branch>:main`). Nunca deixar `main` atrasado em relação ao trabalho concluído.
