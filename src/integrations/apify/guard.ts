import { assertSafePushUrl } from "@/lib/ssrf";
import { BlockedUrlError } from "./types";

const SOCIAL = /(^|\.)(facebook|instagram|linkedin|tiktok|twitter|x|youtube)\.com$|(^|\.)fb\.com$|^t\.co$|^wa\.me$/;

/** True for any Google Maps URL (google.*\/maps, maps.google.*, goo.gl/maps, maps.app.goo.gl). */
export function isGoogleMapsUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return /google\.[a-z.]+\/maps|maps\.google|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(raw);
  }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  if (/(^|\.)google\.[a-z.]+$/.test(host) && (path.startsWith("/maps") || host.startsWith("maps.") || u.searchParams.has("cid"))) return true;
  if (/(^|\.)goo\.gl$/.test(host) && path.startsWith("/maps")) return true;
  return host === "maps.app.goo.gl" || host === "g.page" || (/(^|\.)google\.[a-z.]+$/.test(host) && /\/maps\b/.test(u.href.toLowerCase()));
}

/** Throws unless the URL is a plain public http(s) company site: never Google Maps or social networks. */
export function assertScrapableUrl(raw: string): string {
  if (isGoogleMapsUrl(raw)) throw new BlockedUrlError("Google Maps no se puede scrapear (solo Places API oficial)");
  const u = assertSafePushUrl(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`, ["http:", "https:"]);
  if (SOCIAL.test(u.hostname.toLowerCase())) throw new BlockedUrlError("No se scrapean redes sociales");
  return u.href;
}
