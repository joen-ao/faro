import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { companies, contactPoints, events, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { suppress } from "./suppression";

const DEV_SECRET = "faro-dev-only-optout-secret";
let warned = false;

function secret(override?: string): string {
  const s = override ?? process.env.OPTOUT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production" && !warned) {
    warned = true;
    console.warn("[compliance] OPTOUT_SECRET no está definido: usando secreto de desarrollo. Defínelo antes de producción.");
  }
  return DEV_SECRET;
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const sign = (payload: string, key: string) => createHmac("sha256", key).update(payload).digest();

export interface OptOutPayload {
  leadId: string;
  /** Optional specific address/phone the message was sent to. */
  contact?: string;
}

/** Signed, non-expiring opt-out token: base64url(json).base64url(hmac). */
export function createOptOutToken(leadId: string, contact?: string, secretOverride?: string): string {
  const payload = b64(JSON.stringify({ l: leadId, ...(contact ? { c: contact } : {}) }));
  return `${payload}.${b64(sign(payload, secret(secretOverride)))}`;
}

export function verifyOptOutToken(token: string, secretOverride?: string): OptOutPayload | null {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  const expected = sign(payload, secret(secretOverride));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { l?: unknown; c?: unknown };
    if (typeof j.l !== "string" || !j.l) return null;
    return { leadId: j.l, ...(typeof j.c === "string" ? { contact: j.c } : {}) };
  } catch {
    return null;
  }
}

export type OptOutResult = { ok: true; leadFound: boolean; suppressed: number } | { ok: false; reason: "invalid_token" };

/** Verifies the token and suppresses the lead's contact points (+ website domain). Idempotent. */
export async function applyOptOut(db: AppDb, token: string, secretOverride?: string): Promise<OptOutResult> {
  const p = verifyOptOutToken(token, secretOverride);
  if (!p) return { ok: false, reason: "invalid_token" };
  const reason = "opt-out de un clic";
  let count = 0;
  if (p.contact && (await suppress(db, p.contact, reason))) count++;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.leadId);
  const [lead] = isUuid ? await db.select().from(leads).where(eq(leads.id, p.leadId)).limit(1) : [];
  if (!lead) return { ok: true, leadFound: false, suppressed: count };

  const points = await db.select().from(contactPoints).where(eq(contactPoints.companyId, lead.companyId));
  for (const cp of points) if (cp.type !== "web_form" && (await suppress(db, cp.value, reason))) count++;
  const [company] = await db.select().from(companies).where(eq(companies.id, lead.companyId)).limit(1);
  if (company?.website) {
    try {
      const host = new URL(company.website.startsWith("http") ? company.website : `https://${company.website}`).hostname;
      if (await suppress(db, host, reason)) count++;
    } catch {
      /* unparsable website: skip domain suppression */
    }
  }
  if (lead.status !== "opted_out") {
    await db.update(leads).set({ status: "opted_out" }).where(eq(leads.id, lead.id));
    await db.insert(events).values({ leadId: lead.id, type: "opt_out", payload: { via: "one_click" }, isDemo: lead.isDemo });
  }
  return { ok: true, leadFound: true, suppressed: count };
}
