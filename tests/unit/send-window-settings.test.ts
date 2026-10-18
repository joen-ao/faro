import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppDb } from "@/db/types";
import { checkSendWindow } from "@/features/compliance/windows";
import { getSendWindow, saveSendWindow, sendWindowInput } from "@/features/settings/send-window";
import { createTestDb } from "../helpers/test-db";

const at = (iso: string) => new Date(iso);
const custom = { policy: "custom" as const, startHour: 8, endHour: 23, days: [0, 1, 2, 3, 4, 5, 6] };

describe("custom send window", () => {
  it("opens Saturday night when the team sets 8:00-23:00 every day", () => {
    const r = checkSendWindow(at("2026-10-17T21:30:00-05:00"), "CO", custom);
    expect(r.allowed).toBe(true);
    expect(r.reason).toContain("8:00–23:00");
  });

  it("closes after the end hour and points to the next start", () => {
    const r = checkSendWindow(at("2026-10-17T23:01:00-05:00"), "CO", custom);
    expect(r.allowed).toBe(false);
    expect(r.nextAllowedAt?.toISOString()).toBe("2026-10-18T13:00:00.000Z");
  });

  it("skips days that are not enabled", () => {
    const weekdays = { ...custom, days: [1, 2, 3, 4, 5] };
    const sat = checkSendWindow(at("2026-10-17T10:00:00-05:00"), "CO", weekdays);
    expect(sat.allowed).toBe(false);
    expect(sat.reason).toContain("Día no habilitado");
    expect(sat.nextAllowedAt?.toISOString()).toBe("2026-10-19T13:00:00.000Z"); // Monday 8:00
    const early = checkSendWindow(at("2026-10-19T07:00:00-05:00"), "CO", weekdays);
    expect(early.nextAllowedAt?.toISOString()).toBe("2026-10-19T13:00:00.000Z");
  });

  it("allows until midnight with endHour 24", () => {
    expect(checkSendWindow(at("2026-10-17T23:59:00-05:00"), "CO", { ...custom, endHour: 24 }).allowed).toBe(true);
  });

  it("validates the input", () => {
    expect(sendWindowInput.safeParse({ ...custom, endHour: 8 }).success).toBe(false);
    expect(sendWindowInput.safeParse({ ...custom, days: [] }).success).toBe(false);
    expect(sendWindowInput.safeParse({ policy: "siempre" }).success).toBe(false);
    expect(sendWindowInput.parse({ ...custom, days: [3, 1, 1] })).toMatchObject({ days: [1, 3] });
  });
});

describe("send window setting storage", () => {
  let conn: Awaited<ReturnType<typeof createTestDb>>;
  let db: AppDb;
  beforeAll(async () => {
    conn = await createTestDb();
    db = conn.db as unknown as AppDb;
  });
  afterAll(async () => conn.close());

  it("falls back to SEND_WINDOW_POLICY until the panel saves one, then the panel wins", async () => {
    expect(await getSendWindow(db, { SEND_WINDOW_POLICY: "extendida" })).toMatchObject({ origin: "env", setting: { policy: "extendida" } });
    await saveSendWindow(db, custom);
    expect(await getSendWindow(db, { SEND_WINDOW_POLICY: "extendida" })).toMatchObject({ origin: "panel", setting: custom });
    await saveSendWindow(db, { policy: "ley2300" });
    expect((await getSendWindow(db)).setting).toEqual({ policy: "ley2300" });
  });
});

describe("describeSendWindow", () => {
  it("describes each policy in plain Spanish", async () => {
    const { describeSendWindow } = await import("@/features/compliance/windows");
    expect(describeSendWindow(custom)).toBe("Todos los días entre 8:00 y 23:00 (hora Colombia). Ajustable por el equipo desde el panel.");
    expect(describeSendWindow({ ...custom, days: [1, 2, 3, 4, 5] })).toContain("Los días lun, mar, mié, jue, vie");
    expect(describeSendWindow({ policy: "ley2300" })).toContain("Ley 2300");
    expect(describeSendWindow({ policy: "extendida" })).toContain("8:00 y 20:00");
  });
});
