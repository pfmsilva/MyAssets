"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/access";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { runDailySummary } from "@/lib/daily-summary";
import { activeSlots, readSlots, SLOT_COUNT, skipPassedToday } from "@/lib/summary-schedule";

const slotSchema = z.object({
  on: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM)."),
  email: z.boolean(),
  telegram: z.boolean(),
  app: z.boolean(),
  days: z.enum(["weekdays", "all"]),
});

/** Saves the signed-in user's summary times. */
export async function saveSummarySlots(input: unknown): Promise<{ ok: boolean; message: string }> {
  const me = await assertRole("VIEWER");
  const parsed = z.array(slotSchema).length(SLOT_COUNT).safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const slots = parsed.data;
  const bad = slots.find((s) => s.on && !s.email && !s.telegram && !s.app);
  if (bad) return { ok: false, message: `Escolha e-mail, Telegram e/ou notificação na app para as ${bad.time}.` };
  const u = await prisma.user.findUniqueOrThrow({ where: { id: me.id }, select: { telegramChatId: true } });
  await prisma.user.update({ where: { id: me.id }, data: { summarySlots: slots } });
  await skipPassedToday(me.id, slots);
  const active = activeSlots(readSlots(slots));
  await logActivity(me, "summary.schedule", { details: { horarios: active.map((s) => `${s.time} ${[s.email && "e-mail", s.telegram && "Telegram", s.app && "app"].filter(Boolean).join("+")}${s.days === "all" ? " (todos os dias)" : ""}`) } });
  revalidatePath("/conta");
  const warn = active.some((s) => s.telegram) && !u.telegramChatId ? " Ligue o Telegram abaixo para receber os de Telegram." : "";
  return { ok: true, message: active.length ? `Guardado: ${active.map((s) => s.time).join(", ")}.${warn}` : "Guardado: sem horários ativos (recebe o resumo geral definido pelo administrador, se houver)." };
}

/** Sends today's summary now to the signed-in user, by the chosen channel, to see how it looks. */
export async function summaryNow(channel: "email" | "telegram"): Promise<{ ok: boolean; message: string }> {
  const me = await assertRole("VIEWER");
  const r = await runDailySummary({ force: true, onlyUserId: me.id, channel });
  await logActivity(me, "summary.test", { details: { canal: channel, sent: r.sent, telegram: r.telegram, errors: r.errors, skipped: r.skipped } });
  if (channel === "email" ? r.sent : r.telegram) return { ok: true, message: channel === "email" ? `Enviado para ${me.email}.` : "Enviado para o Telegram." };
  return { ok: false, message: r.errors[0] ?? r.skipped[0] ?? "Nada enviado." };
}
