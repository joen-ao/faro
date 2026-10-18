import { NextResponse } from "next/server";
import { evaluatorToken } from "@/lib/app-access";
import { safeNext, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/login";

export const dynamic = "force-dynamic";

/** One-click evaluator access: read-only session, no key typed or shown. */
export async function POST(req: Request) {
  const key = process.env.APP_ACCESS_KEY;
  const form = await req.formData().catch(() => null);
  const next = safeNext(String(form?.get("next") ?? ""));
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  if (!key) return res;
  res.cookies.set(SESSION_COOKIE, evaluatorToken(key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
