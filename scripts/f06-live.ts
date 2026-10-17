/* One-off live check of the website fetcher against public sites (robots-aware). Prints counts only, no personal data. */
import { createRealWebsiteFetch } from "@/integrations/website-fetch";

async function main() {
  const sites = process.argv.slice(2);
  const adapter = createRealWebsiteFetch({ appUrl: "http://localhost:3000" });
  for (const site of sites) {
    const r = await adapter.fetchSite(site);
    const byType = (t: string) => r.extraction.contacts.filter((c) => c.type === t).map((c) => c.value);
    console.log(
      JSON.stringify(
        {
          site,
          error: r.error ?? null,
          pages: r.pages.length,
          skipped: r.skipped.map((s) => s.reason),
          requests: r.requests,
          ms: r.latencyMs,
          emails: byType("email"),
          phones: byType("phone").length,
          whatsapp: byType("whatsapp").length,
          webForm: byType("web_form").length,
          discardedPersonalEmails: r.extraction.discardedPersonalEmails,
          signals: r.extraction.signals,
          textBytes: Buffer.byteLength(r.extraction.websiteText),
        },
        null,
        1,
      ),
    );
  }
}
void main();
