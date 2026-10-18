import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { companies, companySources, contactPoints, costEntries, events, fitAssessments, hunts, icpProfiles, leads, qualifications, workspaces } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { dedupeAndPersist, type DedupeProgress } from "@/features/dedupe/dedupe";
import type { MergedPair } from "@/features/dedupe/plan";
import { areaLabel, cityLabel, criteriaForCity, huntCities, normalizeCities } from "@/features/icp/presets";
import { DEFAULT_THRESHOLD, IcpCriteria } from "@/features/icp/schema";
import { HuntOffer } from "@/features/offer/schema";
import { scoreFit, type ScoreCompany } from "@/features/scoring/fit";
import { allDone, initialSourcesProgress, isHuntSource } from "./batch";
import { computeCounters, toPointStatus } from "./counters";
import { OSM_LICENSE } from "@/integrations/overpass/types";
import { SOCRATA_LICENSE } from "@/integrations/socrata/types";
import { fetchBatch, type SourceDeps } from "./sources";
import type { CityProgress, Counters, HuntSource, HuntSourcesProgress, SourceProgress, StatusUpdate, StreamPoint, StreamResponse } from "./types";

export class HuntError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 409 | 502,
  ) {
    super(message);
    this.name = "HuntError";
  }
}

/* ---------- create ---------- */

export interface CreateHuntInput {
  prompt: string;
  criteria: IcpCriteria;
  threshold?: number;
  /** What this hunt offers (icp_profiles.offer); null/absent -> the team catalog is used later. */
  offer?: unknown;
  /** Enrich the websites (Apify) automatically once every source finished. */
  autoEnrich?: boolean;
}

/** Workspace + ICP profile + hunt with per-source progress. Real hunts only (demo has its own seeder). */
export async function createHunt(db: AppDb, input: CreateHuntInput): Promise<{ huntId: string; icpProfileId: string; sources: HuntSourcesProgress }> {
  const criteria = normalizeCities(IcpCriteria.parse(input.criteria));
  const offer = input.offer == null ? null : (JSON.parse(JSON.stringify(HuntOffer.parse(input.offer))) as Record<string, unknown>);
  return db.transaction(async (tx) => {
    const t = tx as unknown as AppDb;
    let [ws] = await t.select().from(workspaces).where(eq(workspaces.name, "Mi espacio")).limit(1);
    if (!ws) [ws] = await t.insert(workspaces).values({ name: "Mi espacio", country: criteria.country }).returning();
    const [icp] = await t
      .insert(icpProfiles)
      .values({ workspaceId: ws.id, prompt: input.prompt, criteria, threshold: input.threshold ?? DEFAULT_THRESHOLD, offer })
      .returning();
    const sources = initialSourcesProgress(criteria);
    const [hunt] = await t.insert(hunts).values({ icpProfileId: icp.id, status: "pending", progress: { sources, ...(input.autoEnrich ? { autoEnrich: true } : {}) } }).returning();
    return { huntId: hunt.id, icpProfileId: icp.id, sources };
  });
}

const LOG_MAX = 12;
const nowIso = () => new Date().toISOString();

/* ---------- scoring helpers ---------- */

function toScoreCompany(
  c: typeof companies.$inferSelect,
  contacts: Array<typeof contactPoints.$inferSelect>,
  sources: Array<typeof companySources.$inferSelect>,
): ScoreCompany {
  return {
    name: c.name,
    city: c.city,
    website: c.website,
    nit: c.nit,
    isLegalEntity: c.isLegalEntity,
    contacts: contacts.map((x) => ({ type: x.type, value: x.value, isGeneric: x.isGeneric, evidenceUrl: x.evidenceUrl })),
    sources: sources.map((s) => {
      const raw = s.raw as Record<string, unknown>;
      const tags = raw.tags && typeof raw.tags === "object" ? (raw.tags as Record<string, unknown>) : {};
      const osmTags = Object.entries(tags).map(([k, v]) => `${k}=${String(v)}`);
      return { channel: s.sourceChannel, url: s.sourceUrl, osmTags: osmTags.length ? osmTags : undefined, ciiu: typeof raw.ciiu === "string" ? raw.ciiu : null };
    }),
  };
}

