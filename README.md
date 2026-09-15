# Pecúlio

Aplicação web (desktop e mobile) para controlar o património financeiro da família:
contas à ordem (BPI, Revolut, CTT), PPR (Optimize, Save and Grow), carteiras de
investimento (DEGIRO, XTB), cripto (Binance) e dinheiro físico.

- **Perfis de utilizador**: Administração, Atualização, Consulta (login Google). Cada utilizador pode ser
  associado a um ou mais membros da família e, nesse caso, só vê os ativos, movimentos e dashboards
  desses membros (administradores veem sempre tudo).
- **Relatório PDF** (administrador): resumo de todos os ativos da família, distribuição, património por
  membro, evolução, despesas e composição das carteiras (`/api/relatorio`).
- **Importação de ficheiros**: extrato BPI (.xlsx), extrato Revolut (.csv), carteira DEGIRO (.xls).
- **Registo manual** de valores (e posições) para os restantes ativos.
- **Histórico** completo: todos os valores importados/registados ficam guardados; os extratos
  geram automaticamente saldos de fim de mês para o passado.
- **Dashboards**: distribuição por tipo/instituição/membro, ativos de cada membro (com titularidade em %),
  evolução do património, despesas por categoria, rendimentos vs. despesas, taxa de poupança
  e variação do património.
- **Categorias** de despesa com regras automáticas (palavra-chave ou regex) e edição manual.

## Stack

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 · Prisma 6 · PostgreSQL (Neon) ·
Auth.js v5 (Google) · Recharts · SheetJS.

## Deploy em Vercel + Neon (plano gratuito)

1. **Base de dados**: no Vercel, **Storage → Create Database → Neon** (a integração cria a BD e injeta
   `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL`, … no projeto; confirmar que fica ligada a
   Production **e** Preview). Se a integração usar um prefixo (ex. `peculio_DATABASE_URL`), a app aceita-o;
   mas mantém só **uma** base ligada ao projeto e apaga variáveis `DATABASE_URL` vazias criadas à mão.
   A app cria as suas tabelas no schema Postgres `peculio` (não em `public`), por isso pode partilhar
   uma base já usada por outro projeto sem conflitos. Em alternativa, criar em https://neon.tech e definir `DATABASE_URL` à mão.
2. **Google OAuth**: em https://console.cloud.google.com/apis/credentials criar
   "OAuth client ID" (tipo Web application) com:
   - Authorized JavaScript origins: `https://<a-tua-app>.vercel.app`
   - Authorized redirect URIs: `https://<a-tua-app>.vercel.app/api/auth/callback/google`
3. **Vercel**: importar este repositório e definir as variáveis de ambiente:

   | Variável | Valor |
   |---|---|
   | `DATABASE_URL` | só se não usares a integração Neon do Vercel |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | credenciais Google |
   | `ADMIN_EMAIL` | email Google que fica administrador no primeiro login |

   O comando de build (`prisma generate && prisma migrate deploy && next build`) cria as tabelas.
4. **Dados iniciais** (membros, ativos, categorias e regras), uma vez, a partir do teu PC:

   ```bash
   DATABASE_URL="<neon>" npm run db:seed
   ```
5. Entrar com o email de `ADMIN_EMAIL` e, em **Administração → Utilizadores**, registar os
   emails Google dos restantes membros com o perfil desejado. Só emails registados conseguem entrar.

## Desenvolvimento local

```bash
cp .env.example .env         # editar DATABASE_URL (Postgres local) e AUTH_SECRET
npm install
npx prisma migrate dev       # cria o esquema
npm run db:seed              # membros, ativos, categorias, regras
npm run dev                  # http://localhost:3000
```

Sem credenciais Google, definir `AUTH_DEV_LOGIN="true"` no `.env` para um login local por email
(apenas funciona em `npm run dev`, nunca em produção).

## Importação de ficheiros

| Origem | Ficheiro | O que é lido |
|---|---|---|
| BPI Net | Movimentos → exportar Excel (.xlsx) | saldo contabilístico + movimentos |
| Revolut | Extrato → CSV | movimentos (revertidos ignorados, pendentes atualizados) + saldo |
| DEGIRO | Carteira → Exportar → XLS | posições e valor total (indicar a data) |

Movimentos repetidos são detetados por hash (data, descrição, montante, saldo) e ignorados,
por isso é seguro importar extratos sobrepostos. Cada importação pode ser anulada na página do ativo.

Novos importadores (XTB, Binance, CTT, PPR): adicionar um parser em `src/lib/importers/` que devolve
`ParsedImport` e registá-lo em `src/lib/importers/index.ts`.

## Estrutura

```
prisma/schema.prisma      modelo de dados (User/Member/Asset/Snapshot/Position/Transaction/Category/Rule)
prisma/seed.ts            dados iniciais
src/auth.ts               Auth.js (Google + allowlist de emails, roles)
src/proxy.ts              proteção de rotas
src/lib/importers/        parsers BPI, Revolut, DEGIRO
src/lib/import-service.ts importação → BD (dedupe, snapshots, saldos mensais derivados, categorização)
src/lib/analytics.ts      séries de património, distribuição, despesas/poupança
src/app/(app)/            páginas: visão geral, família, ativos, evolução, despesas, movimentos, importar, admin
src/app/actions/          server actions (snapshots, importação, categorias, administração)
```
