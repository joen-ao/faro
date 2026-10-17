import { inArray } from "drizzle-orm";
import { suppression } from "@/db/schema";
import type { AppDb } from "@/db/types";

export type SuppressionKind = "domain" | "email" | "phone";

export function normalizeSuppressionValue(value: string): { kind: SuppressionKind; value: string } {
  const v = value.trim().toLowerCase();
  if (v.includes("@")) return { kind: "email", value: v };
  if (/^\+?[\d\s().-]{7,}$/.test(v)) {
    const digits = v.replace(/[^\d+]/g, "");
    return { kind: "phone", value: digits.startsWith("+") ? digits : `+${digits}` };
  }
  return { kind: "domain", value: v.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]! };
}

/** Idempotent. Returns true when a new row was inserted. */
export async function suppress(db: AppDb, value: string, reason: string): Promise<boolean> {
  const n = normalizeSuppressionValue(value);
  const rows = await db.insert(suppression).values({ kind: n.kind, value: n.value, reason }).onConflictDoNothing().returning({ id: suppression.id });
  return rows.length > 0;
}

export interface SuppressionQuery {
  email?: string | null;
  domain?: string | null;
  phone?: string | null;
}

/** An email is suppressed if the address OR its domain is suppressed. */
export async function isSuppressed(db: AppDb, q: SuppressionQuery): Promise<boolean> {
  const values: string[] = [];
  if (q.email) {
    const e = normalizeSuppressionValue(q.email).value;
    values.push(e);
    const at = e.split("@")[1];
    if (at) values.push(at);
  }
  if (q.domain) values.push(normalizeSuppressionValue(q.domain).value);
  if (q.phone) values.push(normalizeSuppressionValue(q.phone).value);
  if (!values.length) return false;
  const rows = await db.select({ id: suppression.id }).from(suppression).where(inArray(suppression.value, values)).limit(1);
  return rows.length > 0;
}


