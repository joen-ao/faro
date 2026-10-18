import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@/db/schema";
import type { AppDb } from "@/db/types";
import { getAppShellData, todaysHours } from "@/features/app-shell/data";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
let db: AppDb;
const ids: Record<string, string> = {};

// Wed 2026-10-14 10:00 Bogotá (15:00 UTC): inside the Ley 2300 window.
const WED_10 = new Date("2026-10-14T15:00:00Z");

beforeAll(async () => {
  conn = await createTestDb();
  db = conn.db as unknown as AppDb;
  const [ws] = await db.insert(s.workspaces).values({ name: "Real" }).returning();
  const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "x", criteria: { sector: "clínicas dentales", city: "bogota" } }).returning();
  const hunt = async (key: string, day: number) => {
    const [h] = await db.insert(s.hunts).values({ icpProfileId: icp.id, status: "completed", createdAt: new Date(`2026-10-${String(day).padStart(2, "0")}T10:00:00Z`) }).returning();
    ids[key] = h.id;
  };
  await hunt("old", 10);
  await hunt("queuedHunt", 11);
  await hunt("empty", 12);
  await hunt("newest", 13);
  await hunt("demo", 14); // newest of all, but only demo leads: never listed or counted
  let i = 0;
  const lead = async (huntKey: string, status: (typeof s.leadStatusEnum.enumValues)[number], isDemo = false) => {
    i++;
    const [c] = await db.insert(s.companies).values({ name: `E${i}`, normalizedName: `e${i}`, isDemo }).returning();
    const [l] = await db.insert(s.leads).values({ companyId: c.id, huntId: ids[huntKey], status, primarySource: "osm", slug: `a${i}`, isDemo }).returning();
    return l.id;
  };
  await lead("old", "fit");
  const q1 = await lead("queuedHunt", "fit");
  const q2 = await lead("queuedHunt", "contacted");
  await lead("queuedHunt", "found");
  await lead("newest", "fit");
  const d = await lead("demo", "fit", true);
  await db.insert(s.messages).values([
    { leadId: q1, contactChannel: "email", status: "queued", body: "x" },
    { leadId: q2, contactChannel: "email", status: "queued", body: "x" },
    { leadId: d, contactChannel: "email", status: "queued", body: "x" },
  ] as never);
});
afterAll(async () => conn.close());

describe("getAppShellData", () => {
  it("counts real hunts, lists the 3 newest non-demo ones and links the contact view with a queue", async () => {
    const data = await getAppShellData(db, { SEND_ENABLED: "false" }, WED_10);
    expect(data.huntCount).toBe(4);
    expect(data.recent.map((r) => r.id)).toEqual([ids.newest, ids.empty, ids.queuedHunt]);
    expect(data.recent[2]).toMatchObject({ title: "Clínicas dentales", city: "Bogotá", status: "completed", fit: 2 });
    expect(data.queued).toBe(2);
    expect(data.contactHref).toBe(`/app/hunts/${ids.queuedHunt}/outreach`);
    expect(data.send).toEqual({ enabled: false, open: true, hours: "7:00–19:00" });
  });

  it("uses the saved panel window and SEND_ENABLED", async () => {
    await db.insert(s.appSettings).values({ key: "send_window", value: { policy: "custom", startHour: 8, endHour: 24, days: [0, 1, 2, 3, 4, 5, 6] } });
    const data = await getAppShellData(db, { SEND_ENABLED: "true" }, WED_10);
    expect(data.send).toEqual({ enabled: true, open: true, hours: "8:00–24:00" });
  });

  it("degrades to no counts without a DB or when a query fails", async () => {
    const none = await getAppShellData(null, { SEND_WINDOW_POLICY: "extendida" }, WED_10);
    expect(none).toMatchObject({ huntCount: null, queued: null, contactHref: "/app/hunts", recent: [], send: { enabled: false, hours: "8:00–20:00" } });
    const broken = { select: () => { throw new Error("down"); } } as unknown as AppDb;
    expect((await getAppShellData(broken, {}, WED_10)).huntCount).toBeNull();
  });
});

describe("todaysHours", () => {
  it("is null on a closed day", () => {
    const sunday = new Date("2026-10-18T15:00:00Z");
    expect(todaysHours({ policy: "ley2300" }, sunday)).toBeNull();
    expect(todaysHours({ policy: "custom", startHour: 9, endHour: 17, days: [1] }, sunday)).toBeNull();
  });
});
