import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { companies, companySources, contactPoints, hunts, icpProfiles, leads, rneChecks, workspaces } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { evaluateOutreach } from "@/features/compliance/evaluate";
import { importRneResult, normalizeRneValue, rneExportCsv, rnePending, rneStatus, statusOf } from "@/features/compliance/rne";
import { independentCandidates } from "@/features/outreach/daily";
import { createTestDb } from "../helpers/test-db";

const NOW = new Date("2026-11-18T15:00:00Z"); // martes 10:00 Bogotá

describe("F55 · RNE values", () => {
  it("normalizes emails and Colombian phones, rejects the rest", () => {
    expect(normalizeRneValue(" Dana.Soriano@Gmail.com ")).toEqual({ kind: "email", value: "dana.soriano@gmail.com" });
    expect(normalizeRneValue("+57 310 555 0101")).toEqual({ kind: "phone", value: "+573105550101" });
    expect(normalizeRneValue("6013133760")).toEqual({ kind: "phone", value: "+576013133760" });
    expect(normalizeRneValue("12345")).toBeNull();
  });
  it("is clear only when not excluded and checked in the last 30 days", () => {
    expect(statusOf(undefined, NOW)).toBe("pending");
    expect(statusOf({ excluded: true, checkedAt: NOW }, NOW)).toBe("excluded");
    expect(statusOf({ excluded: false, checkedAt: new Date("2026-11-01T00:00:00Z") }, NOW)).toBe("clear");
    expect(statusOf({ excluded: false, checkedAt: new Date("2026-10-01T00:00:00Z") }, NOW)).toBe("pending");
  });
  it("exports one value per line, phones without +57, deduplicated", () => {
    expect(rneExportCsv(["a@x.co", "A@x.co", "+573105550101", "nada"])).toBe("dato\na@x.co\n3105550101\n");
  });
});

describe("F55 · compliance gate for natural persons", () => {
  const base = { country: "CO" as const, isLegalEntity: false, suppressed: false, alreadyContacted: false };
  const email = { channel: "email" as const, value: "dana.soriano@gmail.com" };
  it("blocks without a clear RNE check, allows a personal email once clear, never when excluded", () => {
    expect(evaluateOutreach(base, email, NOW).blocks.map((b) => b.rule)).toEqual(["rne_pending"]);
    expect(evaluateOutreach({ ...base, rne: "clear" }, email, NOW).allowed).toBe(true);
    expect(evaluateOutreach({ ...base, rne: "excluded" }, email, NOW).blocks.map((b) => b.rule)).toEqual(["rne_excluded"]);
    // Companies are unaffected.
    expect(evaluateOutreach({ ...base, isLegalEntity: true }, { channel: "email", value: "info@x.co" }, NOW).allowed).toBe(true);
  });
});

describe("F55 · import, pending and daily candidates", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  let huntId: string;
  const leadIds: Record<string, string> = {};
  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
    const [ws] = await db.insert(workspaces).values({ name: "Mokub", country: "CO" }).returning();
    const [icp] = await db.insert(icpProfiles).values({ workspaceId: ws!.id, prompt: "x", criteria: { sector: "odontologia", city: "Bogota" } }).returning();
    const [h] = await db.insert(hunts).values({ icpProfileId: icp!.id }).returning();
    huntId = h!.id;
    for (const [key, mail, phone] of [["dana", "dana.soriano@gmail.com", "3105550101"], ["luis", "luis.p@hotmail.com", "3115550102"], ["ana", "ana.r@gmail.com", null]] as const) {
      const [c] = await db.insert(companies).values({ name: key.toUpperCase() + " PEREZ GOMEZ", normalizedName: key, isLegalEntity: false }).returning();
      await db.insert(companySources).values({ companyId: c!.id, sourceChannel: "reps", externalId: `i-${key}`, isMock: false });
      await db.insert(contactPoints).values({ companyId: c!.id, type: "email", value: mail, isGeneric: false });
      if (phone) await db.insert(contactPoints).values({ companyId: c!.id, type: "phone", value: phone, isGeneric: false });
      const [l] = await db.insert(leads).values({ companyId: c!.id, huntId, status: "fit", primarySource: "reps", fitScore: 80, slug: `ind-${key}` }).returning();
      leadIds[key] = l!.id;
    }
  }, 60_000);
  afterAll(async () => {
    await conn.close();
  });

  it("lists every personal contact as pending before any check", async () => {
    const p = await rnePending(db, NOW);
    expect(p.pending).toBe(5);
    expect(p.values).toContain("+573105550101");
  });

  it("refuses a file whose exclusion column it cannot recognize, and stores nothing", async () => {
    const r = await importRneResult(db, "dato;fecha\ndana.soriano@gmail.com;2026-11-18\n", NOW);
    expect(r).toMatchObject({ ok: false, checked: 0, headers: ["dato", "fecha"] });
    expect(await rneStatus(db, "dana.soriano@gmail.com", NOW)).toBe("pending");
  });

  it("imports per-channel results; excluded values are never contacted, clear ones become candidates", async () => {
    const csv = [
      "Dato;Correo Electronico;SMS;Llamadas;Mensajeria Aplicaciones",
      "dana.soriano@gmail.com;NO;NO;NO;NO",
      "luis.p@hotmail.com;SI;NO;NO;NO",
      "3105550101;NO;NO;NO;NO",
      "ana.r@gmail.com;NO;NO;NO;NO",
    ].join("\n");
    const r = await importRneResult(db, csv, NOW);
    expect(r).toMatchObject({ ok: true, checked: 4, excluded: 1 });
    expect(await rneStatus(db, "LUIS.P@hotmail.com", NOW)).toBe("excluded");
    expect(await rneStatus(db, "+57 310 555 0101", NOW)).toBe("clear");
    const p = await rnePending(db, NOW);
    expect(p).toMatchObject({ pending: 1, clear: 3, excluded: 1 });
    const cands = await independentCandidates(db, { enabled: true, emailsPerDay: 30, huntIds: null }, 10, NOW);
    expect(cands.sort()).toEqual([leadIds.ana, leadIds.dana].sort());
    // A month later the check is stale: nobody is a candidate until checked again.
    expect(await independentCandidates(db, { enabled: true, emailsPerDay: 30, huntIds: null }, 10, new Date("2027-01-05T15:00:00Z"))).toEqual([]);
    expect((await db.select().from(rneChecks)).length).toBe(4);
  });
});
