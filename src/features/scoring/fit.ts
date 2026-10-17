import { z } from "zod";
import type { IcpCriteria } from "@/features/icp/schema";
import { DEFAULT_THRESHOLD } from "@/features/icp/schema";
import { complete, type AnthropicAdapter, type CallRecorder, type Usage } from "@/integrations/anthropic";

export interface ScoreSource {
  channel: string;
  url: string | null;
  osmTags?: string[];
  ciiu?: string | null;
  placesTypes?: string[];
}

export interface ScoreContact {
  type: string;
  value: string;
  isGeneric: boolean;
  evidenceUrl: string | null;
}

export interface ScoreCompany {
  name: string;
  city: string | null;
  website: string | null;
  nit: string | null;
  isLegalEntity: boolean;
  contacts: ScoreContact[];
  sources: ScoreSource[];
  /** Text fetched from the company's own site (F10). Only input for AI signal checks. */
  websiteText?: string | null;
}

export interface CriterionResult {
  criterio: string;
  cumplido: boolean;
  evidencia: string;
  url: string | null;
  peso: number;
}

export interface FitResult {
  score: number;
  threshold: number;
  meetsThreshold: boolean;
  criteria: CriterionResult[];
  why_now: string;
  model: string | null;
  usage: Usage;
  is_mock: boolean;
}

export const SignalReply = z.object({
  signals: z.array(z.object({ signal: z.string(), found: z.boolean(), quote: z.string().default("") })),
  why_now: z.string().default(""),
});

const WEIGHTS = { web: 20, contact: 20, legal: 20, sector: 20, city: 10, signals: 10 } as const;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const firstUrl = (c: ScoreCompany) => c.sources.find((s) => s.url)?.url ?? c.website ?? null;

/** A criterion counts as met only when it carries evidence text AND a URL. */
function crit(criterio: string, peso: number, ok: boolean, evidencia: string, url: string | null): CriterionResult {
  const met = ok && !!evidencia && !!url;
  return { criterio, cumplido: met, evidencia: met ? evidencia : ok ? "Sin URL de respaldo" : evidencia, url: met ? url : null, peso };
}

export function buildSignalsPrompt(signals: string[], text: string): string {
  return [
    "[[task:score_signals]]",
    'For each signal decide whether the company website text proves it. Reply JSON: {"signals":[{"signal":string,"found":boolean,"quote":string}],"why_now":string}.',
    "quote MUST be copied verbatim from the text; if you cannot quote it, found=false. why_now: one sentence in Spanish or empty.",
    "PAYLOAD:",
    JSON.stringify({ signals, text: text.slice(0, 8000) }),
  ].join("\n");
}

export interface ScoreOptions {
  ai?: AnthropicAdapter;
  recorder?: CallRecorder;
  threshold?: number;
}

