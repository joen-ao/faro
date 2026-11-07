import type { FindingKind } from "./schema";

/**
 * F52 · What a gap costs, with a source. Only figures checked against a primary source or a recognised outlet
 * (2026-11-07); the model never writes numbers. Health-only figures are shown only in health searches.
 */
export interface Evidence {
  id: string;
  /** The big number ("7×", "42 %"). */
  figure: string;
  /** One sentence, usted, with the figure in it (page). */
  text: string;
  /** Shorter version for the email (≤ 16 words), figure included. */
  short: string;
  /** Short attribution shown next to the text. */
  source: string;
  url: string;
  healthOnly?: boolean;
}

const HBR: Evidence = {
  id: "hbr-first-hour",
  figure: "7×",
  text: "Las empresas que contactan a un interesado en la primera hora tienen casi 7 veces más probabilidad de concretar una conversación que las que esperan una hora más.",
  short: "responder en la primera hora da casi 7 veces más probabilidad de concretar",
  source: "Harvard Business Review, 2011 (1,25 millones de contactos)",
  url: "https://hbr.org/2011/03/the-short-life-of-online-sales-leads",
};
const ZOCDOC: Evidence = {
  id: "zocdoc-after-hours",
  figure: "42 %",
  text: "El 42 % de las citas que los pacientes reservan en línea se hacen con el consultorio cerrado.",
  short: "el 42 % de las citas en línea se reservan con el consultorio cerrado",
  source: "Zocdoc, What Patients Want 2024",
  url: "https://www.techtarget.com/PatientEngagement/news/366617196/Zocdoc-Timeliness-is-key-patient-self-scheduling-preference",
  healthOnly: true,
};
const SURESCRIPTS: Evidence = {
  id: "surescripts-online-booking",
  figure: "44 %",
  text: "El 44 % de los pacientes, entre dos médicos parecidos, elegiría al que deja agendar en línea.",
  short: "el 44 % de los pacientes prefiere al médico que deja agendar en línea",
  source: "Encuesta Surescripts (MobiHealthNews)",
  url: "https://www.mobihealthnews.com/node/120571",
  healthOnly: true,
};
const GOOGLE_NEARBY: Evidence = {
  id: "google-nearby",
  figure: "76 %",
  text: "El 76 % de quienes buscan en el celular algo cercano visita un negocio relacionado en menos de un día.",
  short: "el 76 % de quienes buscan algo cercano en el celular lo visita en menos de un día",
  source: "Think with Google",
  url: "https://www.thinkwithgoogle.com/data/mobile-near-me-searches/",
};

const BY_FINDING: Partial<Record<FindingKind, readonly Evidence[]>> = {
  whatsapp: [HBR],
  form: [HBR],
  booking: [ZOCDOC, SURESCRIPTS, HBR],
  "no-website": [GOOGLE_NEARBY],
  freshness: [GOOGLE_NEARBY],
};

/** The best figure for one finding (health figures only in health searches). */
export function evidenceFor(finding: FindingKind | string, health = true): Evidence | null {
  return (BY_FINDING[finding as FindingKind] ?? []).find((e) => health || !e.healthOnly) ?? null;
}

/** Up to `max` distinct figures for a set of open findings, in the findings' order. */
export function evidenceForAll(findings: readonly string[], health = true, max = 3): Evidence[] {
  const out: Evidence[] = [];
  for (const f of findings) {
    for (const e of BY_FINDING[f as FindingKind] ?? []) {
      if ((health || !e.healthOnly) && !out.some((o) => o.id === e.id)) {
        out.push(e);
        break;
      }
    }
    if (out.length >= max) break;
  }
  return out;
}

/** The email line: the figure sentence plus its source in parentheses. */
export const evidenceLine = (e: Evidence) => `Dato: ${e.short} (${evidenceSourceShort(e)}).`;
/** "Harvard Business Review, 2011 (…)" -> "Harvard Business Review" */
export const evidenceSourceShort = (e: Evidence) => e.source.replace(/ \(.*\)$/, "").replace(/, (What Patients Want )?\d{4}.*$/, "").replace(/^Encuesta /, "");
