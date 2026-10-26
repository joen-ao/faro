import { safeEqual } from "@/lib/app-access";

/** Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. No secret configured = never authorized. */
export function cronAuthorized(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return !!m && safeEqual(m[1]!.trim(), secret);
}
