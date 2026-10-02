"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteNotifications, markNotificationsRead } from "@/app/actions/notifications";

/** Mark everything read (also automatically a few seconds after opening the list) or clear it. */
export function NotificationsActions({ unread }: { unread: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(() => markNotificationsRead().then(() => router.refresh()), 6000);
    return () => clearTimeout(t);
  }, [unread, router]);
  return (
    <span className="flex gap-2">
      {unread > 0 && (
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => start(async () => { await markNotificationsRead(); router.refresh(); })}>
          Marcar como lidas
        </button>
      )}
      <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => start(async () => { await deleteNotifications(); router.refresh(); })}>
        Limpar
      </button>
    </span>
  );
}
