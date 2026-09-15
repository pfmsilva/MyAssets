import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { logView } from "@/lib/activity";
import { yahooSearchUrl, yahooUrl } from "@/lib/quotes";
import { fmtNum } from "@/lib/format";
import { Card } from "@/components/ui";
import { InstrumentSymbolEditor } from "@/components/InstrumentRow";
import { ConfirmButton } from "@/components/ConfirmButton";
import { resolveMissingInstruments } from "@/app/actions/quotes";

export const dynamic = "force-dynamic";

export default async function InstrumentsAdmin() {
  const session = await auth();
  if (session?.user) logView(session.user, "Admin · Cotações");
  const instruments = await prisma.instrument.findMany({ orderBy: [{ symbol: "asc" }, { name: "asc" }] });
  const quotes = new Map((await prisma.quote.findMany({ where: { symbol: { in: instruments.map((i) => i.symbol).filter((s): s is string => !!s) } } })).map((q) => [q.symbol, q]));
  const missing = instruments.filter((i) => !i.symbol).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-2">
        <p>Instrumentos das carteiras (DEGIRO por ISIN, XTB por ticker) e o símbolo <a href="https://finance.yahoo.com" target="_blank" rel="noopener" className="text-accent hover:underline">Yahoo Finance</a> usado para as cotações. O mapeamento é automático; corrige aqui se o símbolo estiver errado (ex.: bolsa em USD em vez de EUR). {missing > 0 && <b>{missing} sem símbolo.</b>}</p>
        <ConfirmButton className="btn btn-sm btn-primary" label="Resolver em falta" action={async () => { "use server"; await resolveMissingInstruments(); }} />
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Instrumento</th><th>ISIN / Ticker</th><th>Símbolo Yahoo</th><th className="text-right">Cotação</th><th>Estado</th></tr></thead>
            <tbody>
              {instruments.map((i) => {
                const q = i.symbol ? quotes.get(i.symbol) : undefined;
                return (
                  <tr key={i.id}>
                    <td className="max-w-[28ch] truncate" title={i.name}>{i.name}</td>
                    <td className="text-xs text-ink-3"><a href={yahooSearchUrl(i.key)} target="_blank" rel="noopener" className="hover:underline" title="Pesquisar no Yahoo">{i.key}</a></td>
                    <td>
                      <InstrumentSymbolEditor id={i.id} symbol={i.symbol} />
                      {i.symbol && <a href={yahooUrl(i.symbol)} target="_blank" rel="noopener" className="text-xs text-accent hover:underline">abrir no Yahoo ↗</a>}
                    </td>
                    <td className="num text-right">{q ? `${fmtNum(q.price, 3)} ${q.currency}` : ""}{q?.marketTime && <div className="text-xs text-ink-3">{q.marketTime.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}</div>}</td>
                    <td className="text-xs">{i.symbol ? <span className="text-good">{i.manual ? "manual" : "automático"}</span> : <span className="text-warn">sem símbolo</span>}{i.lastError && <div className="text-bad" title={i.lastError}>{i.lastError.slice(0, 60)}</div>}</td>
                  </tr>
                );
              })}
              {!instruments.length && <tr><td colSpan={5} className="py-6 text-center text-ink-3">Ainda sem instrumentos: aparecem depois de importar DEGIRO/XTB e abrir a página do ativo.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
