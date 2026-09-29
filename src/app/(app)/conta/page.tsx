import { requireUser, ROLE_LABEL } from "@/lib/access";
import { logView } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { telegramConfigured, viaTelegram } from "@/lib/telegram";
import { fmtDate } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { TelegramLink } from "@/components/TelegramLink";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await requireUser();
  logView(me, "A minha conta");
  const [u, s] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { email: true, name: true, role: true, telegramChatId: true, telegramName: true, telegramLinkedAt: true, visibleMembers: { select: { name: true } } } }),
    getSettings(),
  ]);
  const whatYouGet = [
    s.dailySummary !== "off" && viaTelegram(s.dailySummaryChannel) && (s.dailySummary === "all" || u.role === "ADMIN") ? "o resumo do fim do dia com os gráficos" : null,
    viaTelegram(s.alertChannel) && u.role === "ADMIN" ? "os alertas (orçamento, variações, ativos por atualizar)" : null,
    viaTelegram(s.polChannel) && s.polEnabled && s.polEmails.toLowerCase().includes(u.email.toLowerCase()) ? "o pedido de prova de vida" : null,
    s.telegramWeeklyReport && u.role === "ADMIN" ? "o relatório PDF à segunda-feira" : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <PageHeader title="A minha conta" subtitle="Os seus dados de acesso e as mensagens que recebe fora da aplicação." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Conta">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-ink-3">Nome</dt><dd>{u.name ?? "—"}</dd>
            <dt className="text-ink-3">E-mail</dt><dd>{u.email}</dd>
            <dt className="text-ink-3">Perfil</dt><dd>{ROLE_LABEL[u.role]}</dd>
            <dt className="text-ink-3">Vê</dt><dd>{u.role === "ADMIN" || !u.visibleMembers.length ? "toda a família" : u.visibleMembers.map((m) => m.name).join(", ")}</dd>
          </dl>
        </Card>
        <Card title="Telegram">
          {telegramConfigured() ? (
            <>
              <TelegramLink linked={!!u.telegramChatId} chatName={u.telegramName} />
              {u.telegramLinkedAt && <p className="mt-2 text-xs text-ink-3">Ligado desde {fmtDate(u.telegramLinkedAt)}.</p>}
              <p className="mt-3 text-xs text-ink-3">
                {whatYouGet.length ? `Com as definições atuais recebe no Telegram: ${whatYouGet.join("; ")}.` : "Com as definições atuais ainda não é enviado nada por Telegram; o administrador escolhe os canais em Administração → Definições."}{" "}
                As conversas com bots não têm cifragem ponta a ponta: por omissão as mensagens mostram ganhos e perdas, não o valor do património.
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-2">O Telegram ainda não está configurado. O administrador tem de criar o bot no @BotFather e definir <code>TELEGRAM_BOT_TOKEN</code> no Vercel.</p>
          )}
        </Card>
      </div>
    </>
  );
}