export async function scoreFit(company: ScoreCompany, criteria: IcpCriteria, opts: ScoreOptions = {}): Promise<FitResult> {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };
  const out: CriterionResult[] = [];

  // Exclusions short-circuit to 0 (evidence: the matching name).
  const name = norm(company.name);
  const excluded = criteria.exclusions.find((e) => name.includes(norm(e)));
  if (excluded) {
    out.push({ criterio: "Sin exclusiones del ICP", cumplido: false, evidencia: `El nombre contiene "${excluded}"`, url: firstUrl(company), peso: 0 });
    return { score: 0, threshold, meetsThreshold: false, criteria: out, why_now: "", model: null, usage, is_mock: false };
  }

  out.push(
    crit("Tiene sitio web", WEIGHTS.web, !!company.website, `Sitio web registrado: ${company.website}`, company.website),
  );

  const generic = company.contacts.find((c) => c.isGeneric && (c.evidenceUrl || company.website));
  out.push(
    crit(
      "Contacto generico verificable",
      WEIGHTS.contact,
      !!generic,
      generic ? `Contacto generico (${generic.type}) publicado en la fuente` : "Sin contacto generico",
      generic ? (generic.evidenceUrl ?? company.website) : null,
    ),
  );

  const registry = company.sources.find((s) => (s.channel === "rues" || s.channel === "reps") && s.url);
  out.push(
    crit(
      "Persona juridica verificada",
      WEIGHTS.legal,
      company.isLegalEntity && !!company.nit && !!registry,
      registry ? `NIT ${company.nit} en registro ${registry.channel.toUpperCase()}` : "Sin registro oficial (RUES/REPS)",
      registry?.url ?? null,
    ),
  );

  const matchSrc = company.sources.find(
    (s) =>
      s.url &&
      (s.osmTags?.some((t) => criteria.osmTags.includes(t)) ||
        (s.ciiu && criteria.ciiu.includes(s.ciiu)) ||
        s.placesTypes?.some((t) => criteria.placesTypes.includes(t))),
  );
  const matchLabel = matchSrc
    ? [
        ...(matchSrc.osmTags ?? []).filter((t) => criteria.osmTags.includes(t)),
        ...(matchSrc.ciiu && criteria.ciiu.includes(matchSrc.ciiu) ? [`CIIU ${matchSrc.ciiu}`] : []),
        ...(matchSrc.placesTypes ?? []).filter((t) => criteria.placesTypes.includes(t)),
      ].join(", ")
    : "";
  out.push(
    crit(
      `Sector coincide (${criteria.sector})`,
      WEIGHTS.sector,
      !!matchSrc,
      matchSrc ? `${matchSrc.channel}: ${matchLabel}` : "Ninguna fuente confirma el sector",
      matchSrc?.url ?? null,
    ),
  );

  const cityOk = !!company.city && norm(company.city) === norm(criteria.city);
  out.push(crit(`Ciudad: ${criteria.city}`, WEIGHTS.city, cityOk, `Ciudad registrada: ${company.city}`, firstUrl(company)));

  let whyNow = "";
  let model: string | null = null;
  let isMock = false;
  if (criteria.signals.length > 0) {
    const text = company.websiteText ?? "";
    let verified: Array<{ signal: string; quote: string }> = [];
    if (opts.ai && text.trim() && company.website) {
      const res = await complete(opts.ai, buildSignalsPrompt(criteria.signals, text), SignalReply, {
        task: "score_signals",
        recorder: opts.recorder,
      }).catch(() => null);
      if (res) {
        usage.input_tokens += res.usage.input_tokens;
        usage.output_tokens += res.usage.output_tokens;
        model = res.model;
        isMock = res.is_mock;
        // Never trust a quote that is not literally in the source text.
        verified = res.data.signals
          .filter((s) => s.found && s.quote.trim() && norm(text).includes(norm(s.quote)))
          .map((s) => ({ signal: s.signal, quote: s.quote.trim() }));
        if (verified.length > 0) whyNow = res.data.why_now.trim();
      }
    }
    out.push(
      crit(
        `Senales: ${criteria.signals.join(", ")}`,
        WEIGHTS.signals,
        verified.length > 0,
        verified.length > 0 ? verified.map((v) => `"${v.quote}" (${v.signal})`).join(" | ") : "No se encontro evidencia en el sitio",
        company.website,
      ),
    );
  }

  const applicable = out.filter((c) => c.peso > 0).reduce((a, c) => a + c.peso, 0);
  const earned = out.filter((c) => c.cumplido).reduce((a, c) => a + c.peso, 0);
  const score = applicable > 0 ? Math.round((earned / applicable) * 100) : 0;
  if (!whyNow) {
    const met = out.filter((c) => c.cumplido).map((c) => c.criterio);
    whyNow = met.length ? `Encaja por: ${met.join("; ")}.` : "Sin criterios verificados todavia.";
  }
  return { score, threshold, meetsThreshold: score >= threshold, criteria: out, why_now: whyNow, model, usage, is_mock: isMock };
}
