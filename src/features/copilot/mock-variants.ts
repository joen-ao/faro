/** Mock reply for `ad_variants`: deterministic, built from the payload (never presented as real). */
export function mockAdVariants(payloadLine: string): string {
  let p: { service?: { name?: string; price?: string; entryOffer?: string }; count?: number } = {};
  try {
    p = JSON.parse(payloadLine);
  } catch {
    /* defaults below */
  }
  const name = p.service?.name ?? "agentes de IA";
  const price = p.service?.price ? ` ${p.service.price}.` : "";
  const offer = (p.service?.entryOffer ?? "Diagnóstico gratuito").replace(/[.\s]+$/, "");
  const base = [
    { angle: "Dolor operativo", format_hint: "video_fundador", hook: "Responder WhatsApp a mano a las 11 p. m. no escala.", primaryText: `Muchas pymes pierden consultas porque nadie alcanza a responder a tiempo. Con ${name} atendemos, preguntamos lo clave y te pasamos solo las conversaciones listas para una llamada.${price} ${offer}.`, headline: "Deja de perder consultas", cta: "LEARN_MORE", hypothesis: "El dolor concreto de responder tarde conecta más que hablar de tecnología." },
    { angle: "Demo real", format_hint: "demo_pantalla", hook: "Esta conversación la llevó un agente de IA, no una persona.", primaryText: `Así se ve ${name} en una conversación real con datos de prueba: saluda, entiende qué necesita el cliente y agenda la llamada con tu equipo. Lo diseñamos con tus preguntas y tus reglas.`, headline: "Mira cómo trabaja", cta: "LEARN_MORE", hypothesis: "Ver el producto funcionando reduce la desconfianza hacia la IA." },
    { angle: "Diagnóstico con precio", format_hint: "estatico", hook: "Diagnóstico de automatización para empresas", primaryText: `Somos un estudio de IA en Bogotá. Revisamos cómo entran y se atienden hoy tus clientes potenciales y te proponemos qué automatizar.${price} ${offer}, sin compromiso.`, headline: "Diagnóstico sin compromiso", cta: "GET_QUOTE", hypothesis: "Mostrar el precio filtra curiosos y sube la tasa de calificación." },
    { angle: "Fundador a cámara", format_hint: "video_fundador", hook: "Somos dos: quien diseña y quien programa tu sistema.", primaryText: `Sin intermediarios ni juniors escondidos: hablas directo con quien diseña y con quien construye ${name}. Propuesta clara en menos de 24 h.`, headline: "Habla con quien lo construye", cta: "CONTACT_US", hypothesis: "La cercanía del equipo pequeño diferencia frente a agencias grandes." },
    { angle: "Antes y después del proceso", format_hint: "carrusel", hook: "Así cambia la atención de tus clientes potenciales.", primaryText: `Antes: mensajes sin responder y datos en hojas sueltas. Después: ${name} responde, ordena y avisa a tu equipo cuando hay una oportunidad real.`, headline: "Del caos al proceso", cta: "LEARN_MORE", hypothesis: "Contrastar el proceso actual con el automatizado hace tangible el valor." },
  ];
  return JSON.stringify({ variants: base.slice(0, Math.min(Math.max(p.count ?? 4, 3), 5)) });
}
