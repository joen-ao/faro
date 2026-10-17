import { assertScrapableUrl } from "./guard";
import type { ApifyAdapter, ApifyRunResult } from "./types";

/** Mock run: fictional contacts and a fixed fake `usageTotalUsd` (0.002 per URL), always `isMock`. */
export function createMockApify(): ApifyAdapter {
  return {
    async scrapeContacts(rawUrls: string[]): Promise<ApifyRunResult> {
      const urls = rawUrls.map(assertScrapableUrl);
      return {
        items: urls.map((url) => {
          const domain = new URL(url).hostname.replace(/^www\./, "");
          return { url, emails: [`contacto@${domain}`, `maria.lopez@${domain}`], phones: ["+57 601 555 0100"], whatsapps: [] };
        }),
        runId: "mock-run",
        usageTotalUsd: Math.round(urls.length * 0.002 * 1e6) / 1e6,
        latencyMs: 0,
        isMock: true,
      };
    },
  };
}
