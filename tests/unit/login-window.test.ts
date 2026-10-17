import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSendWindow, sendWindowPolicy } from "@/features/compliance/windows";
import { allowLoginAttempt, checkLoginKey, resetLoginAttempts, safeNext } from "@/lib/login";
import { POST as login } from "@/app/api/auth/login/route";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";

const at = (iso: string) => new Date(iso);

describe("send window policy", () => {
  it("defaults to Ley 2300 and only accepts 'extendida' explicitly", () => {
    expect(sendWindowPolicy({})).toBe("ley2300");
    expect(sendWindowPolicy({ SEND_WINDOW_POLICY: "EXTENDIDA" })).toBe("extendida");
    expect(sendWindowPolicy({ SEND_WINDOW_POLICY: "always" })).toBe("ley2300");
  });

  it("extendida allows Saturday evening, Sunday and holidays between 8:00 and 20:00 Bogotá", () => {
    expect(checkSendWindow(at("2026-10-17T18:30:00-05:00"), "CO", "ley2300").allowed).toBe(false);
    expect(checkSendWindow(at("2026-10-17T18:30:00-05:00"), "CO", "extendida").allowed).toBe(true);
    expect(checkSendWindow(at("2026-10-18T09:00:00-05:00"), "CO", "extendida").allowed).toBe(true); // Sunday
    expect(checkSendWindow(at("2026-11-02T10:00:00-05:00"), "CO", "extendida").allowed).toBe(true); // holiday
    expect(checkSendWindow(at("2026-10-18T20:00:00-05:00"), "CO", "extendida").allowed).toBe(true);
  });

  it("extendida still blocks the night and points to the next 8:00", () => {
    const late = checkSendWindow(at("2026-10-18T20:01:00-05:00"), "CO", "extendida");
    expect(late.allowed).toBe(false);
    expect(late.nextAllowedAt?.toISOString()).toBe("2026-10-19T13:00:00.000Z");
    const early = checkSendWindow(at("2026-10-18T07:30:00-05:00"), "CO", "extendida");
    expect(early.allowed).toBe(false);
    expect(early.nextAllowedAt?.toISOString()).toBe("2026-10-18T13:00:00.000Z");
  });
});

describe("login helpers", () => {
  afterEach(() => resetLoginAttempts());

  it("only redirects to /app paths", () => {
    expect(safeNext("/app/hunts/1?x=1")).toBe("/app/hunts/1?x=1");
    expect(safeNext("https://evil.example")).toBe("/app/dashboard");
    expect(safeNext("//evil.example")).toBe("/app/dashboard");
    expect(safeNext("/app/login")).toBe("/app/dashboard");
    expect(safeNext(undefined)).toBe("/app/dashboard");
  });

  it("checks the key and fails closed without one", () => {
    expect(checkLoginKey("k", { APP_ACCESS_KEY: "k" })).toBe(true);
    expect(checkLoginKey("x", { APP_ACCESS_KEY: "k" })).toBe(false);
    expect(checkLoginKey("", {})).toBe(false);
  });

  it("rate-limits repeated attempts", () => {
    for (let i = 0; i < 10; i++) expect(allowLoginAttempt("ip")).toBe(true);
    expect(allowLoginAttempt("ip")).toBe(false);
  });
});

describe("login route and /app gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetLoginAttempts();
  });
  const form = (fields: Record<string, string>) =>
    new Request("https://faro.test/api/auth/login", { method: "POST", body: new URLSearchParams(fields), headers: { "content-type": "application/x-www-form-urlencoded" } });

  it("sets an httpOnly cookie and redirects to next on the right key", async () => {
    vi.stubEnv("APP_ACCESS_KEY", "team-key");
    const res = await login(form({ key: "team-key", next: "/app/new" }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://faro.test/app/new");
    expect(res.headers.get("set-cookie")).toMatch(/faro_key=team-key;.*HttpOnly/i);
  });

  it("goes back to the form with an error on a wrong key", async () => {
    vi.stubEnv("APP_ACCESS_KEY", "team-key");
    const res = await login(form({ key: "nope", next: "/app/new" }));
    expect(res.headers.get("location")).toContain("/app/login?error=1");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("redirects /app pages to the login without a key in production and lets the login page through", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ACCESS_KEY", "team-key");
    const res = proxy(new NextRequest("https://faro.test/app/dashboard?demo=1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://faro.test/app/login?next=%2Fapp%2Fdashboard%3Fdemo%3D1");
    expect(proxy(new NextRequest("https://faro.test/app/login")).headers.get("location")).toBeNull();
    const ok = proxy(new NextRequest("https://faro.test/app/new", { headers: { cookie: "faro_key=team-key" } }));
    expect(ok.headers.get("location")).toBeNull();
  });
});
