import "./load-env";
import { getReadyDb } from "../src/db/client";
import type { AppDb } from "../src/db/types";
import { enrichHunt } from "../src/features/enrichment";
import { getApify } from "../src/integrations/apify";
import { getWebsiteFetch } from "../src/integrations/website-fetch";

// Usage: tsx scripts/enrich-hunt.ts <huntId> [--apify]   (same code as POST /api/hunts/[id]/enrich)
const huntId = process.argv[2];
const useApify = process.argv.includes("--apify");
if (!huntId || huntId.startsWith("--")) {
  console.error("Usage: tsx scripts/enrich-hunt.ts <huntId> [--apify]");
  process.exit(1);
}

async function main() {
  const db = (await getReadyDb()) as unknown as AppDb;
  const fetch = getWebsiteFetch();
  const apify = getApify();
  if (useApify) console.log(apify.isMock ? "Apify: MOCK (set APIFY_MODE=real and APIFY_TOKEN for the real actor)" : "Apify: real actor (costs money)");
  const total = { revisados: 0, enriquecidos: 0, conAgenda: 0, conWhatsapp: 0, contactosNuevos: 0, costoApifyUsd: 0, promovidosAFit: 0 };
  let cursor = 0;
  for (;;) {
    const r = await enrichHunt(db, huntId, { useApify, cursor, limit: 25, fetch, apify });
    for (const k of Object.keys(total) as Array<keyof typeof total>) total[k] += r[k];
    console.log(
      `[${r.nextCursor}/${r.total}]`,
      JSON.stringify({ revisados: r.revisados, enriquecidos: r.enriquecidos, contactosNuevos: r.contactosNuevos, costoApifyUsd: r.costoApifyUsd, promovidosAFit: r.promovidosAFit }),
      r.notas.length ? r.notas.join(" | ") : "",
    );
    if (r.done || r.nextCursor <= cursor) break;
    cursor = r.nextCursor;
  }
  total.costoApifyUsd = Math.round(total.costoApifyUsd * 1e6) / 1e6;
  console.log("Total:", JSON.stringify(total));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
