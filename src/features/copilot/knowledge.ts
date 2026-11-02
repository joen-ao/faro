/**
 * F29 · Curated rules for the ad copilot, distilled from docs/research/meta-ads-playbook-2026.md
 * (chapters 2–4). This is what reaches the model; the full playbook stays as reference.
 */

export const FORMAT_HINTS = ["video_fundador", "demo_pantalla", "estatico", "carrusel"] as const;
export type FormatHint = (typeof FORMAT_HINTS)[number];

export const FORMAT_LABELS: Record<FormatHint, string> = {
  video_fundador: "Video del fundador (9:16, 20–30 s, subtitulado)",
  demo_pantalla: "Demo en pantalla (grabación real, datos ficticios)",
  estatico: "Imagen estática",
  carrusel: "Carrusel",
};

/** Rules the model must follow when writing ad variants (playbook cap. 4, 10 and plan §3). */
export const COPY_RULES = [
  "Each variant must be a DIFFERENT concept (angle + format + first frame), not a rewording: Meta's Andromeda groups near-duplicate ads and shows them to the same people.",
  "Angles that work for B2B services: specific operational pain of the ideal customer, concrete outcome described without numbers, real product demo, founder talking to camera, the free diagnosis as the offer with the price as a qualifier.",
  "Hook = what the first 2–3 seconds say or show; it must name the pain or the situation, not the company.",
  "Neutral Latin American Spanish, 'tú' unless the brief says otherwise, short sentences, one idea per ad, one clear call to action.",
  "Mention the reference price from the catalog when it helps filter (e.g. 'Proyectos desde USD 3.000'); never invent or change prices.",
  "Never promise results ('garantizado', 'duplica', 'x10', percentages, 'sin riesgo', 'resultados inmediatos'), never say AI 'replaces your team'.",
  "Never refer to personal attributes of the reader ('¿Eres…?', '¿Tienes problemas de…?', '¿Sufres…?'): describe the business situation instead.",
  "Never invent clients, case studies, testimonials or figures.",
  "primaryText max 500 chars (aim for 150–300), headline max 80 (aim for under 40), description max 120.",
] as const;

/** Phrases/patterns the policy linter blocks (Meta ad standards + Colombian consumer protection, playbook cap. 10). */
export const BLOCKED_PATTERNS: { id: string; re: RegExp; message: string }[] = [
  { id: "promesa_garantia", re: /garantiz/i, message: "Promete resultados ('garantizado'). Meta rechaza promesas de resultados." },
  { id: "promesa_multiplica", re: /\b(duplica\w*|triplica\w*|multiplica\w*)\b|\bx\s?\d{1,3}\b/i, message: "Promete multiplicar resultados ('duplica', 'x10')." },
  { id: "porcentaje", re: /\d+(?:[.,]\d+)?\s?%/, message: "Usa un porcentaje sin fuente verificable." },
  { id: "sin_riesgo", re: /\bsin riesgo\b|resultados? (inmediat|asegurad)\w*/i, message: "Promete ausencia de riesgo o resultados inmediatos." },
  { id: "reemplaza_equipo", re: /reemplaz\w*\s+(a\s+)?(tu|su|tus|sus)\s+(equipo|empleados|personal)/i, message: "Dice que la IA reemplaza al equipo (sensible y fuera de la oferta)." },
  { id: "atributo_personal", re: /¿\s*(eres|est[áa]s|tienes|sufres|te sientes)\b/i, message: "Alude a atributos personales del lector ('¿Eres…?'). Describe la situación del negocio." },
];
