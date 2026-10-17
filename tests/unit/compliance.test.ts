import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HOLIDAYS_CO_2026 } from "@/config/holidays-co-2026";
import { checkSendWindow } from "@/features/compliance/windows";
import { isGenericEmail, isLegalEntity, looksLikePersonalEmail } from "@/features/compliance/email";
import { isSuppressed, suppress } from "@/features/compliance/suppression";
import { applyOptOut, createOptOutToken, verifyOptOutToken } from "@/features/compliance/optout";
import { evaluateOutreach } from "@/features/compliance/evaluate";
import { computeComplianceMetrics, queryComplianceMetrics } from "@/features/compliance/metrics";
import { companies, contactPoints, leads, messages } from "@/db/schema";
import { createTestDb } from "../helpers/test-db";

const bog = (iso: string) => new Date(`${iso}-05:00`); // Bogotá wall time

describe("checkSendWindow (CO)", () => {
  it("blocks Sunday", () => {
    const r = checkSendWindow(bog("2026-10-18T12:00:00"), "CO");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Domingo/);
    expect(r.nextAllowedAt).toEqual(bog("2026-10-19T07:00:00"));
  });
  it.each(["2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25"])("blocks holiday %s", (d) => {
    const r = checkSendWindow(bog(`${d}T10:00:00`), "CO");
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/Festivo/);
  });
  it("skips holidays when computing next opening", () => {
    // Thu 24 Dec 20:00 -> 25 Dec holiday -> Sat 26 Dec 8:00
    expect(checkSendWindow(bog("2026-12-24T20:00:00"), "CO").nextAllowedAt).toEqual(bog("2026-12-26T08:00:00"));
    // Sat 14 Nov 15:01 -> Sun -> Mon 16 Nov holiday -> Tue 17 Nov 7:00
    expect(checkSendWindow(bog("2026-11-14T15:01:00"), "CO").nextAllowedAt).toEqual(bog("2026-11-17T07:00:00"));
  });
  it("blocks Saturday 15:01 and allows 14:59", () => {
    expect(checkSendWindow(bog("2026-10-17T15:01:00"), "CO").allowed).toBe(false);
    expect(checkSendWindow(bog("2026-10-17T14:59:00"), "CO").allowed).toBe(true);
    expect(checkSendWindow(bog("2026-10-17T07:59:00"), "CO").allowed).toBe(false);
    expect(checkSendWindow(bog("2026-10-17T08:00:00"), "CO").allowed).toBe(true);
  });
  it("blocks Monday 6:59, allows 7:00 and 18:59, blocks 19:00", () => {
    const early = checkSendWindow(bog("2026-10-19T06:59:00"), "CO");
    expect(early.allowed).toBe(false);
    expect(early.nextAllowedAt).toEqual(bog("2026-10-19T07:00:00"));
    expect(checkSendWindow(bog("2026-10-19T07:00:00"), "CO").allowed).toBe(true);
    expect(checkSendWindow(bog("2026-10-19T18:59:00"), "CO").allowed).toBe(true);
    expect(checkSendWindow(bog("2026-10-19T19:00:00"), "CO").nextAllowedAt).toEqual(bog("2026-10-20T07:00:00"));
  });
  it("uses Bogotá time regardless of UTC date", () => {
    // 2026-10-19T01:00Z is Sunday 20:00 in Bogotá
    expect(checkSendWindow(new Date("2026-10-19T01:00:00Z"), "CO").allowed).toBe(false);
  });
  it("US has no time window", () => {
    expect(checkSendWindow(bog("2026-10-18T03:00:00"), "US").allowed).toBe(true);
  });
  it("holiday list has 18 entries, none on Sunday", () => {
    const keys = Object.keys(HOLIDAYS_CO_2026);
    expect(keys).toHaveLength(18);
    expect(keys.filter((k) => new Date(`${k}T12:00:00Z`).getUTCDay() === 0)).toEqual([]);
  });
});

