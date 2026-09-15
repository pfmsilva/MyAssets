import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default function proxy(req: NextRequest) {
  return (auth as unknown as (r: NextRequest) => Promise<Response>)(req);
}

export const config = {
  matcher: ["/((?!api/auth|api/cron|login|_next/static|_next/image|favicon.ico|icon.svg|icons/|manifest.webmanifest).*)"],
};
