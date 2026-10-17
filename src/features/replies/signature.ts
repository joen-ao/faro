import { createHmac, timingSafeEqual } from "node:crypto";

export const SVIX_TOLERANCE_SECONDS = 5 * 60;

export type SvixResult = { ok: true; id: string } | { ok: false; reason: "no_secret" | "missing_headers" | "bad_timestamp" | "expired" | "bad_signature" };

function keyOf(secret: string): Buffer {
  return Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
}

/**
 * Verifies a Svix-signed webhook (Resend). Signed content is `${id}.${timestamp}.${rawBody}`,
 * key = base64 part of `whsec_...`, signature header = space-separated `v1,<base64>` entries.
 * Fail-closed: no secret configured -> always rejected.
 */
export function verifySvix(rawBody: string, headers: Headers, secret: string | undefined, nowMs = Date.now()): SvixResult {
  if (!secret) return { ok: false, reason: "no_secret" };
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return { ok: false, reason: "missing_headers" };
  if (!/^\d{1,12}$/.test(ts)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs(nowMs / 1000 - Number(ts)) > SVIX_TOLERANCE_SECONDS) return { ok: false, reason: "expired" };
  const expected = createHmac("sha256", keyOf(secret)).update(`${id}.${ts}.${rawBody}`).digest();
  for (const part of sigHeader.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true, id };
  }
  return { ok: false, reason: "bad_signature" };
}

/** Builds the headers Svix would send (tests / local simulation). */
export function signSvix(rawBody: string, secret: string, id: string, tsSeconds: number): Record<string, string> {
  const sig = createHmac("sha256", keyOf(secret)).update(`${id}.${tsSeconds}.${rawBody}`).digest("base64");
  return { "svix-id": id, "svix-timestamp": String(tsSeconds), "svix-signature": `v1,${sig}` };
}
