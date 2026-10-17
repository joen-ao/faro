import { NextResponse } from "next/server";
import { allowLoginAttempt, checkLoginKey, safeNext, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/login";

export const dynamic = "force-dynamic";

const clientId = (req: Request) =>
  req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "unknown";

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const key = String(form?.get("key") ?? "");
  const next = safeNext(String(form?.get("next") ?? ""));
  const back = (error: string) => {
    const url = new URL("/app/login", req.url);
    url.searchParams.set("error", error);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url, 303);
  };

  if (!allowLoginAttempt(clientId(req))) return back("rate");
  if (!checkLoginKey(key)) return back("1");

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  return res;
}
