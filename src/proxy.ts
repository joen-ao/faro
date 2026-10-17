import { NextResponse, type NextRequest } from "next/server";
import { requireAppAccess } from "@/lib/app-access";

/**
 * Gate for the internal /app pages: without the team key, send the visitor to /app/login (keeping where they were
 * going). APIs keep answering 401 from their own handlers; the login page itself stays open.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (pathname === "/app/login" || pathname.startsWith("/app/login/")) return NextResponse.next();
  if (!requireAppAccess(req)) return NextResponse.next();
  const login = new URL("/app/login", req.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login, 307);
}

export const config = { matcher: ["/app", "/app/:path*"] };
