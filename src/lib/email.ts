/** Sends e-mail through Resend (https://resend.com). Needs RESEND_API_KEY and ALERTS_FROM. */
export type Attachment = { filename: string; content: Buffer };

/** Public URL of the app, used in the links inside e-mails. */
export function appUrl() {
  return process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
}

export function emailConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.ALERTS_FROM;
}

export async function sendEmail(opts: { to: string[]; subject: string; html: string; text?: string; attachments?: Attachment[] }): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!emailConfigured()) return { ok: false, error: "E-mail não configurado: defina RESEND_API_KEY e ALERTS_FROM no Vercel." };
  if (!opts.to.length) return { ok: false, error: "Sem destinatários." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERTS_FROM,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        attachments: opts.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
      }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) return { ok: false, error: `${res.status} ${body.message ?? body.name ?? "erro Resend"}` };
    return { ok: true, id: body.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erro ao enviar e-mail." };
  }
}

export function emailLayout(title: string, bodyHtml: string, appUrl: string) {
  return `<!doctype html><html lang="pt-PT"><body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0b0b0b">
<div style="max-width:600px;margin:0 auto;padding:24px">
  <div style="background:#2a78d6;color:#fff;border-radius:12px 12px 0 0;padding:16px 20px;font-size:18px;font-weight:600">Pecúlio · ${title}</div>
  <div style="background:#fff;border:1px solid #e4e3df;border-top:0;border-radius:0 0 12px 12px;padding:20px;font-size:14px;line-height:1.5">${bodyHtml}
    <p style="margin-top:20px;font-size:12px;color:#8a8985">Enviado automaticamente pela aplicação Pecúlio · <a href="${appUrl}" style="color:#2a78d6">${appUrl}</a></p>
  </div>
</div></body></html>`;
}
