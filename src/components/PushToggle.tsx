"use client";
import { useEffect, useState, useTransition } from "react";
import { pushPublicKey, removePushSubscription, savePushSubscription, sendTestNotification } from "@/app/actions/notifications";

type State = "checking" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function keyBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Turns push notifications on or off for this device (browser or installed app). */
export function PushToggle({ devices }: { devices: number }) {
  const [state, setState] = useState<State>("checking");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-install" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub && Notification.permission === "granted" ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return setMsg({ ok: false, text: "Sem autorização do browser não é possível notificar." });
        }
        const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        await navigator.serviceWorker.ready;
        const key = await pushPublicKey();
        const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
        const r = await savePushSubscription(sub.toJSON());
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok) setState("on");
      } catch (e) {
        setMsg({ ok: false, text: `Não foi possível ativar: ${e instanceof Error ? e.message : "erro"}` });
      }
    });

  const disable = () =>
    start(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMsg({ ok: true, text: "Notificações desativadas neste dispositivo." });
    });

  const test = () =>
    start(async () => {
      const r = await sendTestNotification();
      setMsg({ ok: r.ok, text: r.message });
    });

  return (
    <div className="space-y-3 text-sm">
      {state === "checking" && <p className="text-ink-3">A verificar…</p>}
      {state === "unsupported" && <p className="text-ink-2">Este browser não suporta notificações push. Use o Chrome, Edge, Firefox ou Safari atualizados, ou instale a aplicação no telemóvel.</p>}
      {state === "ios-install" && (
        <p className="text-ink-2">
          No iPhone e iPad as notificações só funcionam com a aplicação instalada: abra esta página no <b>Safari</b>, toque em <b>Partilhar</b> → <b>Adicionar ao ecrã principal</b>, abra o Pecúlio a partir do ícone e volte aqui (iOS 16.4 ou mais recente).
        </p>
      )}
      {state === "denied" && <p className="text-warn">As notificações estão bloqueadas neste browser. Permita-as nas definições do site (cadeado junto ao endereço) e recarregue a página.</p>}
      {state === "off" && (
        <>
          <p className="text-ink-2">Receba os resumos e alertas como notificação neste dispositivo, mesmo com a aplicação fechada.</p>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={enable}>{pending ? "A ativar…" : "Ativar notificações neste dispositivo"}</button>
        </>
      )}
      {state === "on" && (
        <>
          <p className="text-good">✓ Notificações ativas neste dispositivo.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm" disabled={pending} onClick={test}>Enviar notificação de teste</button>
            <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={disable}>Desativar</button>
          </div>
        </>
      )}
      <p className="text-xs text-ink-3">{devices ? `${devices} dispositivo(s) ligado(s) à sua conta.` : "Nenhum dispositivo ligado à sua conta."} Cada dispositivo ativa-se separadamente. As notificações mostram só ganhos e perdas, não o valor do património.</p>
      {msg && <p className={`text-xs ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
    </div>
  );
}
