import type { Metadata } from "next";
import { peekCheck } from "@/lib/proof-of-life";
import { fmtDate } from "@/lib/format";
import { ConfirmCard } from "./confirm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Prova de vida", robots: { index: false, follow: false } };

export default async function ProofOfLifePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await peekCheck(token);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="card w-full max-w-md space-y-4">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-semibold">Prova de vida</h1>
            <p className="text-sm text-ink-2">Pecúlio · património da família</p>
          </div>
        </div>
        {!data ? (
          <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">Link inválido ou já substituído por um pedido mais recente. Verifique o e-mail mais recente.</p>
        ) : (
          <ConfirmCard
            token={token}
            state={data.check.confirmedAt ? "already" : data.check.triggeredAt ? "released" : "open"}
            sentAt={data.check.sentAt.toISOString()}
            dueAt={data.check.dueAt.toISOString()}
            confirmedAt={data.check.confirmedAt ? data.check.confirmedAt.toISOString() : null}
            intervalDays={data.intervalDays}
            beneficiaries={data.beneficiaries}
          />
        )}
        <p className="text-xs text-ink-3">Pedido enviado {data ? fmtDate(data.check.sentAt) : ""}. Basta uma pessoa confirmar.</p>
      </div>
    </main>
  );
}