describe("email heuristics", () => {
  const personal = ["maria.gonzalez@x.co", "j.perez@x.co", "jperez@clinica.co", "carlos@x.co", "carlosperez@x.co", "juan_rodriguez@x.com", "Andrés.Gómez@x.co"];
  const generic = ["info@x.co", "contacto@x.co", "citas@x.co", "hola@x.co", "ventas@x.co", "Atención@x.co", "odontologia@x.co"];
  it.each(personal)("personal: %s", (e) => {
    expect(looksLikePersonalEmail(e)).toBe(true);
    expect(isGenericEmail(e)).toBe(false);
  });
  it.each(generic)("generic: %s", (e) => {
    expect(isGenericEmail(e)).toBe(true);
    expect(looksLikePersonalEmail(e)).toBe(false);
  });
  it("handles empty", () => {
    expect(looksLikePersonalEmail(null)).toBe(false);
    expect(looksLikePersonalEmail("nope")).toBe(false);
    expect(isGenericEmail(undefined)).toBe(false);
  });
  it("isLegalEntity", () => {
    expect(isLegalEntity("X", "PERSONA NATURAL")).toEqual(expect.objectContaining({ legal: false, verified: true }));
    expect(isLegalEntity("X", "SOCIEDAD POR ACCIONES SIMPLIFICADA")).toEqual(expect.objectContaining({ legal: true, verified: true }));
    expect(isLegalEntity("Dra. Ana Torres").legal).toBe(false);
    expect(isLegalEntity("JUAN CARLOS PEREZ GOMEZ E.U.").legal).toBe(false);
    expect(isLegalEntity("Odontología Sonrisa S.A.S.")).toEqual(expect.objectContaining({ legal: true, verified: false }));
    expect(isLegalEntity("Clínica Dental Centro").verified).toBe(false);
    expect(isLegalEntity("La Esquina").legal).toBe(true);
  });
});

describe("tokens", () => {
  it("round-trips and rejects tampering", () => {
    const t = createOptOutToken("lead-1", "info@x.co", "s1");
    expect(verifyOptOutToken(t, "s1")).toEqual({ leadId: "lead-1", contact: "info@x.co" });
    expect(verifyOptOutToken(t, "other")).toBeNull();
    const [p, s] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ l: "lead-2" })).toString("base64url");
    expect(verifyOptOutToken(`${forged}.${s}`, "s1")).toBeNull();
    expect(verifyOptOutToken(`${p}.${s}x`, "s1")).toBeNull();
    expect(verifyOptOutToken(`${p}`, "s1")).toBeNull();
    expect(verifyOptOutToken("a.b.c", "s1")).toBeNull();
    expect(verifyOptOutToken("", "s1")).toBeNull();
  });
  it("works with default dev secret", () => {
    expect(verifyOptOutToken(createOptOutToken("l"))?.leadId).toBe("l");
  });
});

describe("evaluateOutreach", () => {
  const ok = { country: "CO" as const, isLegalEntity: true, suppressed: false, alreadyContacted: false };
  const email = { channel: "email" as const, value: "info@x.co" };
  const mon = bog("2026-10-19T10:00:00");
  it("allows and marks simulated when SEND_ENABLED is false", () => {
    const r = evaluateOutreach(ok, email, mon);
    expect(r).toMatchObject({ allowed: true, simulated: true });
    expect(evaluateOutreach(ok, email, mon, { sendEnabled: true }).simulated).toBe(false);
  });
  it("explains every block", () => {
    const r = evaluateOutreach(
      { country: "CO", isLegalEntity: false, suppressed: true, alreadyContacted: true },
      { channel: "email", value: "maria.gomez@x.co" },
      bog("2026-10-18T10:00:00"),
      { senderIdentified: false },
    );
    expect(r.allowed).toBe(false);
    expect(r.blocks.map((b) => b.rule).sort()).toEqual(
      ["already_contacted", "natural_person", "outside_window", "personal_email", "sender_missing", "suppressed"].sort(),
    );
    expect(r.blocks.every((b) => b.message.length > 10)).toBe(true);
  });
  it("US: email only, needs address", () => {
    const us = { ...ok, country: "US" as const };
    expect(evaluateOutreach(us, { channel: "whatsapp", value: "+1" }, mon, { senderAddress: "x" }).blocks[0]?.rule).toBe("channel_not_allowed");
    expect(evaluateOutreach(us, email, mon).blocks[0]?.rule).toBe("sender_missing");
    expect(evaluateOutreach(us, email, mon, { senderAddress: "1 Main St" }).allowed).toBe(true);
  });
});

