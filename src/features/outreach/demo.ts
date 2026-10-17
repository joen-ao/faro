import { eq, inArray } from "drizzle-orm";
import { companies, companySources, contactPoints, hunts, icpProfiles, leads, workspaces } from "@/db/schema";
import { seed } from "@/db/seed";
import type { AppDb } from "@/db/types";
import { suppress } from "@/features/compliance/suppression";

const EXTRA = [
  { name: "Dental Norte Demo SAS", email: "citas@dental-norte-demo.example", form: "https://dental-norte-demo.example/contacto", legal: true, score: 88 },
  { name: "Sonrisa Plena Demo SAS", email: null, form: "https://sonrisa-plena-demo.example/contacto", legal: true, score: 81 },
  { name: "Centro Oral Demo SAS", email: "carlos.perez@centro-oral-demo.example", form: null, legal: true, score: 77 },
  { name: "Consultorio Independiente Demo", email: "info@consultorio-demo.example", form: null, legal: false, score: 64 },
  { name: "Suprimida Demo SAS", email: "info@suprimida-demo.example", form: null, legal: true, score: 72 },
] as const;

/** Idempotent. Everything is is_demo / is_mock: it never counts in real totals. Returns the demo hunt id. */
export async function ensureOutreachDemo(db: AppDb): Promise<string> {
  await seed(db);
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.name, "Demo Workspace")).limit(1);
  const [icp] = await db.select().from(icpProfiles).where(eq(icpProfiles.workspaceId, ws!.id)).limit(1);
  const [hunt] = await db.select().from(hunts).where(eq(hunts.icpProfileId, icp!.id)).limit(1);
  const existing = await db.select({ id: companies.id }).from(companies).where(inArray(companies.name, EXTRA.map((e) => e.name)));
  if (existing.length === 0) {
    for (const [i, e] of EXTRA.entries()) {
      const [c] = await db
        .insert(companies)
        .values({ name: e.name, normalizedName: e.name.toLowerCase(), city: "Bogota", isLegalEntity: e.legal, isDemo: true, website: `https://${e.name.split(" ")[0]!.toLowerCase()}-demo.example` })
        .returning();
      await db.insert(companySources).values({ companyId: c!.id, sourceChannel: "sample", externalId: `demo-extra-${i}`, raw: { demo: true }, license: "demo", isMock: true });
      if (e.email) await db.insert(contactPoints).values({ companyId: c!.id, type: "email", value: e.email, isGeneric: !/carlos/.test(e.email), sourceChannel: "sample" });
      if (e.form) await db.insert(contactPoints).values({ companyId: c!.id, type: "web_form", value: e.form, isGeneric: true, sourceChannel: "sample" });
      await db.insert(leads).values({ companyId: c!.id, huntId: hunt!.id, status: "fit", primarySource: "sample", fitScore: e.score, slug: `demo-outreach-${i + 1}`, isDemo: true });
    }
    await suppress(db, "suprimida-demo.example", "demo: opt-out previo");
  }
  return hunt!.id;
}
