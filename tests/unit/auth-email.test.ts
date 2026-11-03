import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { checkCredentials, createSession, emailLoginEnabled, hashPassword, verifyPassword, verifySession } from "@/lib/auth";
import { requireAppAccess } from "@/lib/app-access";
import { resetLoginAttempts } from "@/lib/login";

const PASSWORD = "una-clave-larga-de-prueba";
let env: Record<string, string>;

beforeAll(async () => {
  env = {
    NODE_ENV: "production",
    AUTH_EMAIL: "anayajoen@gmail.com",
    AUTH_PASSWORD_HASH: await hashPassword(PASSWORD),
    AUTH_SECRET: "s".repeat(48),
    APP_ACCESS_KEY: "team-key",
  };
});

const req = (cookie?: string) => new Request("https://faro.test/api/hunts", { headers: cookie ? { cookie } : {} });

describe("password hashing", () => {
  it("hashes with a unique salt and verifies only the right password", async () => {
    const h1 = await hashPassword(PASSWORD);
    const h2 = await hashPassword(PASSWORD);
    expect(h1).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(h1).not.toBe(h2);
    expect(h1).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, h1)).toBe(true);
    expect(await verifyPassword("otra-clave-larga", h1)).toBe(false);
    expect(await verifyPassword(PASSWORD, "bcrypt$x")).toBe(false);
  });

  it("checks email (case-insensitive) and password together", async () => {
    expect(await checkCredentials(" AnayaJoen@gmail.com ", PASSWORD, env)).toBe(true);
    expect(await checkCredentials("otro@gmail.com", PASSWORD, env)).toBe(false);
    expect(await checkCredentials("anayajoen@gmail.com", "mal", env)).toBe(false);
    expect(await checkCredentials("anayajoen@gmail.com", PASSWORD, { ...env, AUTH_SECRET: "corta" })).toBe(false);
  });
});

describe("signed sessions", () => {
  it("accepts a fresh session and rejects tampered, expired or re-keyed ones", () => {
    const now = Date.now();
    const token = createSession(env, now);
    expect(verifySession(token, env, now)).toBe(true);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "anayajoen@gmail.com", exp: 9_999_999_999 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, env, now)).toBe(false);
    expect(verifySession(`${payload}.x${sig!.slice(1)}`, env, now)).toBe(false);
    expect(verifySession(token, env, now + 8 * 24 * 3600 * 1000)).toBe(false);
    expect(verifySession(token, { ...env, AUTH_SECRET: "t".repeat(48) }, now)).toBe(false);
    expect(verifySession(token, { ...env, AUTH_EMAIL: "otro@gmail.com" }, now)).toBe(false);
  });

  it("requireAppAccess lets a valid session in, keeps x-app-key for scripts, and denies the rest", () => {
    expect(requireAppAccess(req(`faro_session=${createSession(env)}`), env)).toBeNull();
    expect(requireAppAccess(new Request("https://faro.test/api/hunts", { headers: { "x-app-key": "team-key" } }), env)).toBeNull();
    expect(requireAppAccess(req("faro_session=basura.firma"), env)?.status).toBe(401);
    expect(requireAppAccess(req(), env)?.status).toBe(401);
  });

  it("is enabled only with email, hash and a long secret", () => {
    expect(emailLoginEnabled(env)).toBe(true);
    expect(emailLoginEnabled({ ...env, AUTH_PASSWORD_HASH: "" })).toBe(false);
    expect(emailLoginEnabled({ ...env, AUTH_SECRET: "x".repeat(31) })).toBe(false);
  });
});

describe("POST /api/auth/login", () => {
  const form = (fields: Record<string, string>, ip = "1.1.1.1") => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return new Request("https://faro.test/api/auth/login", { method: "POST", body, headers: { "x-real-ip": ip } });
  };
  beforeEach(() => resetLoginAttempts());
  afterAll(() => vi.unstubAllEnvs());

  it("logs in with email + password and sets a signed session", async () => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { POST } = await import("@/app/api/auth/login/route");
    const ok = await POST(form({ email: "anayajoen@gmail.com", password: PASSWORD, next: "/app/ads/copilot" }));
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("https://faro.test/app/ads/copilot");
    const cookie = ok.headers.get("set-cookie") ?? "";
    const token = /faro_session=([^;]+)/.exec(cookie)?.[1];
    expect(verifySession(token, env)).toBe(true);
    expect(cookie).toMatch(/HttpOnly/i);

    const bad = await POST(form({ email: "anayajoen@gmail.com", password: "incorrecta-larga" }));
    expect(bad.headers.get("location")).toContain("error=1");
    // the team key no longer opens the form once email login is configured
    const viaKey = await POST(form({ key: "team-key" }));
    expect(viaKey.headers.get("location")).toContain("error=1");
  });

  it("rate-limits repeated attempts", async () => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { POST } = await import("@/app/api/auth/login/route");
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) last = await POST(form({ email: "x@y.co", password: "z" }, "9.9.9.9"));
    expect(last!.headers.get("location")).toContain("error=rate");
  });
});
