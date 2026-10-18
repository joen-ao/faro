import { localize } from "./vocab";
export const DEFAULT_WHATSAPP_NUMBER = "573014734934";

const digitsOf = (number: string | undefined) => (number ?? "").replace(/\D/g, "") || DEFAULT_WHATSAPP_NUMBER;

/** wa.me link with a prefilled message naming the company and the page reference (slug). */
export function whatsappHref(number: string | undefined, company: string | undefined, slug: string, health = true): string {
  const digits = digitsOf(number);
  const ref = slug.startsWith("icp:") ? slug.slice(4) : slug;
  const text = company
    ? `Hola, vi el diagnóstico de captación de pacientes de ${company} (ref. ${ref}) y quiero hablar sobre cómo conseguir más pacientes.`
    : `Hola, vi la página de diagnóstico (ref. ${ref}) y quiero saber cómo conseguir más pacientes.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(localize(text, health))}`;
}

/** Human-readable number for the page ("+57 301 473 4934" for Colombian mobiles, "+<digits>" otherwise). */
export function whatsappDisplay(number: string | undefined): string {
  const d = digitsOf(number);
  return d.length === 12 && d.startsWith("57") ? `+57 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : `+${d}`;
}
