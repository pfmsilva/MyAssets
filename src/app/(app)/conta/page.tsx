import Link from "next/link";
import { requireUser, ROLE_LABEL } from "@/lib/access";
import { logView } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { telegramConfigured, viaTelegram } from "@/lib/telegram";
import { fmtDate } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { TelegramLink } from "@/components/TelegramLink";
import { SummarySlots } from "@/components/SummarySlots";
import { PushToggle } from "@/components/PushToggle";
import { activeSlots, readSlots } from "@/lib/summary-slots";
import { emailConfigured } from "@/lib/email";
import { scheduleStatus } from "@/lib/summary-schedule";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const me = await requireUser();
  logView(me, "A minha conta");
  const [u, s] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { email: true, name: true, role: true, telegramChatId: true, telegramName: true, telegramLinkedAt: true, summarySlots: true, visibleMembers: { select: { name: true } } } }),
    getSettings(),
  ]);
  const slots = readSlots(u.summarySlots);
  const [sched, devices, sends] = await Promise.all([
    scheduleStatus(),
    prisma.pushSubscription.count({ where: { userId: me.id } }),
    prisma.activityLog.findMany({ where: { userId: me.id, action: "summary.scheduled" }, orderBy: { createdAt: "desc" }, take: 8, select: { createdAt: true, details: true } }),
  ]);
  const wakeAgoMin = sched.externalAgoMin;
  const lisbon = (d: Date) => d.toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const ownTimes = activeSlots(slots).length > 0;
  const whatYouGet = [
    ownTimes && activeSlots(slots).some((x) => x.telegram) ? `o resumo às ${activeSlots(slots).filter((x) => x.telegram).map((x) => x.time).join(", ")}` : null,
    !ownTimes && s.dailySummary !== "off" && viaTelegram(s.dailySummaryChannel) && (s.dailySummary === "all" || u.role === "ADMIN") ? "o resumo do fim do dia com os gráficos" : null,
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
              <TelegramLink linked={!!u.telegramChatId} chatName={u.telegramName} linkedAt={u.telegramChatId ? (u.telegramLinkedAt?.toISOString() ?? "") : null} />
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
        <Card title="Notificações na app" className="lg:col-span-2">
          <PushToggle devices={devices} />
          <p className="mt-3 text-xs text-ink-3">
            Tudo o que receber fica também no sino <Link className="text-accent underline" href="/notificacoes">Notificações</Link>. Nos horários abaixo, marque «App» para receber o resumo como notificação.
          </p>
        </Card>
        <Card title="Horários do resumo" className="lg:col-span-2">
          <p className="mb-3 text-sm text-ink-2">
            Escolha até quatro horas por dia para receber o resumo das carteiras (gráficos dos últimos 7 dias e o ganho de hoje às cotações do momento) e, em cada uma, se chega por e-mail, por Telegram ou pelos dois.
            {ownTimes ? " Com horários próprios deixa de receber o resumo geral do fim do dia." : s.dailySummary !== "off" && (s.dailySummary === "all" || u.role === "ADMIN") ? " Enquanto não ativar nenhum, recebe o resumo geral do fim do dia (~22h30)." : ""}
          </p>
          <SummarySlots initial={slots} telegramLinked={!!u.telegramChatId} telegramReady={telegramConfigured()} emailReady={emailConfigured()} />
          {ownTimes && (
            <p className={`mt-3 text-xs ${wakeAgoMin !== null && wakeAgoMin <= 30 ? "text-ink-3" : "text-warn"}`}>
              {wakeAgoMin === null
                ? "⚠ O despertador da aplicação ainda não está configurado: os horários só saem perto das 08:00 e das 22:30 ou quando alguém abre a aplicação. O administrador configura-o em Definições → Resumo diário."
                : wakeAgoMin <= 30
                  ? `Despertador a funcionar (última chamada há ${wakeAgoMin} min).`
                  : `⚠ O despertador não chama a aplicação há ${wakeAgoMin >= 120 ? `${Math.round(wakeAgoMin / 60)} h` : `${wakeAgoMin} min`}: os horários podem sair atrasados ou não sair.`}
            </p>
          )}
          {sends.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-medium text-ink-2">Últimos envios agendados</p>
              <ul className="space-y-0.5 text-xs text-ink-2">
                {sends.map((x, k) => {
                  const d = (x.details ?? {}) as Record<string, string | number>;
                  const parts = [d.email ? `e-mail ${d.email}` : null, d.telegram ? `Telegram ${d.telegram}` : null, d.app ? `app ${d.app}` : null, d.erro ? `erro: ${d.erro}` : null].filter(Boolean);
                  const bad = parts.some((p) => String(p).includes("falhou") || String(p).includes("erro") || String(p).includes("não ligado"));
                  return (
                    <li key={k} className={bad ? "text-warn" : ""}>
                      {lisbon(x.createdAt)} · horário das {d.hora}{Number(d.atraso_min) > 10 ? ` (saiu ${d.atraso_min} min depois, pelo ${d.origem})` : ""} — {parts.join(" · ") || "sem canal"}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
