import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { apiCalls, contactPoints, leads } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { getEnv, type Env } from "@/lib/env";
import { getCapi, type CapiAdapter, type CapiEvent, type CapiUserData } from "@/integrations/meta-capi";

/**
 * F31 · Server-side Meta events (Conversions API). Email and phone are normalised and SHA-256 hashed before they leave
 * Faro; nothing is stored. `external_id` = hash of the lead id, so Lead and QualifiedLead of the same lead link up.
 */

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export const normEmail = (e: string) => e.trim().toLowerCase();

/** Digits only, with Colombia's country code when a 10-digit mobile comes without it. */
export function normPhone(p: string): string | null {
  const d = p.replace(/\D/g, "");
  if (d.length < 7) return null;
  if (d.length === 10 && d.startsWith("3")) return `57${d}`;
  return d;
}

/** `fb.1.<ms>.<fbclid>` as Meta expects when the _fbc cookie is not available. */
export function fbcFromFbclid(fbclid: string | null | undefined, now = Date.now()): string | undefined {
  const v = fbclid?.trim();
  return v && /^[\w-]{10,500}$/.test(v) ? `fb.1.${now}.${v}` : undefined;
}

const COOKIE_RE = /^fb\.\d\.\d{10,16}\.[\w.-]{1,500}$/;
const validCookie = (v?: string | null) => (v && COOKIE_RE.test(v) ? v : undefined);

export interface Identity {
  leadId: string;
  emails?: (string | null | undefined)[];
  phones?: (string | null | undefined)[];
  fbc?: string | null;
  fbp?: string | null;
  fbclid?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export function buildUserData(id: Identity, now = Date.now()): CapiUserData {
  const em = [...new Set((id.emails ?? []).filter((e): e is string => !!e && e.includes("@")).map((e) => sha256(normEmail(e))))];
  const ph = [...new Set((id.phones ?? []).map((p) => (p ? normPhone(p) : null)).filter((p): p is string => !!p).map(sha256))];
  const fbc = validCookie(id.fbc) ?? fbcFromFbclid(id.fbclid, now);
  return {
    ...(em.length ? { em } : {}),
    ...(ph.length ? { ph } : {}),
    external_id: [sha256(id.leadId)],
    ...(fbc ? { fbc } : {}),
    ...(validCookie(id.fbp) ? { fbp: id.fbp! } : {}),
    ...(id.ip ? { client_ip_address: id.ip.slice(0, 64) } : {}),
    ...(id.userAgent ? { client_user_agent: id.userAgent.slice(0, 512) } : {}),
  };
}

function capiFor(db: AppDb, env: Env): CapiAdapter {
  return getCapi(env, async (c) => {
    await db
      .insert(apiCalls)
      .values({ service: "meta_capi", endpoint: c.endpoint, status: c.status, latencyMs: c.latencyMs, error: c.error, costUsd: 0, isMock: false })
      .catch(() => undefined);
  });
}

/** Client-sent event id (shared with the browser pixel) or a fresh one. */
export function eventIdOr(v: unknown): string {
  return typeof v === "string" && /^[\w-]{8,64}$/.test(v) ? v : randomUUID();
}

/** `Lead` for a website form submission (inbound). Never throws. */
export async function trackLead(db: AppDb, id: Identity & { eventId: string; sourceUrl?: string }, opts: { env?: Env; capi?: CapiAdapter; now?: number } = {}) {
  const env = opts.env ?? getEnv();
  if (!env.META_PIXEL_ID) return null;
  const now = opts.now ?? Date.now();
  const event: CapiEvent = {
    event_name: "Lead",
    event_time: Math.floor(now / 1000),
    event_id: id.eventId,
    action_source: "website",
    ...(id.sourceUrl ? { event_source_url: id.sourceUrl.slice(0, 1000) } : {}),
    user_data: buildUserData(id, now),
  };
  return (opts.capi ?? capiFor(db, env)).send([event]).catch(() => null);
}

/** Contact data Faro already holds for a lead's company (to match the qualified event). */
async function contactsOf(db: AppDb, leadId: string): Promise<{ emails: string[]; phones: string[] }> {
  const [lead] = await db.select({ companyId: leads.companyId }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return { emails: [], phones: [] };
  const rows = await db
    .select({ type: contactPoints.type, value: contactPoints.value })
    .from(contactPoints)
    .where(and(eq(contactPoints.companyId, lead.companyId), inArray(contactPoints.type, ["email", "phone", "whatsapp"])));
  return { emails: rows.filter((r) => r.type === "email").map((r) => r.value), phones: rows.filter((r) => r.type !== "email").map((r) => r.value) };
}

/** Custom `QualifiedLead` when Dapta marks a lead as qualified (system_generated: it happens off-site). Never throws. */
export async function trackQualifiedLead(
  db: AppDb,
  p: { leadId: string; conversationId: string; email?: string | null; phone?: string | null; score?: number | null },
  opts: { env?: Env; capi?: CapiAdapter; now?: number } = {},
) {
  const env = opts.env ?? getEnv();
  if (!env.META_PIXEL_ID) return null;
  const now = opts.now ?? Date.now();
  try {
    const known = await contactsOf(db, p.leadId);
    const event: CapiEvent = {
      event_name: "QualifiedLead",
      event_time: Math.floor(now / 1000),
      event_id: `ql-${sha256(p.conversationId).slice(0, 32)}`,
      action_source: "system_generated",
      user_data: buildUserData({ leadId: p.leadId, emails: [p.email, ...known.emails], phones: [p.phone, ...known.phones] }, now),
      ...(typeof p.score === "number" ? { custom_data: { score: Math.round(p.score) } } : {}),
    };
    return await (opts.capi ?? capiFor(db, env)).send([event]);
  } catch {
    return null;
  }
}
