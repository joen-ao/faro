import { complete, type AnthropicAdapter, type CallRecorder, type Usage } from "@/integrations/anthropic";
import { findCity, findSector } from "./presets";
import { DEFAULT_THRESHOLD, IcpCriteria } from "./schema";

export * from "./schema";
export * from "./presets";

export function buildIcpPrompt(userInput: string): string {
  return [
    "[[task:icp_parse]]",
    "Convert the sales prospect description below into an ICP (ideal customer profile) JSON object with exactly these keys:",
    '{"sector": string, "ciiu": string[], "osmTags": string[] ("key=value"), "placesTypes": string[], "city": string, "country": ISO-3166 alpha-2, "bbox"?: [south, west, north, east], "size"?: string, "signals": string[], "exclusions": string[], "language": "es" | "en"}',
    "Use only what the description supports; leave arrays empty rather than guessing. Never include person names.",
    "USER_INPUT:",
    userInput,
  ].join("\n");
}

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
  const city = findCity(`${c.city} ${source}`);
  return {
    ...c,
    ciiu: c.ciiu.length ? c.ciiu : (sector?.ciiu ?? []),
    osmTags: c.osmTags.length ? c.osmTags : (sector?.osmTags ?? []),
    placesTypes: c.placesTypes.length ? c.placesTypes : (sector?.placesTypes ?? []),
    bbox: c.bbox ?? city?.bbox,
  };
}

export async function parseIcp(
  prompt: string,
  adapter: AnthropicAdapter,
  opts: { recorder?: CallRecorder } = {},
): Promise<ParsedIcp> {
  const res = await complete(adapter, buildIcpPrompt(prompt), IcpCriteria, { task: "icp_parse", recorder: opts.recorder });
  return {
    criteria: enrichCriteria(res.data, prompt),
    threshold: DEFAULT_THRESHOLD,
    model: res.model,
    usage: res.usage,
    is_mock: res.is_mock,
  };
}