/** Deterministic fit scoring (rules only, no AI) for a set of leads; persists assessments and promotes `found` -> `fit`. */
export async function scoreLeadsDeterministic(db: AppDb, leadIds: readonly string[], criteria: IcpCriteria, icpProfileId: string, threshold: number): Promise<number> {
  if (leadIds.length === 0) return 0;
  const leadRows = await db.select().from(leads).where(inArray(leads.id, [...leadIds]));
  const companyIds = [...new Set(leadRows.map((l) => l.companyId))];
  const [comps, contacts, srcs] = await Promise.all([
    db.select().from(companies).where(inArray(companies.id, companyIds)),
    db.select().from(contactPoints).where(inArray(contactPoints.companyId, companyIds)),
    db.select().from(companySources).where(inArray(companySources.companyId, companyIds)),
  ]);
  const byCompany = new Map(comps.map((c) => [c.id, c]));
  let promoted = 0;
  const assessments: Array<typeof fitAssessments.$inferInsert> = [];
  const updates: Array<{ id: string; score: number; fit: boolean }> = [];
  for (const lead of leadRows) {
    const company = byCompany.get(lead.companyId);
    if (!company) continue;
    const r = await scoreFit(
      toScoreCompany(company, contacts.filter((x) => x.companyId === company.id), srcs.filter((x) => x.companyId === company.id)),
      criteria,
      { threshold },
    );
    assessments.push({ companyId: company.id, icpProfileId, score: r.score, criteriaMet: r.criteria, whyNow: r.why_now, model: "rules" });
    const fit = r.meetsThreshold && company.isLegalEntity && lead.status === "found";
    if (fit) promoted++;
    updates.push({ id: lead.id, score: r.score, fit });
  }
  await db.transaction(async (tx) => {
    const t = tx as unknown as AppDb;
    for (let i = 0; i < assessments.length; i += 500) await t.insert(fitAssessments).values(assessments.slice(i, i + 500));
    for (const u of updates) {
      await t.update(leads).set({ fitScore: u.score, ...(u.fit ? { status: "fit" as const } : {}) }).where(eq(leads.id, u.id));
    }
  });
  return promoted;
}

/* ---------- run one batch ---------- */

export interface RunBatchResult {
  source: HuntSource;
  state: SourceProgress["state"];
  /** City index this batch ran on (0 on single-city hunts). */
  city: number;
  /** City index to send as `city` next time (moves on once a city is exhausted). */
  nextCity: number;
  cursor: number;
  /** Offset inside `nextCity`. */
  nextCursor: number;
  /** The source finished every city. */
  done: boolean;
  total: number | null;
  fetched: number;
  newLeads: number;
  merged: number;
  fit: number;
  huntDone: boolean;
}

const slugOf = () => randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x");

/**
 * One resumable unit of work: fetch a batch from `source` at `cursor`, dedupe + persist, create leads, score them.
 * Idempotent: replaying a cursor inserts nothing new (dedupe by `(channel, external_id)`, one lead per company+hunt).
 */
export function runBatch(db: AppDb, huntId: string, source: HuntSource, cursor: number | undefined, deps: SourceDeps, city?: number): Promise<RunBatchResult> {
  return runBatchInner(db, huntId, source, cursor, deps, city);
}

/**
 * Per-hunt critical section: a transaction holding `pg_advisory_xact_lock(hunt)`. Every write to `hunts.progress`
 * (sources, dedupe) and every lead insert of a batch happen inside it, so concurrent batches of different sources
 * (even on different serverless instances) serialise and never lose each other's progress.
 * The slow network fetch stays OUTSIDE the lock.
 */
