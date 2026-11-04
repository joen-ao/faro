import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies, events, leads, messages, qualifications } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { filtersQuery, parseFilters, resolveWindow } from "@/features/dashboard/filters";
import { bucketKeys, getProspecting, matchesLead } from "@/features/dashboard/prospecting";
import { createTestDb } from "../helpers/test-db";

// Tuesday 2026-11-03, 17:00 Bogotá.
const NOW = new Date("2026-11-03T22:00:00Z");

describe("F43 · filters", () => {
  it("reads the URL with safe defaults and keeps old ?range links", () => {
    expect(parseFilters({})).toMatchObject({ period: "30", channel: "all", segment: "all", huntId: null });
    expect(parseFilters({ range: "7" }).period).toBe("7");
    expect(parseFilters({ periodo: "nope", canal: "fax", busqueda: "x" })).toMatchObject({ period: "30", channel: "all", huntId: null });
    expect(parseFilters({ periodo: "custom", desde: "2026-11-05", hasta: "2026-11-01" }).period).toBe("30");
    expect(filtersQuery(parseFilters({ periodo: "hoy", canal: "email" }))).toBe("?periodo=hoy&canal=email");
  });

  it("today compares with yesterday up to the same hour; presets count today", () => {
    const hoy = resolveWindow(parseFilters({ periodo: "hoy" }), NOW);
    expect(hoy.from.toISOString()).toBe("2026-11-03T05:00:00.000Z");
    expect(hoy.prevFrom.toISOString()).toBe("2026-11-02T05:00:00.000Z");
    expect(hoy.prevTo.toISOString()).toBe("2026-11-02T22:00:00.000Z");
    const ayer = resolveWindow(parseFilters({ periodo: "ayer" }), NOW);
    expect([ayer.from.toISOString(), ayer.to.toISOString()]).toEqual(["2026-11-02T05:00:00.000Z", "2026-11-03T05:00:00.000Z"]);
    const seven = resolveWindow(parseFilters({ periodo: "7" }), NOW);
    expect(seven.from.toISOString()).toBe("2026-10-28T05:00:00.000Z");
    expect(seven.bucket).toBe("day");
    expect(bucketKeys(seven)).toHaveLength(7);
    expect(resolveWindow(parseFilters({ periodo: "90" }), NOW).bucket).toBe("week");
    const custom = resolveWindow(parseFilters({ periodo: "custom", desde: "2026-10-01", hasta: "2026-10-10" }), NOW);
    expect(custom.days).toBe(10);
    expect(custom.prevTo.toISOString()).toBe(custom.from.toISOString());
  });

  it("channel, segment and hunt filters", () => {
    const l = { ch: "email" as const, legal: false, huntId: "h1" };
    expect(matchesLead(l, parseFilters({ canal: "email" }))).toBe(true);
    expect(matchesLead(l, parseFilters({ canal: "whatsapp" }))).toBe(false);
    expect(matchesLead(l, parseFilters({ segmento: "empresas" }))).toBe(false);
    expect(matchesLead({ ...l, ch: "meta" }, parseFilters({ canal: "meta" }))).toBe(true);
  });
});

describe("F43 · prospecting funnel", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  let n = 0;
  const mk = async (o: { legal?: boolean; sentAt?: Date; delivered?: boolean; opened?: boolean; replied?: boolean; meeting?: boolean; qualified?: boolean; demo?: boolean }) => {
    n++;
    const [c] = await db.insert(companies).values({ name: `Empresa ${n}`, normalizedName: `empresa ${n}`, city: n % 2 ? "Bogotá" : "Bogota", isLegalEntity: o.legal ?? true, isDemo: !!o.demo }).returning();
    const [l] = await db.insert(leads).values({ companyId: c!.id, status: "contacted", primarySource: "rues", slug: `f43-${n}`, isDemo: !!o.demo }).returning();
    const at = o.sentAt ?? new Date("2026-11-03T15:00:00Z");
    await db.insert(messages).values({ leadId: l!.id, contactChannel: "email", body: "x", status: o.delivered ? "delivered" : "sent", sentAt: at, createdAt: at });
    const ev = (type: "delivered" | "widget_open" | "reply" | "meeting_booked", mins: number) => db.insert(events).values({ leadId: l!.id, type, at: new Date(at.getTime() + mins * 60_000) });
    if (o.delivered) await ev("delivered", 1);
    if (o.opened) await ev("widget_open", 30);
    if (o.replied) await ev("reply", 60);
    if (o.meeting) await ev("meeting_booked", 90);
    if (o.qualified) await db.insert(qualifications).values({ leadId: l!.id, origin: "dapta", qualified: true, createdAt: new Date(at.getTime() + 95 * 60_000) });
  };
  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
    await mk({ delivered: true, opened: true, replied: true, meeting: true, qualified: true });
    await mk({ delivered: true, opened: true });
    await mk({ delivered: true, legal: false });
    await mk({});
    await mk({ demo: true, delivered: true, opened: true });
    await mk({ sentAt: new Date("2026-10-01T15:00:00Z"), delivered: true });
  }, 60_000);
  afterAll(() => conn.close());

  it("follows today's cohort step by step, without demo data", async () => {
    const f = parseFilters({ periodo: "hoy" });
    const p = await getProspecting(db, f, resolveWindow(f, NOW), { now: NOW });
    expect(p.funnel.map((s) => s.value)).toEqual([4, 3, 2, 1, 1, 1]);
    expect(p.funnel[1]!.rate).toBe(0.75);
    expect(p.results.meetings.value).toBe(1);
    expect(p.results.qualified.value).toBe(1);
    expect(p.breakdown.segment.map((r) => [r.key, r.contacted])).toEqual([
      ["empresas", 3],
      ["independientes", 1],
    ]);
    // "Bogotá" and "Bogota" are one city.
    expect(p.breakdown.city).toHaveLength(1);
  });

  it("segment filter narrows every section", async () => {
    const f = parseFilters({ periodo: "hoy", segmento: "independientes" });
    const p = await getProspecting(db, f, resolveWindow(f, NOW), { now: NOW });
    expect(p.funnel[0]!.value).toBe(1);
    expect(p.results.meetings.value).toBe(0);
  });
});
