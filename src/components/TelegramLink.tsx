"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { telegramLinks, telegramSummaryNow, testTelegram, unlinkTelegram } from "@/app/actions/telegram";

type Msg = { ok: boolean; text: string } | null;

/** Link / unlink the signed-in user's Telegram, plus test buttons. */
export function TelegramLink({ linked, chatName }: { linked: boolean; chatName: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [links, setLinks] = useState<{ privateUrl: string; groupUrl: string; username: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });

  return (
    <div className="space-y-3 text-sm">
      {linked ? (
        <p className="text-good">✓ Ligado a <b>{chatName}</b>. O resumo do dia e os alertas escolhidos em Definições chegam aí.</p>
      ) : (
        <p className="text-ink-2">Ainda não está ligado. Ao ligar, o bot do Pecúlio passa a enviar-lhe mensagens no Telegram.</p>
      )}

      {!links ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await telegramLinks();
              if (r.ok) setLinks(r);
              else setMsg({ ok: false, text: r.message });
            })
          }
        >
          {pending ? "A preparar…" : linked ? "Ligar a outra conversa" : "Ligar Telegram"}
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p>1. Abra o bot <b>@{links.username}</b> e carregue em <b>Iniciar</b> (ou <i>Start</i>):</p>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-primary" href={links.privateUrl} target="_blank" rel="noopener">Abrir no Telegram</a>
            <a className="btn" href={links.groupUrl} target="_blank" rel="noopener">Ligar a um grupo da família</a>
          </div>
          <p className="text-xs text-ink-3">2. O bot responde &laquo;Ligado&raquo;. Depois carregue em <b>Atualizar</b> aqui. O link é válido 24 horas e só serve para a sua conta.</p>
          <button type="button" className="btn btn-sm" onClick={() => router.refresh()}>Atualizar</button>
        </div>
      )}

      {linked && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(testTelegram)}>Enviar mensagem de teste</button>
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(telegramSummaryNow)}>Enviar o resumo de hoje</button>
          <button type="button" className="btn btn-sm btn-danger" disabled={pending} onClick={() => run(unlinkTelegram)}>Desligar</button>
        </div>
      )}
      {msg && <p className={`text-xs ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
    </div>
  );
}
