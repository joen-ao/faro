export const DEFAULT_WHATSAPP_NUMBER = "573014734934";

/** wa.me link with a prefilled message naming the company and the page reference (slug). */
export function whatsappHref(number: string | undefined, company: string | undefined, slug: string): string {
  const digits = (number ?? "").replace(/\D/g, "") || DEFAULT_WHATSAPP_NUMBER;
  const ref = slug.startsWith("icp:") ? slug.slice(4) : slug;
  const text = company
    ? `Hola, vi el diagnóstico de captación de pacientes de ${company} (ref. ${ref}) y quiero hablar sobre cómo conseguir más pacientes.`
    : `Hola, vi la página de diagnóstico (ref. ${ref}) y quiero saber cómo conseguir más pacientes.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
