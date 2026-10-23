import type { CredibleInterval } from "@/features/metrics/beta";

export const SOURCE_LABELS: Record<string, string> = {
  osm: "OpenStreetMap",
  rues: "RUES",
  reps: "REPS",
  secop: "SECOP II",
  rnt: "RNT",
  solidaria: "Supersolidaria",
  google_places: "Google Places",
  website: "Sitio web",
  meta_ads: "Pauta (Meta)",
  sample: "Muestra",
};
export const CONTACT_LABELS: Record<string, string> = {
  email: "Correo",
  web_form: "Formulario",
  whatsapp: "WhatsApp",
  dapta_widget: "Widget Dapta",
};
export const sourceLabel = (s: string | null) => (s ? (SOURCE_LABELS[s] ?? s) : "—");
export const contactLabel = (c: string | null) => (c ? (CONTACT_LABELS[c] ?? c) : "—");

export const INSUFFICIENT = "Datos insuficientes";

/** USD with enough precision for sub-dollar acquisition costs: $0.067, $7.60, $1,204. */
export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : abs === 0 ? 2 : 3;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** 0..1 -> "12,5 %" style percentage with one decimal (es-CO uses comma). */
export function fmtPct(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  return `${(rate * 100).toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} %`;
}

export function fmtInterval(ci: Pick<CredibleInterval, "lo" | "hi">): string {
  return `IC 90 %: ${fmtPct(ci.lo)} a ${fmtPct(ci.hi)}`;
}

export const fmtInt = (n: number) => n.toLocaleString("es-CO");
