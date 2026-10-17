import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import * as s from "@/db/schema";
import { seedCostRates } from "@/db/seed";
import { prorateSharedCost, recordCost, recordDaptaCost, recordHumanCost, recordPlacesCost } from "./costs";
import { getLeadReceipt, type LeadReceipt } from "./receipt";

/**
 * Builds a throwaway in-memory DB with one fully itemized DEMO lead (every category) and returns its receipt.
 * Everything is flagged is_demo / is_mock: it never touches the persistent DB.
 */
export async function buildDemoReceipt(): Promise<LeadReceipt> {
  const conn = createDb("", "memory://");
  try {
    await migrate(conn);
    const { db } = conn;
    await seedCostRates(db);
    const demo = { isDemo: true, isMock: true };
    const [ws] = await db.insert(s.workspaces).values({ name: "Demo" }).returning();
    const [icp] = await db.insert(s.icpProfiles).values({ workspaceId: ws.id, prompt: "demo" }).returning();
    const [hunt] = await db.insert(s.hunts).values({ icpProfileId: icp.id }).returning();
    const companies = await db
      .insert(s.companies)
      .values(["Clinica Dental Demo Uno SAS", "Odontologia Demo Dos SAS", "Sonrisas Demo Tres SAS"].map((name, i) => ({ name, normalizedName: `demo ${i}`, isDemo: true })))
      .returning();
    const leads = await db
      .insert(s.leads)
      .values(companies.map((c, i) => ({ companyId: c.id, huntId: hunt.id, primarySource: "osm" as const, slug: `demo-${i}`, fitScore: 82, isDemo: true })))
      .returning();
    const [lead] = leads;

    await prorateSharedCost(db, { huntId: hunt.id, sourceChannel: "osm", category: "scraping", totalUsd: 1, leadIds: leads.map((l) => l.id), evidence: "Corrida Apify demo (usageTotalUsd 1.00)", ...demo });
    await recordPlacesCost(db, { leadId: lead.id, calls: 2, freeTier: true, ...demo });
    await recordCost(db, { leadId: lead.id, sourceChannel: "osm", category: "ai", quantity: 3200, unit: "tokens in", rate: 0.000003, evidence: "msg_demo_01 · puntaje de fit", ...demo });
    await recordCost(db, { leadId: lead.id, sourceChannel: "osm", category: "ai", quantity: 450, unit: "tokens out", rate: 0.000015, evidence: "msg_demo_01 · mensaje generado", ...demo });
    await recordCost(db, { leadId: lead.id, sourceChannel: "osm", contactChannel: "email", category: "email", quantity: 1, unit: "email", rate: 0.0004, usd: 0, evidence: "Resend demo (tier gratuito)", ...demo });
    await recordCost(db, { leadId: lead.id, sourceChannel: "osm", contactChannel: "whatsapp", category: "whatsapp", quantity: 1, unit: "template", rate: 0.0125, evidence: "Plantilla de marketing demo", ...demo });
    await recordDaptaCost(db, { leadId: lead.id, aiReplies: 2, conversationId: "demo-conv-1", ...demo });
    await recordCost(db, { leadId: lead.id, sourceChannel: "osm", category: "ads", quantity: 1, unit: "share", rate: 0.35, evidence: "campaña demo: ad_spend ÷ leads por UTM", ...demo });
    await recordHumanCost(db, { leadId: lead.id, minutes: 3, ...demo });
    const receipt = await getLeadReceipt(db, lead.id);
    if (!receipt) throw new Error("demo lead missing");
    return receipt;
  } finally {
    await conn.close();
  }
}
