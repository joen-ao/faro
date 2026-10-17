import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import * as s from "@/db/schema";
import type { AppDb, ContactChannel, CostCategory, SourceChannel } from "@/db/types";

interface DemoSource {
  src: SourceChannel;
  found: number;
  fit: number;
  contacted: number;
  responded: number;
  qualified: number;
  /** USD per lead by category */
  data: number;
  ai: number;
  ads?: number;
}

const SOURCES: DemoSource[] = [
  { src: "reps", found: 26, fit: 18, contacted: 14, responded: 7, qualified: 4, data: 0.012, ai: 0.031 },
  { src: "rues", found: 22, fit: 12, contacted: 9, responded: 3, qualified: 1, data: 0.012, ai: 0.031 },
  { src: "osm", found: 34, fit: 15, contacted: 11, responded: 3, qualified: 1, data: 0.0, ai: 0.031 },
  { src: "google_places", found: 18, fit: 13, contacted: 10, responded: 5, qualified: 3, data: 0.032, ai: 0.031 },
  { src: "meta_ads", found: 12, fit: 12, contacted: 0, responded: 9, qualified: 5, data: 0, ai: 0.012, ads: 3.4 },
];

/**
 * Throwaway in-memory DB with a full DEMO dataset (every row is_demo + is_mock) so the dashboard
 * can show a filled state when the real DB has none. It never touches the persistent DB.
 */
async function build(): Promise<AppDb> {
  const conn = createDb("", "memory://");
  await migrate(conn);
  const db = conn.db as unknown as AppDb;
  const flag = { isDemo: true, isMock: true };
  const [ws] = await db.insert(s.workspaces).values({ name: "Demo" }).returning();
  const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "demo", threshold: 60 }).returning();
  const [hunt] = await db.insert(s.hunts).values({ icpProfileId: icp.id }).returning();

  const msgs: (typeof s.messages.$inferInsert)[] = [];
  const evs: (typeof s.events.$inferInsert)[] = [];
  const quals: (typeof s.qualifications.$inferInsert)[] = [];
  const costs: (typeof s.costEntries.$inferInsert)[] = [];

  for (const d of SOURCES) {
    const companies = await db
      .insert(s.companies)
      .values(Array.from({ length: d.found }, (_, i) => ({ name: `Demo ${d.src} ${String(i + 1).padStart(2, "0")} SAS`, normalizedName: `demo ${d.src} ${i}`, isDemo: true })))
      .returning();
    const leads = await db
      .insert(s.leads)
      .values(companies.map((c, i) => ({ companyId: c.id, huntId: hunt.id, primarySource: d.src, slug: `demo-${d.src}-${i + 1}`, fitScore: i < d.fit ? 72 + (i % 20) : 35, isDemo: true })))
      .returning();
    leads.forEach((l, i) => {
      const cost = (category: CostCategory, usd: number, unit: string, contact?: ContactChannel, evidence?: string) =>
        costs.push({ leadId: l.id, huntId: hunt.id, sourceChannel: d.src, contactChannel: contact ?? null, category, quantity: 1, unit, rate: usd, usd, evidence: evidence ?? "demo", ...flag });
      if (d.data) cost("data", d.data, "consulta", undefined, "Consulta prorrateada (demo)");
      cost("ai", d.ai, "puntaje + mensaje", undefined, "Tokens Anthropic (demo)");
      if (d.ads && i < d.fit) cost("ads", d.ads, "campaña", "dapta_widget", "ad_spend ÷ leads por UTM (demo)");
      if (i < d.contacted) {
        const channel: ContactChannel = i % 4 === 3 ? "whatsapp" : "email";
        msgs.push({ leadId: l.id, contactChannel: channel, body: "Demo", status: "sent", sentAt: new Date(), isMock: true });
        cost(channel === "email" ? "email" : "whatsapp", channel === "email" ? 0.0004 : 0.0125, channel === "email" ? "correo" : "plantilla", channel);
      }
      if (i < d.responded) evs.push({ leadId: l.id, type: d.src === "meta_ads" ? "widget_chat" : "reply", ...flag });
      if (i < d.qualified) quals.push({ leadId: l.id, origin: "fallback", qualified: true, score: 80, ...flag });
    });
  }
  for (const chunk of [msgs, evs, quals, costs]) {
    for (let i = 0; i < chunk.length; i += 200) {
      const part = chunk.slice(i, i + 200);
      if (chunk === msgs) await db.insert(s.messages).values(part as (typeof msgs)[number][]);
      else if (chunk === evs) await db.insert(s.events).values(part as (typeof evs)[number][]);
      else if (chunk === quals) await db.insert(s.qualifications).values(part as (typeof quals)[number][]);
      else await db.insert(s.costEntries).values(part as (typeof costs)[number][]);
    }
  }
  return db;
}

let cached: Promise<AppDb> | undefined;
/** Memoized ephemeral demo DB (in memory, lives as long as the server process). */
export function getDemoDb(): Promise<AppDb> {
  cached ??= build().catch((e) => {
    cached = undefined;
    throw e;
  });
  return cached;
}
