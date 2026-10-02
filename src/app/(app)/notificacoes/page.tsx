import Link from "next/link";
import { requireUser } from "@/lib/access";
import { logView } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { NotificationsActions } from "@/components/NotificationsActions";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { summary: "Resumo", alert: "Alerta", health: "Vigilância", test: "Teste" };

export default async function NotificationsPage() {
  const me = await requireUser();
  logView(me, "Notificações");
  const items = await prisma.notification.findMany({
    where: { userId: me.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, kind: true, title: true, body: true, url: true, createdAt: true, readAt: true, image: false },
  });
  const withImage = new Set((await prisma.notification.findMany({ where: { id: { in: items.map((i) => i.id) }, image: { not: null } }, select: { id: true } })).map((i) => i.id));
  const unread = items.filter((i) => !i.readAt).length;
  const when = (d: Date) => d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <PageHeader title="Notificações" subtitle="O que a aplicação lhe enviou nos últimos 30 dias: resumos, alertas e avisos." />
      <Card
        action={items.length ? <NotificationsActions unread={unread} /> : undefined}
        title={items.length ? `${items.length} notificação(ões)${unread ? ` · ${unread} por ler` : ""}` : "Sem notificações"}
      >
        {items.length === 0 ? (
          <p className="text-sm text-ink-2">
            Ainda não recebeu nenhuma. Ative as notificações neste dispositivo e escolha as horas em <Link className="text-accent underline" href="/conta">A minha conta</Link>.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id} className="py-3">
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`} aria-label={n.readAt ? undefined : "por ler"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{n.title} <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-normal text-ink-3">{KIND[n.kind] ?? n.kind}</span></p>
                    <p className="text-sm text-ink-2">{n.body}</p>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {when(n.createdAt)}
                      {n.url && <> · <Link className="text-accent underline" href={n.url}>abrir</Link></>}
                    </p>
                    {withImage.has(n.id) && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-ink-2">Ver gráficos</summary>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/notificacoes/${n.id}/imagem`} alt="Gráficos do resumo" loading="lazy" className="mt-2 w-full max-w-xl rounded-lg border border-border" />
                      </details>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
