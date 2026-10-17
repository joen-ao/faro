import { eq } from "drizzle-orm";
import { costEntries, costRates } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { getEnv, resolveMode, type Env } from "@/lib/env";
import { createMockPlaces } from "./mock";
import { createRealPlaces } from "./real";
import { PLACES_RATE_KEY, type PlacesAdapter, type PlacesApiCallLogger } from "./types";

export * from "./types";
export { buildRequestBody, buildTextQuery, createRealPlaces, placeUrl, toSourceCompany } from "./real";
export { createMockPlaces, MOCK_PLACES } from "./mock";

/** `GOOGLE_PLACES_MODE=real` + `GOOGLE_PLACES_API_KEY` -> real; anything else -> mock. */
export function getGooglePlaces(env: Env = getEnv(), onApiCall?: PlacesApiCallLogger, fetchImpl?: typeof fetch): PlacesAdapter {
  if (resolveMode("google_places", env) === "mock" || !env.GOOGLE_PLACES_API_KEY) return createMockPlaces();
  return createRealPlaces({ apiKey: env.GOOGLE_PLACES_API_KEY, onApiCall, fetchImpl });
}

/**
 * Records the list-price cost of `calls` Text Search calls: `rate` = list value from `cost_rates.places_per_call`,
 * `usd` = 0 because it is covered by the free tier. Mock runs are flagged `is_mock` + `is_demo`.
 */
export async function recordPlacesCost(db: AppDb, opts: { calls: number; huntId?: string; isMock?: boolean }): Promise<void> {
  if (opts.calls <= 0) return;
  const [rate] = await db.select({ usd: costRates.usd }).from(costRates).where(eq(costRates.key, PLACES_RATE_KEY)).limit(1);
  const listValue = rate?.usd ?? 0;
  await db.insert(costEntries).values({
    huntId: opts.huntId,
    sourceChannel: "google_places",
    category: "data",
    quantity: opts.calls,
    unit: "call",
    rate: listValue,
    usd: 0,
    evidence: `cubierto por tier gratuito (valor de lista ${listValue} USD/llamada)`,
    isMock: !!opts.isMock,
    isDemo: !!opts.isMock,
  });
}
