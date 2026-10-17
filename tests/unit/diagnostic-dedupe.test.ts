import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { companies, events, leads } from "@/db/schema";
import { recordContact } from "@/features/diagnostic/data";
import { createTestDb } from "../helpers/test-db";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(() => t.close());

const form = (company: string, email: string) => ({ slug: "icp:clinicas-dentales-bogota", company, email, message: "Hola, queremos info.", consent: true as const });

describe("ICP inbound dedupe (PGlite)", () => {
  it("reuses the lead for the same normalized company name and for the same non-shared email domain", async () => {
    await recordContact(form("Clínica Dental Norte SAS", "info@norte.co"), { c: "dapta_widget" }, "clinicas-dentales-bogota", t.db);
    await recordContact(form("CLINICA dental norte sas", "citas@otro.co"), {}, "clinicas-dentales-bogota", t.db);
    await recordContact(form("Otro nombre SAS", "info@norte.co"), {}, "clinicas-dentales-bogota", t.db);
    expect(await t.db.select().from(leads)).toHaveLength(1);
    const ev = await t.db.select().from(events);
    expect(ev).toHaveLength(3);
    expect(ev.every((e) => e.type === "form_submit")).toBe(true);
  });

  it("does not merge different companies sharing gmail.com", async () => {
    await recordContact(form("Sonrisas Uno SAS", "info@gmail.com"), {}, "clinicas-dentales-bogota", t.db);
    await recordContact(form("Sonrisas Dos SAS", "citas@gmail.com"), {}, "clinicas-dentales-bogota", t.db);
    expect(await t.db.select().from(leads)).toHaveLength(3);
  });

  it("stores a legal-entity-looking name as legal (por verificar) and a personal-looking name as not legal", async () => {
    await recordContact(form("Clínica Dental Sur SAS", "info@sur.co"), {}, "clinicas-dentales-bogota", t.db);
    await recordContact(form("Dr. Juan Pérez", "info@perez.co"), {}, "clinicas-dentales-bogota", t.db);
    const sur = await t.db.select().from(companies).where(eq(companies.normalizedName, "clinica dental sur sas"));
    const dr = await t.db.select().from(companies).where(eq(companies.normalizedName, "dr juan perez"));
    expect(sur[0].isLegalEntity).toBe(true);
    expect(dr[0].isLegalEntity).toBe(false);
  });
});
