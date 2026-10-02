"use client";
import { useState, useTransition } from "react";
import { saveSummarySlots, summaryNow } from "@/app/actions/summary";
import type { Slot } from "@/lib/summary-slots";

/** The four times of day for the user's summary, each by e-mail and/or Telegram. */
export function SummarySlots({ initial, telegramLinked, telegramReady, emailReady }: { initial: Slot[]; telegramLinked: boolean; telegramReady: boolean; emailReady: boolean }) {
  const [slots, setSlots] = useState<Slot[]>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (i: number, patch: Partial<Slot>) => setSlots((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
    });

  return (
    <div className="space-y-3 text-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="pb-2 font-normal">Ativo</th>
              <th className="pb-2 font-normal">Hora (Lisboa)</th>
              <th className="pb-2 font-normal">E-mail</th>
              <th className="pb-2 font-normal">Telegram</th>
              <th className="pb-2 font-normal">App</th>
              <th className="pb-2 font-normal">Dias</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s, i) => (
              <tr key={i} className={`border-t border-border ${s.on ? "" : "text-ink-3"}`}>
                <td className="py-2 pr-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={s.on} onChange={(e) => set(i, { on: e.target.checked })} aria-label={`Ativar o ${i + 1}.º horário`} />
                    {i + 1}.º
                  </label>
                </td>
                <td className="py-2 pr-2">
                  <input type="time" value={s.time} onChange={(e) => set(i, { time: e.target.value })} disabled={!s.on} className="w-36" aria-label={`Hora do ${i + 1}.º horário`} />
                </td>
                <td className="py-2 pr-2">
                  <input type="checkbox" checked={s.email} onChange={(e) => set(i, { email: e.target.checked })} disabled={!s.on} aria-label={`E-mail às ${s.time}`} />
                </td>
                <td className="py-2 pr-2">
                  <input type="checkbox" checked={s.telegram} onChange={(e) => set(i, { telegram: e.target.checked })} disabled={!s.on} aria-label={`Telegram às ${s.time}`} />
                </td>
                <td className="py-2 pr-2">
                  <input type="checkbox" checked={s.app} onChange={(e) => set(i, { app: e.target.checked })} disabled={!s.on} aria-label={`Notificação na app às ${s.time}`} />
                </td>
                <td className="py-2">
                  <select value={s.days} onChange={(e) => set(i, { days: e.target.value as Slot["days"] })} disabled={!s.on} aria-label={`Dias do ${i + 1}.º horário`}>
                    <option value="weekdays">Dias úteis</option>
                    <option value="all">Todos os dias</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {slots.some((s) => s.on && s.telegram) && !telegramLinked && <p className="text-xs text-warn">Para receber no Telegram, ligue primeiro o Telegram no cartão ao lado.</p>}
      {slots.some((s) => s.on && s.email) && !emailReady && <p className="text-xs text-warn">O envio de e-mail ainda não está configurado na aplicação (administrador).</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => saveSummarySlots(slots))}>
          {pending ? "A guardar…" : "Guardar horários"}
        </button>
        {emailReady && (
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => summaryNow("email"))}>
            Testar por e-mail
          </button>
        )}
        {telegramReady && telegramLinked && (
          <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => summaryNow("telegram"))}>
            Testar no Telegram
          </button>
        )}
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-good" : "text-warn"}`}>{msg.text}</p>}
    </div>
  );
}
