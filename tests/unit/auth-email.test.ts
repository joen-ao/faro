import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as s from "@/db/schema";
import { checkCredentials, createSession, emailLoginReady, hashPassword, setUserPassword, signingSecret, verifyPassword, verifySession } from "@/lib/auth";
import { requireAppAccess } from "@/lib/app-access";
import { resetLoginAttempts } from "@/lib/login";
import { createTestDb } from "../helpers/test-db";

const PASSWORD = "una-clave-larga-de-prueba";
const env = { NODE_ENV: "production", APP_ACCESS_KEY: "team-key" };
let t: Awaited<ReturnType<typeof createTestDb>>;

vi.mock("@/db/client", async (orig) => {
  const real = await orig<typeof import("@/db/client")>();
  return { ...real, getReadyDb: async () => t.db };
});

beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await t.close();
});

const req = (cookie?: string) => new Request("https://faro.test/api/hunts", { headers: cookie ? { cookie } : {} });

describe("password hashing", () => {
  it("hashes with a unique salt and verifies only the right password", async () => {
    const h1 = await hashPassword(PASSWORD);
    expect(h1).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(h1).not.toBe(await hashPassword(PASSWORD));
    expect(h1).not.toContain(PASSWORD);
    expect(await verifyPassword(PASSWORD, h1)).toBe(true);
    expect(await verifyPassword("otra-clave-larga", h1)).toBe(false);
    expect(await verifyPassword(PASSWORD, "bcrypt$x")).toBe(false);
  });
});

describe("accounts in the users table", () => {
  it("email login is off until an account exists", async () => {
    expect(await emailLoginReady(t.db, env)).toBe(false);
    expect(await setUserPassword(t.db, " AnayaJoen@Gmail.com ", PASSWORD)).toEqual({ created: true });
    expect(await emailLoginReady(t.db, env)).toBe(true);
    expect(await emailLoginReady(t.db, {})).toBe(false); // no signing key
  });

  it("stores only the hash, checks email case-insensitively, and replaces the password", async () => {
    const [row] = await t.db.select().from(s.users);
    expect(row!.email).toBe("anayajoen@gmail.com");
    expect(row!.passwordHash).not.toContain(PASSWORD);
    expect(await checkCredentials(t.db, "ANAYAJOEN@gmail.com", PASSWORD)).toMatchObject({ email: "anayajoen@gmail.com" });
    expect(await checkCredentials(t.db, "otro@gmail.com", PASSWORD)).toBeNull();
    expect(await checkCredentials(t.db, "anayajoen@gmail.com", "incorrecta-larga")).toBeNull();
    const [after] = await t.db.select().from(s.users);
    expect(after!.lastLoginAt).not.toBeNull();

    expect(await setUserPassword(t.db, "anayajoen@gmail.com", "nueva-clave-larga-2026")).toEqual({ created: false });
    expect(await checkCredentials(t.db, "anayajoen@gmail.com", PASSWORD)).toBeNull();
    expect(await checkCredentials(t.db, "anayajoen@gmail.com", "nueva-clave-larga-2026")).not.toBeNull();
    await setUserPassword(t.db, "anayajoen@gmail.com", PASSWORD);
    await expect(setUserPassword(t.db, "anayajoen@gmail.com", "corta")).rejects.toThrow(/12/);
    await expect(setUserPassword(t.db, "no-es-correo", PASSWORD)).rejects.toThrow(/Correo/);
  });
});

describe("signed sessions", () => {
  const user = { id: "00000000-0000-4000-8000-000000000001", email: "anayajoen@gmail.com" };

  it("accepts a fresh session and rejects tampered, expired or re-keyed ones", () => {
    const now = Date.now();
    const token = createSession(user, env, now);
    expect(verifySession(token, env, now)).toBe(true);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: user.id, e: user.email, exp: 9_999_999_999 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, env, now)).toBe(false);
    expect(verifySession(`${payload}.x${sig!.slice(1)}`, env, now)).toBe(false);
    expect(verifySession(token, env, now + 8 * 24 * 3600 * 1000)).toBe(false);
    expect(verifySession(token, { ...env, APP_ACCESS_KEY: "otra-key" }, now)).toBe(false);
    expect(verifySession(token, { ...env, AUTH_SECRET: "s".repeat(40) }, now)).toBe(false);
  });

  it("uses AUTH_SECRET when long enough, else derives the key from APP_ACCESS_KEY", () => {
    expect(signingSecret({ AUTH_SECRET: "s".repeat(32) })).toBe("s".repeat(32));
    expect(signingSecret({ AUTH_SECRET: "corta", APP_ACCESS_KEY: "k" })).toMatch(/^[0-9a-f]{64}$/);
    expect(signingSecret({})).toBeNull();
  });

  it("requireAppAccess lets a valid session in, keeps x-app-key for scripts, and denies the rest", () => {
    expect(requireAppAccess(req(`faro_session=${createSession(user, env)}`), env)).toBeNull();
    expect(requireAppAccess(new Request("https://faro.test/api/hunts", { headers: { "x-app-key": "team-key" } }), env)).toBeNull();
    expect(requireAppAccess(req("faro_session=basura.firma"), env)?.status).toBe(401);
    expect(requireAppAccess(req(), env)?.status).toBe(401);
  });
});

describe("POST /api/auth/login", () => {
  const form = (fields: Record<string, string>, ip = "1.1.1.1") => {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    return new Request("https://faro.test/api/auth/login", { method: "POST", body, headers: { "x-real-ip": ip } });
  };
  beforeEach(() => {
    resetLoginAttempts();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  });

  it("logs in with email + password from the users table and sets a signed session", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const ok = await POST(form({ email: "anayajoen@gmail.com", password: PASSWORD, next: "/app/ads/copilot" }));
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("https://faro.test/app/ads/copilot");
    const cookie = ok.headers.get("set-cookie") ?? "";
    expect(verifySession(/faro_session=([^;]+)/.exec(cookie)?.[1], env)).toBe(true);
    expect(cookie).toMatch(/HttpOnly/i);

    expect((await POST(form({ email: "anayajoen@gmail.com", password: "incorrecta-larga" }))).headers.get("location")).toContain("error=1");
    // once an account exists, the team key no longer opens the form
    expect((await POST(form({ key: "team-key" }))).headers.get("location")).toContain("error=1");
  });

  it("rate-limits repeated attempts", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    let last: Response | null = null;
    for (let i = 0; i < 11; i++) last = await POST(form({ email: "x@y.co", password: "z" }, "9.9.9.9"));
    expect(last!.headers.get("location")).toContain("error=rate");
  });
});
