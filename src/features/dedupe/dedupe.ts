import { eq } from "drizzle-orm";
import { companies, companySources, contactPoints, hunts } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { isGenericEmail } from "@/features/coverage/metrics";
import { normalizeNit, priorityOf, type DedupeInput, type Entity } from "./match";
import { domainOf, isGenericOnly, normalizeName, normalizePhoneE164 } from "./normalize";
import { planDedupe, type MergedPair } from "./plan";

export interface DedupeResult {
  inserted: number;
  merged: number;
  pairs: MergedPair[];
}

/** Shape stored in `hunts.progress.dedupe` (cumulative across runs; no extra table). */
export interface DedupeProgress extends DedupeResult {
  total: number;
}

const CHUNK = 500;

function chunks<T>(arr: readonly T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Loads existing companies as in-memory entities (3 queries total, no N+1). */
async function loadExisting(db: AppDb, generic?: readonly string[]) {
  const [comps, sources, phones] = await Promise.all([
    db.select().from(companies),
    db.select({ companyId: companySources.companyId, channel: companySources.sourceChannel, externalId: companySources.externalId, raw: companySources.raw }).from(companySources),
    db.select({ companyId: contactPoints.companyId, value: contactPoints.value }).from(contactPoints).where(eq(contactPoints.type, "phone")),
  ]);
  const entities = new Map<string, Entity>();
  for (const c of comps) {
    const d = domainOf(c.website);
    entities.set(c.id, {
      id: c.id,
      isNew: false,
      dirty: false,
      isDemo: c.isDemo,
      name: c.name,
      normalizedName: normalizeName(c.name, generic),
      genericOnly: isGenericOnly(c.name, generic),
      nit: normalizeNit(c.nit ?? undefined),
      address: c.address ?? undefined,
      city: c.city ?? undefined,
      lat: c.lat ?? undefined,
      lng: c.lng ?? undefined,
      website: c.website ?? undefined,
      isLegalEntity: c.isLegalEntity,
      priority: 0,
      domains: new Set(d ? [d] : []),
      phones: new Set(),
    });
  }
  const skip = new Set<string>();
  for (const s of sources) {
    skip.add(`${s.channel}:${s.externalId}`);
    const e = entities.get(s.companyId);
    if (!e) continue;
    e.priority = Math.max(e.priority, priorityOf(s.channel));
    const ph = normalizePhoneE164(typeof s.raw?.phone_e164 === "string" ? s.raw.phone_e164 : undefined);
    if (ph) e.phones.add(ph);
  }
  for (const p of phones) {
    const e = entities.get(p.companyId);
    const ph = normalizePhoneE164(p.value);
    if (e && ph) e.phones.add(ph);
  }
  return { entities: [...entities.values()], skip };
}

/**
 * Deduplicates `incoming` against itself and against stored companies (same demo flag), then persists in one transaction:
 * new companies, ALL company_sources (never drops a source), filled-in fields on kept companies and deduplicated contact_points.
 * Idempotent per `(source_channel, external_id)`. Pairs are stored in `hunts.progress.dedupe` (accumulated).
 */
export async function dedupeAndPersist(db: AppDb, huntId: string, incoming: readonly DedupeInput[], opts: { generic?: readonly string[] } = {}): Promise<DedupeResult> {
  return db.transaction(async (tx) => {
    const { entities, skip } = await loadExisting(tx as unknown as AppDb, opts.generic);
    const plan = planDedupe(entities, incoming, skip, opts.generic);

    for (const batch of chunks(plan.created)) {
      await tx.insert(companies).values(
        batch.map((e) => ({
          id: e.id,
          name: e.name,
          normalizedName: e.normalizedName,
          nit: e.nit,
          address: e.address,
          lat: e.lat,
          lng: e.lng,
          city: e.city,
          website: e.website,
          isLegalEntity: e.isLegalEntity,
          isDemo: e.isDemo,
        })),
      );
    }
    for (const e of plan.updated) {
      await tx
        .update(companies)
        .set({ name: e.name, normalizedName: e.normalizedName, nit: e.nit ?? null, address: e.address ?? null, city: e.city ?? null, lat: e.lat ?? null, lng: e.lng ?? null, website: e.website ?? null, isLegalEntity: e.isLegalEntity })
        .where(eq(companies.id, e.id));
    }

    for (const batch of chunks(plan.assignments)) {
      await tx
        .insert(companySources)
        .values(
          batch.map(({ company: c, entityId, probe }) => ({
            companyId: entityId,
            sourceChannel: c.sourceChannel,
            externalId: c.externalId,
            raw: { ...c.raw, phone_e164: probe.phone ?? null, email: c.email ?? null },
            sourceUrl: c.sourceUrl,
            license: c.license,
            isMock: c.isMock,
          })),
        )
        .onConflictDoNothing();
    }

    const points = new Map<string, typeof contactPoints.$inferInsert>();
    for (const { company: c, entityId, probe } of plan.assignments) {
      if (probe.phone) {
        points.set(`${entityId}|phone|${probe.phone}`, { companyId: entityId, type: "phone", value: probe.phone, isGeneric: false, sourceChannel: c.sourceChannel, evidenceUrl: c.sourceUrl });
      }
      const email = c.email?.trim().toLowerCase();
      if (email && email.includes("@")) {
        points.set(`${entityId}|email|${email}`, { companyId: entityId, type: "email", value: email, isGeneric: isGenericEmail(email), sourceChannel: c.sourceChannel, evidenceUrl: c.sourceUrl });
      }
    }
    for (const batch of chunks([...points.values()])) await tx.insert(contactPoints).values(batch).onConflictDoNothing();

    const result: DedupeResult = { inserted: plan.created.length, merged: plan.pairs.length, pairs: plan.pairs };
    const [hunt] = await tx.select({ progress: hunts.progress }).from(hunts).where(eq(hunts.id, huntId)).limit(1);
    if (hunt) {
      const prev = hunt.progress?.dedupe as DedupeProgress | undefined;
      const known = new Set((prev?.pairs ?? []).map((p) => `${p.mergedChannel}:${p.mergedExternalId}`));
      const pairs = [...(prev?.pairs ?? []), ...plan.pairs.filter((p) => !known.has(`${p.mergedChannel}:${p.mergedExternalId}`))];
      const progress: DedupeProgress = {
        inserted: (prev?.inserted ?? 0) + result.inserted,
        merged: pairs.length,
        pairs,
        total: (prev?.total ?? 0) + plan.assignments.length,
      };
      await tx.update(hunts).set({ progress: { ...hunt.progress, dedupe: progress } }).where(eq(hunts.id, huntId));
    }
    return result;
  });
}

/** Reads the merged pairs stored for a hunt (empty when F07 has not run). */
export async function getHuntDuplicates(db: AppDb, huntId: string): Promise<{ found: boolean; merged: number; pairs: MergedPair[] }> {
  const [hunt] = await db.select({ progress: hunts.progress }).from(hunts).where(eq(hunts.id, huntId)).limit(1);
  if (!hunt) return { found: false, merged: 0, pairs: [] };
  const d = hunt.progress?.dedupe as DedupeProgress | undefined;
  return { found: true, merged: d?.pairs.length ?? 0, pairs: d?.pairs ?? [] };
}
