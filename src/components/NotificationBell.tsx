import Link from "next/link";

/** Bell with the number of unread notifications; opens the list. */
export function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link href="/notificacoes" className="btn btn-sm relative shrink-0" title={unread ? `${unread} notificação(ões) por ler` : "Notificações"} aria-label={unread ? `Notificações: ${unread} por ler` : "Notificações"}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-bad px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>}
    </Link>
  );
}
