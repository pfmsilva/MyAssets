"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { telegramLinks, telegramStatus, telegramSummaryNow, testTelegram, unlinkTelegram } from "@/app/actions/telegram";

type Msg = { ok: boolean; text: string } | null;

/** Link / unlink the signed-in user's Telegram, plus test buttons. */
export function TelegramLink({ linked, chatName, linkedAt }: { linked: boolean; chatName: string | null; linkedAt: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [links, setLinks] = useState<{ privateUrl: string; groupUrl: string; username: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const since = useRef<string | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      router.refresh();
    });

  /** Asks the app whether the bot has linked this account since the links were shown. */
  const check = async (manual: boolean) => {
    const s = await telegramStatus();
    if (s.linkedAt !== null && s.linkedAt !== since.current) {
      setLinks(null);
      setMsg({ ok: true, text: `Ligado a ${s.chatName ?? "Telegram"}.` });
      router.refresh();
      return true;
    }
    if (manual) setMsg(s.problem ? { ok: false, text: `Ainda não ficou ligado: ${s.problem}` } : { ok: false, text: "Ainda não ficou ligado. No Telegram, abra o bot pelo botão acima e carregue em Iniciar (ou envie a mensagem /start que aparece)." });
    return false;
  };

  // while the links are open, notice the link as soon as the bot confirms it
  useEffect(() => {
    if (!links) return;
    let tries = 0;
    const t = setInterval(async () => {
      if (++tries > 60 || (await check(false))) clearInterval(t);
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [links]);

  return (
    <div className="space-y-3 text-sm">
      {linked ? (
        <p className="text-good">✓ Ligado a <b>{chatName}</b>. O resumo do dia e os alertas escolhidos em Definições chegam aí; a qualquer hora, envie <b>/resumo</b> ao bot para receber o resumo do momento.</p>
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
              setMsg(null);
              const r = await telegramLinks();
              if (r.ok) {
                since.current = linked ? linkedAt : null;
                setLinks(r);
              } else setMsg({ ok: false, text: r.message });
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
          <p className="text-xs text-ink-3">2. O bot responde &laquo;Ligado&raquo; e esta página atualiza sozinha. O link é válido 24 horas e só serve para a sua conta.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                await check(true);
                setChecking(false);
              }}
            >
              {checking ? "A verificar…" : "Verificar agora"}
            </button>
            <button type="button" className="btn btn-sm" onClick={() => { setLinks(null); setMsg(null); }}>Cancelar</button>
          </div>
        </div>
      )}

      {linked && !links && (
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
