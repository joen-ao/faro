import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { users } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { safeEqual } from "@/lib/app-access";

/**
 * F30 · Email + password login against the `users` table (Supabase Postgres). No sign-up: accounts are created with
 * `npm run auth:set-password`. Only the scrypt hash is stored. Sessions are HMAC-signed tokens (no DB lookup per
 * request); the signing key is AUTH_SECRET, or one derived from APP_ACCESS_KEY when AUTH_SECRET is not set.
 */

export const SESSION_COOKIE_V2 = "faro_session";
export const SESSION_TTL_S = 60 * 60 * 24 * 7;
export const MIN_PASSWORD_LENGTH = 12;
const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 } as const;

type Env = Record<string, string | undefined>;

function scrypt(password: string, salt: Buffer, keyLen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keyLen, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

const b64u = (b: Buffer) => b.toString("base64url");
export const normEmail = (e: string) => e.trim().toLowerCase();

/** `scrypt$N$r$p$salt$hash` (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, b64u(salt), b64u(key)].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every((x) => Number.isInteger(x) && x! > 0) || N! > 1 << 20) return false;
  const salt = Buffer.from(parts[4]!, "base64url");
  const expected = Buffer.from(parts[5]!, "base64url");
  if (!salt.length || expected.length < 32) return false;
  const got = await scrypt(password.normalize("NFKC"), salt, expected.length, { N: N!, r: r!, p: p!, maxmem: 128 * N! * r! * 2 + 1024 * 1024 });
  return timingSafeEqual(got, expected);
}

/** Session signing key: AUTH_SECRET (>= 32 chars) or a key derived from APP_ACCESS_KEY. null = sessions disabled. */
export function signingSecret(env: Env = process.env): string | null {
  if ((env.AUTH_SECRET?.length ?? 0) >= 32) return env.AUTH_SECRET!;
  if (env.APP_ACCESS_KEY) return createHash("sha256").update(`faro-session-v1:${env.APP_ACCESS_KEY}`).digest("hex");
  return null;
}

export async function hasUsers(db: AppDb): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(users);
  return Number(row?.n ?? 0) > 0;
}

/** Email login is shown once there is at least one account and a signing key. */
export async function emailLoginReady(db: AppDb, env: Env = process.env): Promise<boolean> {
  return !!signingSecret(env) && (await hasUsers(db));
}

let dummyHash: Promise<string> | null = null;

/** Returns the user on success. Unknown emails still run scrypt, so they take as long as a wrong password. */
export async function checkCredentials(db: AppDb, email: string, password: string, now = new Date()): Promise<{ id: string; email: string } | null> {
  if (!email || !password) return null;
  const [user] = await db.select().from(users).where(eq(users.email, normEmail(email))).limit(1);
  if (!user) {
    await verifyPassword(password, await (dummyHash ??= hashPassword(randomBytes(16).toString("hex"))));
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  return { id: user.id, email: user.email };
}

/** Creates the account or replaces its password (used by `npm run auth:set-password`, never by a web endpoint). */
export async function setUserPassword(db: AppDb, email: string, password: string): Promise<{ created: boolean }> {
  const e = normEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) throw new Error("Correo inválido");
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  const passwordHash = await hashPassword(password);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, e)).limit(1);
  const now = new Date();
  if (existing) {
    await db.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, existing.id));
    return { created: false };
  }
  await db.insert(users).values({ email: e, passwordHash, createdAt: now, updatedAt: now });
  return { created: true };
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSession(user: { id: string; email: string }, env: Env = process.env, now = Date.now()): string {
  const secret = signingSecret(env);
  if (!secret) throw new Error("No session signing key (AUTH_SECRET or APP_ACCESS_KEY)");
  const payload = b64u(Buffer.from(JSON.stringify({ uid: user.id, e: user.email, exp: Math.floor(now / 1000) + SESSION_TTL_S })));
  return `${payload}.${sign(payload, secret)}`;
}

/** Stateless check (no DB): valid signature and not expired. */
export function verifySession(token: string | undefined, env: Env = process.env, now = Date.now()): boolean {
  const secret = signingSecret(env);
  if (!token || !secret) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload, secret))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; e?: string; exp?: number };
    return typeof data.uid === "string" && typeof data.e === "string" && typeof data.exp === "number" && data.exp * 1000 > now;
  } catch {
    return false;
  }
}
