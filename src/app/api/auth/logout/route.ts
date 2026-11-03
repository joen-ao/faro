import { NextResponse } from "next/server";
import { SESSION_COOKIE_V2 } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/login";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/app/login", req.url), 303);
  for (const name of [SESSION_COOKIE, SESSION_COOKIE_V2]) res.cookies.set(name, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
