import { GridIndex, type DedupeInput, compareByName, priorityOf, probeOf, type Entity, type Match, type MatchReason, type Probe } from "./match";
import { trigramSimilarity } from "./normalize";

/** One fused duplicate, as shown in the UI "N duplicados fusionados" detail. */
export interface MergedPair {
  keptCompanyId: string;
  keptName: string;
  mergedName: string;
  mergedChannel: string;
  mergedExternalId: string;
  /** The merged record came from mock/demo data: never counted as a real duplicate. */
  isMock?: boolean;
  reason: MatchReason;
  /** Trigram similarity of the normalised names, 0..1 (3 decimals). */
  similarity: number;
  distanceMeters?: number;
}

export interface Assignment {
  company: DedupeInput;
  entityId: string;
  probe: Probe;
}

export interface Plan {
  /** Entities created in this run (to insert). */
  created: Entity[];
  /** Pre-existing entities whose fields changed (to update). */
  updated: Entity[];
  assignments: Assignment[];
  pairs: MergedPair[];
}

class Index {
  grid = new GridIndex();
  byNit = new Map<string, Entity>();
  byDomain = new Map<string, Entity[]>();
  byPhone = new Map<string, Entity[]>();

  register(e: Entity) {
    if (e.nit) this.byNit.set(e.nit, this.byNit.get(e.nit) ?? e);
    for (const d of e.domains) push(this.byDomain, d, e);
    for (const p of e.phones) push(this.byPhone, p, e);
    this.grid.add(e);
  }
}

function push(map: Map<string, Entity[]>, key: string, e: Entity) {
  const list = map.get(key);
  if (!list) map.set(key, [e]);
  else if (!list.includes(e)) list.push(e);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Pure matching step: assigns every incoming company to an existing or new entity applying the F07 rules.
 * Complexity ~ O(n * k): NIT/domain/phone via hash maps, distance via a ~100 m grid (no O(n^2) scan).
 * `skip` holds `channel:externalId` keys already stored (idempotency).
 */
export function planDedupe(existing: readonly Entity[], incoming: readonly DedupeInput[], skip: ReadonlySet<string> = new Set(), generic?: readonly string[]): Plan {
  const indexes = new Map<boolean, Index>();
  const indexFor = (demo: boolean) => {
    let ix = indexes.get(demo);
    if (!ix) indexes.set(demo, (ix = new Index()));
    return ix;
  };
  for (const e of existing) indexFor(e.isDemo).register(e);

  const plan: Plan = { created: [], updated: [], assignments: [], pairs: [] };
  const seen = new Set<string>(skip);
  const updatedSet = new Set<Entity>();

  for (const c of incoming) {
    const key = `${c.sourceChannel}:${c.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const probe = probeOf(c, generic);
    const ix = indexFor(c.isMock);
    const match = findMatch(ix, probe);

    if (!match) {
      const e: Entity = {
        id: globalThis.crypto.randomUUID(),
        isNew: true,
        dirty: true,
        isDemo: c.isMock,
        name: c.name,
        normalizedName: probe.normalizedName,
        genericOnly: probe.genericOnly,
        nit: probe.nit,
        address: c.address,
        city: c.city,
        lat: c.lat,
        lng: c.lng,
        website: c.website,
        isLegalEntity: c.isLegalEntity ?? true,
        priority: priorityOf(c.sourceChannel),
        domains: new Set(probe.domain ? [probe.domain] : []),
        phones: new Set(probe.phone ? [probe.phone] : []),
      };
      ix.register(e);
      plan.created.push(e);
      plan.assignments.push({ company: c, entityId: e.id, probe });
      continue;
    }

    const e = match.entity;
    plan.pairs.push({
      keptCompanyId: e.id,
      keptName: e.name,
      mergedName: c.name,
      mergedChannel: c.sourceChannel,
      mergedExternalId: c.externalId,
      isMock: c.isMock,
      reason: match.reason,
      similarity: round3(match.similarity),
      ...(match.distanceMeters !== undefined ? { distanceMeters: Math.round(match.distanceMeters) } : {}),
    });
    mergeInto(ix, e, probe);
    if (!e.isNew) updatedSet.add(e);
    plan.assignments.push({ company: c, entityId: e.id, probe });
  }
  plan.updated = [...updatedSet].filter((e) => e.dirty);
  return plan;
}

function findMatch(ix: Index, probe: Probe): Match | undefined {
  if (probe.nit) {
    const e = ix.byNit.get(probe.nit);
    if (e) return { entity: e, reason: "nit", similarity: trigramSimilarity(probe.normalizedName, e.normalizedName) };
  }
  if (!probe.normalizedName) return undefined;
  const candidates = new Set<Entity>();
  const { lat, lng } = probe.company;
  if (lat !== undefined && lng !== undefined) for (const e of ix.grid.near(lat, lng)) candidates.add(e);
  if (probe.domain) for (const e of ix.byDomain.get(probe.domain) ?? []) candidates.add(e);
  if (probe.phone) for (const e of ix.byPhone.get(probe.phone) ?? []) candidates.add(e);
  let best: Match | undefined;
  for (const e of candidates) {
    const m = compareByName(probe, e);
    if (m && (!best || m.similarity > best.similarity)) best = m;
  }
  return best;
}

/** Completes empty fields; the higher-priority (official) source drives name/address/city. */
function mergeInto(ix: Index, e: Entity, p: Probe) {
  const c = p.company;
  const before = JSON.stringify([e.name, e.nit, e.address, e.city, e.lat, e.lng, e.website, e.isLegalEntity]);
  const pr = priorityOf(c.sourceChannel);
  if (pr > e.priority) {
    e.name = c.name;
    e.normalizedName = p.normalizedName || e.normalizedName;
    e.genericOnly = p.genericOnly;
    if (c.address) e.address = c.address;
    if (c.city) e.city = c.city;
    e.isLegalEntity = c.isLegalEntity ?? e.isLegalEntity;
    e.priority = pr;
  } else {
    e.address ??= c.address;
    e.city ??= c.city;
  }
  if (!e.nit && p.nit) {
    e.nit = p.nit;
    ix.byNit.set(p.nit, e);
  }
  e.website ??= c.website;
  if (e.lat === undefined && e.lng === undefined && c.lat !== undefined && c.lng !== undefined) {
    e.lat = c.lat;
    e.lng = c.lng;
    ix.grid.add(e);
  }
  if (p.domain && !e.domains.has(p.domain)) {
    e.domains.add(p.domain);
    push(ix.byDomain, p.domain, e);
  }
  if (p.phone && !e.phones.has(p.phone)) {
    e.phones.add(p.phone);
    push(ix.byPhone, p.phone, e);
  }
  if (JSON.stringify([e.name, e.nit, e.address, e.city, e.lat, e.lng, e.website, e.isLegalEntity]) !== before) e.dirty = true;
}
