import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) {
    const l = ip.toLowerCase();
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipv4Private(mapped[1]!);
    // hex form of IPv4-mapped (::ffff:7f00:1) and any other ::ffff: -> treat as private
    if (l.startsWith("::ffff:") || l.startsWith("64:ff9b:") || l.startsWith("2002:") || /^::\d/.test(l)) return true;
    return l === "::" || l === "::1" || /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || l.startsWith("ff");
  }
  return false;
}

/** Synchronous checks: allowed protocols only (https by default), no credentials, no localhost/private literals or internal names. */
export function assertSafePushUrl(raw: string, protocols: readonly string[] = ["https:"]): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError("invalid URL");
  }
  if (!protocols.includes(u.protocol)) throw new UnsafeUrlError(protocols.length === 1 ? "only https is allowed" : "only http and https are allowed");
  if (u.username || u.password) throw new UnsafeUrlError("credentials in URL are not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && !isIP(host)) {
    throw new UnsafeUrlError("internal host names are not allowed");
  }
  if (isIP(host) && isPrivateIp(host)) throw new UnsafeUrlError("private or loopback IPs are not allowed");
  // numeric-looking hosts such as 2130706433 or 0x7f.1 are normalised by URL to dotted form, covered above
  return u;
}

export type Resolver = (hostname: string) => Promise<string[]>;
const defaultResolver: Resolver = async (h) => (await lookup(h, { all: true })).map((r) => r.address);

/** Full check including DNS resolution (blocks hostnames pointing to private ranges). */
export async function assertSafePushUrlResolved(
  raw: string,
  resolve: Resolver = defaultResolver,
  protocols: readonly string[] = ["https:"],
): Promise<URL> {
  const u = assertSafePushUrl(raw, protocols);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return u;
  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch {
    throw new UnsafeUrlError("host does not resolve");
  }
  if (!addrs.length || addrs.some(isPrivateIp)) throw new UnsafeUrlError("host resolves to a private address");
  return u;
}

/** Public web fetch variant: http and https, DNS-resolved. */
export const assertSafeFetchUrl = (raw: string, resolve?: Resolver): Promise<URL> =>
  assertSafePushUrlResolved(raw, resolve, ["http:", "https:"]);
