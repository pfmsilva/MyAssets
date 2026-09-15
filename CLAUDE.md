# Pecúlio

Ver README.md para arquitetura, comandos e deploy.

- `npm run typecheck` e `npm run lint` antes de commit.
- Esquema em `prisma/schema.prisma`; alterações via `npx prisma migrate dev --name <nome>`.
- Novos importadores em `src/lib/importers/` (registar em `index.ts`).
