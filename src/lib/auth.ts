import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { safeEqual } from "@/lib/app-access";

/**
 * F30 · Single-account email + password login. The password never lives in the app: only its scrypt hash
 * (AUTH_PASSWORD_HASH). Sessions are HMAC-signed with AUTH_SECRET; changing the secret or the email logs everyone out.
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

/** Email login is on only when the account and the session secret are configured. */
export function emailLoginEnabled(env: Env = process.env): boolean {
  return !!env.AUTH_EMAIL && !!env.AUTH_PASSWORD_HASH && (env.AUTH_SECRET?.length ?? 0) >= 32;
}

const normEmail = (e: string) => e.trim().toLowerCase();

export async function checkCredentials(email: string, password: string, env: Env = process.env): Promise<boolean> {
  if (!emailLoginEnabled(env) || !email || !password) return false;
  // Always run scrypt, so a wrong email takes as long as a wrong password.
  const okPassword = await verifyPassword(password, env.AUTH_PASSWORD_HASH!);
  const okEmail = safeEqual(normEmail(email), normEmail(env.AUTH_EMAIL!));
  return okEmail && okPassword;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSession(env: Env = process.env, now = Date.now()): string {
  const payload = b64u(Buffer.from(JSON.stringify({ e: normEmail(env.AUTH_EMAIL!), exp: Math.floor(now / 1000) + SESSION_TTL_S })));
  return `${payload}.${sign(payload, env.AUTH_SECRET!)}`;
}

export function verifySession(token: string | undefined, env: Env = process.env, now = Date.now()): boolean {
  if (!token || !emailLoginEnabled(env)) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload, env.AUTH_SECRET!))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { e?: string; exp?: number };
    return data.e === normEmail(env.AUTH_EMAIL!) && typeof data.exp === "number" && data.exp * 1000 > now;
  } catch {
    return false;
  }
}
