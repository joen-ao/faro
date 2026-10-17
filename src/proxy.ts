import { NextResponse, type NextRequest } from "next/server";
import { requireAppAccess } from "@/lib/app-access";

/** Real 401 for the ad-spend settings page (a server component cannot set the status itself). */
export function proxy(req: NextRequest) {
  return requireAppAccess(req) ?? NextResponse.next();
}

export const config = { matcher: ["/app/settings/:path*"] };