async function locked<T>(db: AppDb, huntId: string, fn: (tx: AppDb) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${huntId}))`);
    return fn(tx as unknown as AppDb);
  });
}

async function writeSource(db: AppDb, huntId: string, source: HuntSource, patch: (prev: SourceProgress) => SourceProgress, hunt?: Partial<typeof hunts.$inferInsert>) {
  const [row] = await db.select({ progress: hunts.progress }).from(hunts).where(eq(hunts.id, huntId)).limit(1);
  const progress = (row?.progress ?? {}) as { sources?: HuntSourcesProgress } & Record<string, unknown>;
  const sources = { ...(progress.sources as HuntSourcesProgress) };
  sources[source] = patch(sources[source]);
  const finished = allDone(sources);
  await db
    .update(hunts)
    .set({
      progress: { ...progress, sources },
      ...(finished ? { status: "completed" as const, finishedAt: new Date() } : {}),
      ...hunt,
    })
    .where(eq(hunts.id, huntId));
  return { sources, finished };
}

const addLog = (p: SourceProgress, text: string): SourceProgress["log"] => [...p.log, { at: nowIso(), text }].slice(-LOG_MAX);

async function runBatchInner(db: AppDb, huntId: string, source: HuntSource, cursorParam: number | undefined, deps: SourceDeps, cityParam?: number): Promise<RunBatchResult> {
  const [row] = await db
    .select({ hunt: hunts, icp: icpProfiles })
    .from(hunts)
    .innerJoin(icpProfiles, eq(icpProfiles.id, hunts.icpProfileId))
    .where(eq(hunts.id, huntId))
    .limit(1);
  if (!row) throw new HuntError("Búsqueda no encontrada", 404);
  const progress = row.hunt.progress as { sources?: HuntSourcesProgress };
  const sp = progress.sources?.[source];
  if (!sp) throw new HuntError("Esta búsqueda no tiene esa fuente", 400);
  if (sp.state === "skipped") throw new HuntError(sp.reason ?? "Fuente no aplicable", 409);
  const parsed = IcpCriteria.safeParse(row.icp.criteria);
  if (!parsed.success) throw new HuntError("Los criterios guardados no son válidos", 400);
  const criteria = parsed.data;
  const cursor = Math.max(0, Math.trunc(cursorParam ?? sp.cursor));
  // Multi-city: each source walks the hunt cities in sequence (Overpass rate limits); the cursor is an offset
  // inside the current city. Single-city hunts (and every older hunt) have one city and the exact old behaviour.
  const cities = huntCities(criteria);
  const multi = cities.length > 1;
  const cityIdx = Math.trunc(cityParam ?? sp.city ?? 0);
  if (!Number.isFinite(cityIdx) || cityIdx < 0 || cityIdx >= cities.length) throw new HuntError("Ciudad fuera de la búsqueda", 400);
  const isLastCity = cityIdx === cities.length - 1;
  const cityName = cityLabel(cities[cityIdx].name);

  await locked(db, huntId, (tx) =>
    writeSource(tx, huntId, source, (p) => ({ ...p, state: "running", error: undefined }), { status: "running", startedAt: row.hunt.startedAt ?? new Date() }),
  );

  let batch;
  try {
    batch = await fetchBatch(huntId, source, multi ? criteriaForCity(criteria, cities[cityIdx]) : criteria, cursor, deps, undefined, cityIdx);
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 200) : "Error desconocido";
    const where = multi ? `${cityName}: ` : "";
    await locked(db, huntId, (tx) => writeSource(tx, huntId, source, (p) => ({ ...p, state: "error", error: message, log: addLog(p, `${where}Error: ${message}`) })));
    throw new HuntError(`Falló la fuente ${source}: ${message}`, 502);
  }

  const fetchedNow = batch.companies.length;
  // City exhausted -> the source moves on to the next city at offset 0; done only after the last one.
  const advance = batch.done && !isLastCity;
  const sourceDone = batch.done && isLastCity;
  const nextCity = advance ? cityIdx + 1 : cityIdx;
  const nextCursor = advance ? 0 : batch.nextCursor;
  const { dedupe, created, fit, finished } = await locked(db, huntId, async (tx) => {
    const dedupe = await dedupeAndPersist(tx, huntId, batch.companies);

    // Companies touched by this batch (new or merged) -> one lead each per hunt.
    const keys = batch.companies.map((c) => c.externalId);
    const srcRows = keys.length
      ? await tx
          .select({ companyId: companySources.companyId, externalId: companySources.externalId, channel: companySources.sourceChannel })
          .from(companySources)
          .where(and(eq(companySources.sourceChannel, source), inArray(companySources.externalId, keys)))
      : [];
    const companyIds = [...new Set(srcRows.map((r) => r.companyId))];
    const existingLeads = companyIds.length
      ? await tx.select({ id: leads.id, companyId: leads.companyId }).from(leads).where(and(eq(leads.huntId, huntId), inArray(leads.companyId, companyIds)))
      : [];
    const have = new Set(existingLeads.map((l) => l.companyId));
    const compRows = companyIds.length ? await tx.select({ id: companies.id, isDemo: companies.isDemo }).from(companies).where(inArray(companies.id, companyIds)) : [];
    const demoOf = new Map(compRows.map((c) => [c.id, c.isDemo]));
    const fresh = companyIds.filter((id) => !have.has(id));
    let created: Array<{ id: string }> = [];
    if (fresh.length) {
      created = await tx
        .insert(leads)
        .values(fresh.map((companyId) => ({ companyId, huntId, primarySource: source, slug: slugOf(), isDemo: demoOf.get(companyId) ?? false, createdAt: sql<Date>`clock_timestamp()` })))
        .onConflictDoNothing()
        .returning({ id: leads.id });
    }
    // Data cost: public sources are free (USD 0) but each new lead gets its line with the licence, so its receipt is never empty.
    if (created.length) {
      const license = source === "osm" ? OSM_LICENSE : SOCRATA_LICENSE;
      await tx.insert(costEntries).values(
        created.map((l) => ({
          leadId: l.id,
          huntId,
          sourceChannel: source,
          category: "data" as const,
          quantity: 1,
          unit: "record",
          rate: 0,
          usd: 0,
          evidence: `Fuente pública gratuita · ${license}`,
          isDemo: batch.isMock,
          isMock: batch.isMock,
        })),
      );
    }
    // Re-score leads whose company gained a source through a merge: more evidence can promote them.
    const mergedLeadIds = existingLeads.filter((l) => dedupe.pairs.some((p) => p.keptCompanyId === l.companyId)).map((l) => l.id);
    const toScore = [...created.map((l) => l.id), ...mergedLeadIds];
    const fit = await scoreLeadsDeterministic(tx, toScore, criteria, row.icp.id, row.icp.threshold);

    const { finished } = await writeSource(tx, huntId, source, (p) => {
      const text =
        (multi ? `${cityName}: ` : "") +
        `${fetchedNow} registros procesados · ${created.length} empresas nuevas` +
        (dedupe.merged ? ` · ${dedupe.merged} duplicados fusionados` : "") +
        (batch.excluded ? ` · ${batch.excluded} posibles personas naturales excluidas` : "");
      const tail = sourceDone ? " · fuente completa" : advance ? ` · ${cityName} completa` : "";
      const common = { ...p, state: sourceDone ? ("done" as const) : ("running" as const), cursor: nextCursor, isMock: batch.isMock, error: undefined, log: addLog(p, text + tail) };
      if (!multi) {
        return {
          ...common,
          total: batch.total ?? p.total ?? (batch.done ? batch.nextCursor : null),
          fetched: p.fetched + fetchedNow,
          // Batch 0 reports the whole exclusion count: assign (not add) so a replayed batch 0 stays idempotent.
          excludedPersonal: cursor === 0 ? batch.excluded : (p.excludedPersonal ?? 0) + batch.excluded,
        };
      }
      const list: CityProgress[] = cities.map((c, i) => p.cities?.[i] ?? { name: c.name, state: "pending", total: null, fetched: 0, excluded: 0 });
      const cur = list[cityIdx];
      list[cityIdx] = {
        ...cur,
        // A replayed earlier batch of a finished city never reopens it.
        state: batch.done || cur.state === "done" ? "done" : "running",
        total: batch.total ?? cur.total ?? (batch.done ? batch.nextCursor : null),
        fetched: cur.fetched + fetchedNow,
        excluded: cursor === 0 ? batch.excluded : cur.excluded + batch.excluded,
      };
      const totals = list.map((x) => x.total);
      return {
        ...common,
        city: nextCity,
        cities: list,
        // Known once every city reported its size; the UI shows per-city progress meanwhile.
        total: totals.every((t) => t !== null) ? totals.reduce<number>((a, t) => a + (t ?? 0), 0) : null,
        fetched: list.reduce((a, x) => a + x.fetched, 0),
        excludedPersonal: list.reduce((a, x) => a + x.excluded, 0),
      };
    });
    return { dedupe, created, fit, finished };
  });
  return {
    source,
    state: sourceDone ? "done" : "running",
    city: cityIdx,
    nextCity,
    cursor,
    nextCursor,
    done: sourceDone,
    total: batch.total,
    fetched: fetchedNow,
    newLeads: created.length,
    merged: dedupe.merged,
    fit,
    huntDone: finished,
  };
}

/* ---------- stream ---------- */

const ROW_LIMIT_DEFAULT = 3000;

export interface StreamOptions {
  /** Epoch ms of the last lead the client already has (0 = from the beginning). */
  since?: number;
  /** Status revision the client already holds; when equal, `updates` is omitted. */
  rev?: string;
  limit?: number;
}

export interface StreamResult extends StreamResponse {
  rev: string;
}

export async function getStream(db: AppDb, huntId: string, opts: StreamOptions = {}): Promise<StreamResult> {
  const [row] = await db
    .select({ hunt: hunts, icp: icpProfiles })
    .from(hunts)
    .innerJoin(icpProfiles, eq(icpProfiles.id, hunts.icpProfileId))
    .where(eq(hunts.id, huntId))
    .limit(1);
  if (!row) throw new HuntError("Búsqueda no encontrada", 404);
  const since = Math.max(0, Math.trunc(opts.since ?? 0));
  const limit = Math.min(Math.max(opts.limit ?? ROW_LIMIT_DEFAULT, 1), 10_000);
  const tsMs = sql<number>`(extract(epoch from date_trunc('milliseconds', ${leads.createdAt})) * 1000)::float8`;

  const page = await db
    .select({
      id: leads.id,
      status: leads.status,
      source: leads.primarySource,
      score: leads.fitScore,
      isDemo: leads.isDemo,
      name: companies.name,
      lat: companies.lat,
      lng: companies.lng,
      ts: tsMs,
    })
    .from(leads)
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(and(eq(leads.huntId, huntId), sql`${tsMs} > ${since}::float8`))
    .orderBy(asc(leads.createdAt), asc(leads.id))
    .limit(limit + 1);

  let rows = page;
  let hasMore = false;
  if (page.length > limit) {
    hasMore = true;
    // Never split rows that share a timestamp between two pages.
    const edge = page[limit].ts;
    const kept = page.slice(0, limit).filter((r) => r.ts !== edge);
    rows = kept.length ? kept : page.slice(0, limit);
  }
  const cursor = rows.length ? rows[rows.length - 1].ts : since;

  const grouped = await db
    .select({ source: leads.primarySource, status: leads.status, isDemo: leads.isDemo, n: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.huntId, huntId))
    .groupBy(leads.primarySource, leads.status, leads.isDemo);
  const progress = row.hunt.progress as { sources?: HuntSourcesProgress; dedupe?: DedupeProgress; autoEnrich?: boolean; enrichedAt?: string };
  const pairs: MergedPair[] = progress.dedupe?.pairs ?? [];
  const counters = countersFromGroups(grouped, pairs, Boolean((row.hunt.progress as { isDemo?: boolean }).isDemo));
  const rev = grouped
    .map((g) => `${g.status}:${g.n}`)
    .sort()
    .join("|");

  let updates: StatusUpdate[] = [];
  if (opts.rev !== rev) {
    const adv = await db
      .select({ id: leads.id, status: leads.status })
      .from(leads)
      .where(and(eq(leads.huntId, huntId), notInArray(leads.status, ["found", "disqualified", "opted_out"])));
    updates = adv.map((a) => ({ id: a.id, status: toPointStatus(a.status) }));
  }

  const criteria = row.icp.criteria as Partial<IcpCriteria>;
  const storedCities = Array.isArray(criteria.cities) && criteria.cities.length ? criteria.cities : criteria.city ? [{ name: criteria.city, ...(criteria.bbox ? { bbox: criteria.bbox } : {}) }] : [];
  const points: StreamPoint[] = rows.map((r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    status: toPointStatus(r.status),
    source: r.source,
    name: r.name,
    score: r.score,
  }));
  return {
    huntId,
    status: row.hunt.status,
    isDemo: Boolean((row.hunt.progress as { isDemo?: boolean }).isDemo),
    prompt: row.icp.prompt,
    city: String(criteria.city ?? ""),
    cities: storedCities.map((c) => ({ name: c.name, ...(c.bbox ? { bbox: c.bbox } : {}) })),
    area: areaLabel(criteria) ?? "",
    sector: String(criteria.sector ?? ""),
    cursor,
    hasMore,
    points,
    updates,
    counters,
    sources: progress.sources ?? {},
    enrich: { auto: progress.autoEnrich === true, doneAt: typeof progress.enrichedAt === "string" ? progress.enrichedAt : null },
    duplicates: { merged: pairs.filter((x) => !x.isMock).length, mock: pairs.filter((x) => x.isMock).length },
    rev,
  };
}

/**
 * Totals only add REAL leads (SPEC §7: mock/demo never mix with real). Mock/demo leads of a real hunt are reported
 * apart in `test`. A hunt that is entirely DEMO (`huntIsDemo`) shows its own total under the DEMO badge.
 */
export function countersFromGroups(
  groups: ReadonlyArray<{ source: string; status: string; isDemo?: boolean; n: number }>,
  pairs: readonly Pick<MergedPair, "mergedChannel" | "isMock">[],
  huntIsDemo = false,
): Counters {
  const out = computeCounters([], huntIsDemo ? pairs : []);
  let test: Counters["test"] = null;
  const add = (c: Counters["total"], status: StreamPoint["status"], n: number) => {
    c.found += n;
    if (status !== "found") c.fit += n;
    if (status === "contacted" || status === "qualified") c.contacted += n;
    if (status === "qualified") c.qualified += n;
  };
  for (const g of groups) {
    const status = toPointStatus(g.status);
    const src = (out.bySource[g.source] ??= { found: 0, fit: 0, contacted: 0, qualified: 0, duplicates: 0 });
    add(src, status, g.n);
    if (g.isDemo && !huntIsDemo) add((test ??= { found: 0, fit: 0, contacted: 0, qualified: 0, duplicates: 0 }), status, g.n);
    else add(out.total, status, g.n);
  }
  if (!huntIsDemo) {
    // Real pairs add to the totals; mock/demo pairs are reported apart in `test.duplicates`.
    for (const pr of pairs) {
      const row = (out.bySource[pr.mergedChannel] ??= { found: 0, fit: 0, contacted: 0, qualified: 0, duplicates: 0 });
      row.duplicates++;
      if (pr.isMock) (test ??= { found: 0, fit: 0, contacted: 0, qualified: 0, duplicates: 0 }).duplicates++;
      else out.total.duplicates++;
    }
  }
  out.test = test;
  return out;
}

/* ---------- lead detail (drawer) ---------- */

export async function getLeadDetail(db: AppDb, huntId: string, leadId: string) {
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.huntId, huntId))).limit(1);
  if (!lead) throw new HuntError("Lead no encontrado", 404);
  const [company] = await db.select().from(companies).where(eq(companies.id, lead.companyId)).limit(1);
  const [hunt] = await db
    .select({ progress: hunts.progress, icp: hunts.icpProfileId, threshold: icpProfiles.threshold })
    .from(hunts)
    .innerJoin(icpProfiles, eq(icpProfiles.id, hunts.icpProfileId))
    .where(eq(hunts.id, huntId))
    .limit(1);
  const [sources, contacts, assessment, evts, quals, costs] = await Promise.all([
    db.select().from(companySources).where(eq(companySources.companyId, lead.companyId)),
    db.select().from(contactPoints).where(eq(contactPoints.companyId, lead.companyId)),
    db.select().from(fitAssessments).where(and(eq(fitAssessments.companyId, lead.companyId), eq(fitAssessments.icpProfileId, hunt.icp))).orderBy(sql`${fitAssessments.createdAt} desc`).limit(1),
    db.select().from(events).where(eq(events.leadId, lead.id)).orderBy(asc(events.at)),
    db.select().from(qualifications).where(eq(qualifications.leadId, lead.id)).orderBy(sql`${qualifications.createdAt} desc`).limit(1),
    db.select().from(costEntries).where(eq(costEntries.leadId, lead.id)).orderBy(asc(costEntries.at)),
  ]);
  const pairs = ((hunt?.progress as { dedupe?: DedupeProgress })?.dedupe?.pairs ?? []).filter((p) => p.keptCompanyId === lead.companyId);
  const a = assessment[0];
  return {
    threshold: hunt.threshold,
    lead: { id: lead.id, status: toPointStatus(lead.status), rawStatus: lead.status, score: lead.fitScore, primarySource: lead.primarySource, isDemo: lead.isDemo, slug: lead.slug },
    company: { id: company.id, name: company.name, nit: company.nit, address: company.address, city: company.city, website: company.website, lat: company.lat, lng: company.lng, isLegalEntity: company.isLegalEntity, isDemo: company.isDemo },
    sources: sources.map((s) => ({ channel: s.sourceChannel, url: s.sourceUrl, license: s.license, isMock: s.isMock, fetchedAt: s.fetchedAt })),
    // Only generic company contacts are shown (SPEC §8): non-generic phones and emails are never returned.
    contacts: contacts.filter((c) => c.isGeneric).map((c) => ({ type: c.type, value: c.value, isGeneric: c.isGeneric, source: c.sourceChannel, evidenceUrl: c.evidenceUrl })),
    fit: a ? { score: a.score, criteria: a.criteriaMet, whyNow: a.whyNow, model: a.model } : null,
    merged: pairs.map((p) => ({ name: p.mergedName, channel: p.mergedChannel, reason: p.reason, similarity: p.similarity, distanceMeters: p.distanceMeters ?? null })),
    events: evts.map((e) => ({ type: e.type, at: e.at, isMock: e.isMock })),
    qualification: quals[0] ? { qualified: quals[0].qualified, origin: quals[0].origin, summary: quals[0].summary, score: quals[0].score, isMock: quals[0].isMock } : null,
    costs: costs.map((c) => ({ category: c.category, unit: c.unit, quantity: c.quantity, usd: c.usd, evidence: c.evidence, isMock: c.isMock, isDemo: c.isDemo })),
  };
}

export { isHuntSource };