describe("suppression, opt-out and metrics (db)", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    conn = await createTestDb();
  });
  afterAll(async () => conn.close());

  it("suppress is idempotent and matches email/domain/phone", async () => {
    const { db } = conn;
    expect(await suppress(db, "Info@Dental.co", "test")).toBe(true);
    expect(await suppress(db, "info@dental.co", "test")).toBe(false);
    expect(await isSuppressed(db, { email: "INFO@dental.co" })).toBe(true);
    expect(await isSuppressed(db, { email: "otro@dental.co" })).toBe(false);
    await suppress(db, "https://www.bloqueado.com/x", "test");
    expect(await isSuppressed(db, { email: "a@bloqueado.com" })).toBe(true);
    expect(await isSuppressed(db, { domain: "bloqueado.com" })).toBe(true);
    await suppress(db, "+57 300 123 4567", "test");
    expect(await isSuppressed(db, { phone: "+573001234567" })).toBe(true);
    expect(await isSuppressed(db, {})).toBe(false);
  });

  it("applyOptOut suppresses the lead's contacts and is idempotent; bad token changes nothing", async () => {
    const { db } = conn;
    const [c] = await db.insert(companies).values({ name: "Clínica X SAS", normalizedName: "clinica x", website: "https://www.clinicax.co" }).returning();
    const [l] = await db.insert(leads).values({ companyId: c!.id, primarySource: "osm", slug: "clinica-x" }).returning();
    await db.insert(contactPoints).values({ companyId: c!.id, type: "email", value: "contacto@clinicax.co", isGeneric: true });
    const token = createOptOutToken(l!.id);
    expect(await applyOptOut(db, "bad.token")).toEqual({ ok: false, reason: "invalid_token" });
    expect(await isSuppressed(db, { email: "contacto@clinicax.co" })).toBe(false);
    const r = await applyOptOut(db, token);
    expect(r).toMatchObject({ ok: true, leadFound: true });
    expect(await isSuppressed(db, { email: "contacto@clinicax.co" })).toBe(true);
    expect(await isSuppressed(db, { domain: "clinicax.co" })).toBe(true);
    const again = await applyOptOut(db, token);
    expect(again).toMatchObject({ ok: true, suppressed: 0 });
    expect(await applyOptOut(db, createOptOutToken("not-a-uuid"))).toMatchObject({ ok: true, leadFound: false });

    await db.insert(messages).values([{ leadId: l!.id, contactChannel: "email", body: "x", status: "blocked", blockedByRule: "outside_window" }]);
    const m = await queryComplianceMetrics(db);
    expect(m).toMatchObject({ optOutsTotal: 1, optOutsRespected: 1, blockedBySchedule: 1, naturalPersonsContacted: 0, sentTotal: 0, senderIdentifiedPct: null });
  });
});

describe("computeComplianceMetrics", () => {
  const body = "Somos Faro, proyecto del 30X Hackathon. Responde a hola@faro.co. Darte de baja: https://faro.co/baja/abc";
  const base = { blockedByRule: null, isMock: false, isLegalEntity: true };
  it("computes panel numbers and excludes mocks", () => {
    const m = computeComplianceMetrics({
      messages: [
        { ...base, status: "sent", body },
        { ...base, status: "sent", body: "hola" },
        { ...base, status: "sent", body, isLegalEntity: false },
        { ...base, status: "sent", body, isMock: true },
        { ...base, status: "blocked", body, blockedByRule: "outside_window" },
        { ...base, status: "blocked", body, blockedByRule: "suppressed" },
      ],
      optOuts: 3,
      sentAfterOptOut: 1,
    });
    expect(m).toMatchObject({ naturalPersonsContacted: 1, senderIdentifiedPct: 66.7, optOutsRespected: 2, blockedBySchedule: 1, blockedTotal: 2, sentTotal: 3 });
  });
});
