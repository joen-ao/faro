import { NextResponse } from "next/server";
import { checkCredentials, createSession, emailLoginEnabled, SESSION_COOKIE_V2, SESSION_TTL_S } from "@/lib/auth";
import { allowLoginAttempt, checkLoginKey, safeNext, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/login";

export const dynamic = "force-dynamic";

const clientId = (req: Request) =>
  req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "unknown";

const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge });

/**
 * F30: email + password when AUTH_EMAIL / AUTH_PASSWORD_HASH / AUTH_SECRET are set (signed `faro_session` cookie).
 * Otherwise the F23 team key form keeps working, so a deploy never locks the team out.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const next = safeNext(String(form?.get("next") ?? ""));
  const back = (error: string) => {
    const url = new URL("/app/login", req.url);
    url.searchParams.set("error", error);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, 303);
  };

  if (!allowLoginAttempt(clientId(req))) return back("rate");

  if (emailLoginEnabled()) {
    const email = String(form?.get("email") ?? "").slice(0, 254);
    const password = String(form?.get("password") ?? "").slice(0, 1024);
    if (!(await checkCredentials(email, password))) return back("1");
    const res = NextResponse.redirect(new URL(next, req.url), 303);
    res.cookies.set(SESSION_COOKIE_V2, createSession(), cookieOpts(SESSION_TTL_S));
    res.cookies.set(SESSION_COOKIE, "", cookieOpts(0));
    return res;
  }

  const key = String(form?.get("key") ?? "");
  if (!checkLoginKey(key)) return back("1");
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, key, cookieOpts(SESSION_MAX_AGE_S));
  return res;
}
