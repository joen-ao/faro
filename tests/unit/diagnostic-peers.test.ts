import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import { peerSites } from "@/features/diagnostic/data";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
let huntId: string;
let otherHunt: string;
let selfId: string;

async function company(name: string, opts: { isDemo?: boolean; signals?: Record<string, unknown> | null; mock?: boolean; pages?: number; hunt?: string; leadDemo?: boolean; cps?: ("whatsapp" | "web_form")[] }) {
  const [c] = await db.insert(s.companies).values({ name, normalizedName: name.toLowerCase(), isDemo: opts.isDemo ?? false }).returning();
  if (opts.signals !== null) {
    await db.insert(s.companySources).values({
      companyId: c.id,
      sourceChannel: "website",
      externalId: `website:${c.id}`,
      raw: { fetchedPages: opts.pages ?? 2, signals: opts.signals ?? {} },
      isMock: opts.mock ?? false,
    });
  }
  for (const t of opts.cps ?? []) await db.insert(s.contactPoints).values({ companyId: c.id, type: t, value: `${t}-${c.id}`, sourceChannel: "website" });
  await db.insert(s.leads).values({ companyId: c.id, huntId: opts.hunt ?? huntId, primarySource: "osm", slug: `s-${c.id.slice(0, 8)}`, isDemo: opts.leadDemo ?? false });
  return c.id;
}

beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
  const [ws] = await db.insert(s.workspaces).values({ name: "W" }).returning();
  const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "clinicas" }).returning();
  [{ id: huntId }, { id: otherHunt }] = await db.insert(s.hunts).values([{ icpProfileId: icp.id }, { icpProfileId: icp.id }]).returning();
  selfId = await company("Self", { signals: { onlineBooking: true } });
  await company("A", { signals: { onlineBooking: true, copyrightYear: 2026 }, cps: ["whatsapp"] });
  await company("B", { signals: { hasContactForm: true } });
  await company("C", { signals: {}, cps: ["web_form"] });
  await company("Demo", { isDemo: true, signals: { onlineBooking: true } });
  await company("DemoLead", { leadDemo: true, signals: { onlineBooking: true } });
  await company("Mock", { mock: true, signals: { onlineBooking: true } });
  await company("NoPages", { pages: 0, signals: { onlineBooking: true } });
  await company("NoSite", { signals: null });
  await company("Other hunt", { hunt: otherHunt, signals: { onlineBooking: true } });
}, 60_000);
afterAll(() => conn.close());

describe("peerSites", () => {
  it("only real, enriched peers of the same hunt, excluding the company itself", async () => {
    const peers = await peerSites(db, huntId, selfId);
    expect(peers).toHaveLength(3);
    const sorted = [...peers].sort((a, b) => Number(b.onlineBooking) - Number(a.onlineBooking) || Number(b.whatsapp) - Number(a.whatsapp));
    expect(sorted[0]).toEqual({ onlineBooking: true, whatsapp: true, form: false, copyrightYear: 2026 });
    expect(peers.filter((p) => p.form)).toHaveLength(2); // signal or web_form contact point
    expect(peers.some((p) => p.onlineBooking && !p.whatsapp)).toBe(false);
  });
});
