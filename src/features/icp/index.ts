import { z } from "zod";
import { complete, type AnthropicAdapter, type CallRecorder, type Usage } from "@/integrations/anthropic";
import { countryCities, findCity, findCountry, findSector, normalizeCities, placesInText, withCities } from "./presets";
import { DEFAULT_THRESHOLD, IcpCriteria } from "./schema";

export * from "./schema";
export * from "./presets";

export function buildIcpPrompt(userInput: string): string {
  return [
    "[[task:icp_parse]]",
    "Convert the sales prospect description below into an ICP (ideal customer profile) JSON object with exactly these keys:",
    '{"sector": string, "ciiu": string[], "osmTags": string[] ("key=value"), "placesTypes": string[], "city": string, "cities"?: [{"name": string, "bbox"?: [south, west, north, east]}], "scope"?: "cities" | "country", "country": ISO-3166 alpha-2, "bbox"?: [south, west, north, east], "size"?: string, "signals": string[], "exclusions": string[], "nameKeywords": string[], "language": "es" | "en"}',
    "Use only what the description supports; leave arrays empty rather than guessing. Never include person names.",
    '"nameKeywords": 4 to 8 Spanish words or short phrases, UPPERCASE and without accents, that companies of this sector usually carry in their registered business name or in a product category (stems are fine). Example for "clínicas odontológicas": ["ODONTOLOG", "DENTAL", "ORTODONC", "IMPLANT"]; for "bioimpresión 3D": ["BIOIMPRES", "IMPRESION 3D", "BIOTEC", "BIOMATERIAL", "BIOMEDIC", "MANUFACTURA ADITIVA"]. Never generic words such as SERVICIOS, SOLUCIONES, GRUPO, INVERSIONES, COMERCIAL.',
    `If no city is mentioned use "${DEFAULT_CITY}" and country "${DEFAULT_COUNTRY}" (the team edits it before searching).`,
    'Location: "city" is the first (or only) city. When the description names several cities, also return "cities" with all of them in order (at most 5). When it asks for a whole country (e.g. "Colombia", "todo el país") without naming cities, set "scope": "country", "country" to its code and "city" to its capital.',
    "USER_INPUT:",
    userInput,
  ].join("\n");
}

/** A prompt without a place ("clínicas dermatológicas o spas") searches Bogotá, CO by default; the city chip changes it. */
export const DEFAULT_CITY = "Bogota";
export const DEFAULT_COUNTRY = "CO";

const filled = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);

/** Model reply -> criteria: an empty city or country falls back to the default instead of failing the whole profile. */
export const IcpReply = z.preprocess((v) => {
  if (!v || typeof v !== "object") return v;
  const o = v as Record<string, unknown>;
  const out: Record<string, unknown> = { ...o, city: filled(o.city, DEFAULT_CITY), country: filled(o.country, DEFAULT_COUNTRY) };
  // Optional text fields the model sometimes returns empty ("size": "") are dropped instead of failing the profile.
  for (const k of ["size"]) if (typeof out[k] === "string" && !(out[k] as string).trim()) delete out[k];
  return out;
}, IcpCriteria);

export interface ParsedIcp {
  criteria: IcpCriteria;
  threshold: number;
  model: string;
  usage: Usage;
  is_mock: boolean;
}

/** Fills catalogue mappings (CIIU / OSM / Places / bbox) the model left empty. Never overrides model output. */
export function enrichCriteria(c: IcpCriteria, source: string): IcpCriteria {
  const sector = findSector(`${c.sector} ${source}`);
  const city = findCity(c.city) ?? findCity(source);
  const base: IcpCriteria = {
    ...c,
    // Known sectors use the CIIU codes verified against RUES (F02), never the model's guess (it said 8623 for dental).
    ciiu: sector?.ciiu.length ? sector.ciiu : c.ciiu,
    osmTags: c.osmTags.length ? c.osmTags : (sector?.osmTags ?? []),
    placesTypes: c.placesTypes.length ? c.placesTypes : (sector?.placesTypes ?? []),
    bbox: c.bbox ?? city?.bbox,
  };
  return withPlaces(base, source);
}

/**
 * Multi-city / country: a whole country (model scope, a country in `city`, or the text) expands to its main preset
 * cities; several cities named in the text fill `cities` when the model returned fewer. Then dedupe, cap 5, bboxes.
 */
function withPlaces(c: IcpCriteria, source: string): IcpCriteria {
  const modelCities = c.cities?.length ?? 0;
  const countryInCity = !findCity(c.city) ? findCountry(c.city) : undefined;
  const text = placesInText(source);
  if (modelCities < 2) {
    const code = countryInCity?.code ?? (c.scope === "country" ? c.country : text.scope === "country" ? findCountry(source)?.code : undefined);
    const presets = code ? countryCities(code) : [];
    if (presets.length) return withCities({ ...c, language: c.language }, presets, "country");
    if (text.cities.length > 1) return withCities(c, text.cities, "cities");
  }
  return normalizeCities(c);
}

export async function parseIcp(
  prompt: string,
  adapter: AnthropicAdapter,
  opts: { recorder?: CallRecorder } = {},
): Promise<ParsedIcp> {
  const res = await complete(adapter, buildIcpPrompt(prompt), IcpReply, { task: "icp_parse", recorder: opts.recorder });
  return {
    criteria: enrichCriteria(res.data, prompt),
    threshold: DEFAULT_THRESHOLD,
    model: res.model,
    usage: res.usage,
    is_mock: res.is_mock,
  };
}
