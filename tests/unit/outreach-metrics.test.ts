import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies, events, hunts, icpProfiles, leads, messages, workspaces } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { getOutreachMetrics } from "@/features/metrics/outreach";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-10-24T20:00:00Z");
const at = (h: number) => new Date(NOW.getTime() - h * 3600_000);

describe("F26 · outreach metrics", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  let huntId: string;
  let n = 0;
  const mk = async (o: { demo?: boolean; status?: "fit" | "contacted" | "responded" | "qualified" } = {}) => {
    n++;
    const [c] = await db.insert(companies).values({ name: `Empresa ${n}`, normalizedName: `empresa ${n}`, isDemo: o.demo ?? false }).returning();
    const [l] = await db.insert(leads).values({ companyId: c!.id, huntId, status: o.status ?? "contacted", primarySource: "rues", slug: `m-${n}`, isDemo: o.demo ?? false }).returning();
    return l!.id;
  };
  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
    const [ws] = await db.insert(workspaces).values({ name: "Mokub", country: "CO" }).returning();
    const [icp] = await db.insert(icpProfiles).values({ workspaceId: ws!.id, prompt: "x", criteria: {} }).returning();
    const [h] = await db.insert(hunts).values({ icpProfileId: icp!.id }).returning();
    huntId = h!.id;
  }, 60_000);
  afterAll(async () => {
    await conn.close();
  });

  it("counts companies per channel, opens and replies after contact, never demo or mock", async () => {
    const a = await mk({ status: "qualified" });
    const b = await mk();
    const w = await mk({ status: "responded" });
    const d = await mk({ demo: true });
    await db.insert(messages).values([
      { leadId: a, contactChannel: "email", body: "x", status: "sent", sentAt: at(30) },
      { leadId: a, contactChannel: "email", body: "x", status: "sent", sentAt: at(20) },
      { leadId: b, contactChannel: "email", body: "x", status: "simulated", isMock: true },
      { leadId: b, contactChannel: "email", body: "x", status: "failed" },
      { leadId: w, contactChannel: "whatsapp", body: "x", status: "sent", sentAt: at(5) },
      { leadId: d, contactChannel: "email", body: "x", status: "sent", sentAt: at(5) },
    ]);
    await db.insert(events).values([
      { leadId: a, type: "click", payload: { kind: "page_view" }, at: at(29) },
      { leadId: a, type: "click", payload: { kind: "page_view" }, at: at(28) },
      { leadId: w, type: "click", payload: { kind: "page_view" }, at: at(10) },
      { leadId: w, type: "reply", payload: { via: "whatsapp" }, at: at(4) },
      { leadId: d, type: "reply", payload: {}, at: at(4), isDemo: true },
    ]);
    const m = await getOutreachMetrics(db, { now: NOW });
    expect(m.byChannel.email).toMatchObject({ contacted: 1, opened: 1, replied: 0, qualified: 1, failed: 1, simulated: 0, openRate: 100 });
    // The open came before the WhatsApp: it does not count as an open of that message.
    expect(m.byChannel.whatsapp).toMatchObject({ contacted: 1, opened: 0, replied: 1, replyRate: 100 });
    expect(m.totals).toMatchObject({ contacted: 2, replied: 1 });
    expect(m.days).toHaveLength(14);
    expect(m.days.at(-1)!.day).toBe("2026-10-24");
    expect(m.days.reduce((s, d) => s + d.sent, 0)).toBe(3);
    expect(m.recentReplies).toEqual([{ company: "Empresa 3", channel: "whatsapp", via: "whatsapp", at: at(4).toISOString() }]);
  });
});
