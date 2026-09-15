import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { DEV_LOGIN } from "@/auth.config";

const ERRORS: Record<string, string> = {
  AccessDenied: "Este email não está autorizado. Peça ao administrador para o registar.",
  OAuthAccountNotLinked: "Este email já existe com outro método de login.",
  Configuration: "Login Google não configurado (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const session = await auth();
  if (session?.user) redirect("/");
  const { error, callbackUrl } = await searchParams;
  const googleEnabled = !!process.env.AUTH_GOOGLE_ID;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="card w-full max-w-sm space-y-6">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-semibold">MyAssets</h1>
            <p className="text-sm text-ink-2">Património financeiro da família</p>
          </div>
        </div>
        {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{ERRORS[error] ?? `Erro de autenticação (${error}).`}</p>}
        {googleEnabled ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: callbackUrl ?? "/" });
            }}
          >
            <button className="btn btn-primary w-full" type="submit">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41 35.4 44 30.2 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              Entrar com Google
            </button>
          </form>
        ) : (
          <p className="text-sm text-ink-2">Login Google não configurado. Defina AUTH_GOOGLE_ID e AUTH_GOOGLE_SECRET.</p>
        )}
        {DEV_LOGIN && (
          <form
            className="space-y-2 border-t border-border pt-4"
            action={async (fd) => {
              "use server";
              await signIn("dev", { email: String(fd.get("email")), redirectTo: callbackUrl ?? "/" });
            }}
          >
            <label htmlFor="email">Login de desenvolvimento (sem Google)</label>
            <input id="email" name="email" type="email" required placeholder="email" className="w-full" />
            <button className="btn w-full" type="submit">Entrar (dev)</button>
          </form>
        )}
        <p className="text-xs text-ink-3">Apenas emails registados pelo administrador têm acesso.</p>
      </div>
    </main>
  );
}
