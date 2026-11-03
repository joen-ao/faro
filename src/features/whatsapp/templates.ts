import type { Env } from "@/lib/env";

/**
 * WhatsApp templates approved by Meta, sent through Dapta (F24). Every one names who writes, why we have the number
 * and how to opt out ("responda BAJA"). Variables are always `nombre` (body) and `slug` (URL button /d/{{slug}}).
 */
export type TemplateKey = "faro_diagnostico_clinica" | "faro_diagnostico_empresa" | "faro_diagnostico_independiente";

export interface WaTemplate {
  key: TemplateKey;
  label: string;
  /** Dapta template id; null = not created/approved yet, never offered. */
  daptaId: string | null;
  /** Body with {{nombre}}, as Meta approved it (stored on the message for the record). */
  body: string;
}


export function waTemplates(env: Pick<Env, "DAPTA_WA_TEMPLATE_CLINICA" | "DAPTA_WA_TEMPLATE_EMPRESA" | "DAPTA_WA_TEMPLATE_INDEPENDIENTE">): Record<TemplateKey, WaTemplate> {
  return {
    faro_diagnostico_clinica: {
      key: "faro_diagnostico_clinica",
      label: "Clínica (REPS)",
      // F38: the old Faro · 30X Hackathon template (4c0206b2-…) is no longer sent; nothing goes out until this is set.
      daptaId: env.DAPTA_WA_TEMPLATE_CLINICA ?? null,
      body: "Hola, {{nombre}}. Le escribe el equipo de Mokub. Su clínica aparece en el registro público REPS y preparamos un diagnóstico gratuito de cómo atiende y agenda pacientes nuevos. ¿Le gustaría verlo? Si no desea recibir más mensajes, responda BAJA.",
    },
    faro_diagnostico_empresa: {
      key: "faro_diagnostico_empresa",
      label: "Empresa",
      daptaId: env.DAPTA_WA_TEMPLATE_EMPRESA ?? null,
      body: "Hola, {{nombre}}. Le escribe el equipo de Mokub. Encontramos su empresa en un registro público y preparamos un diagnóstico gratuito de su presencia digital: cómo la encuentran y cómo le escriben sus clientes. ¿Le gustaría verlo y, si le sirve, agendar una videollamada de 20 minutos? Si no desea recibir más mensajes, responda BAJA.",
    },
    faro_diagnostico_independiente: {
      key: "faro_diagnostico_independiente",
      label: "Independiente",
      daptaId: env.DAPTA_WA_TEMPLATE_INDEPENDIENTE ?? null,
      body: "Hola, {{nombre}}. Le escribe el equipo de Mokub. Su negocio aparece en un registro público y preparamos un diagnóstico gratuito de cómo lo encuentran y le escriben sus clientes. ¿Le gustaría verlo? Si no desea recibir más mensajes, responda BAJA.",
    },
  };
}

/**
 * The clinic template says "aparece en el registro público REPS": only true for a lead with a REPS source.
 * Otherwise the generic company or independent template. A template without its id configured is never offered.
 */
export function pickTemplate(
  lead: { hasReps: boolean; independent: boolean },
  templates: Record<TemplateKey, WaTemplate>,
): WaTemplate | null {
  const t = lead.hasReps ? templates.faro_diagnostico_clinica : lead.independent ? templates.faro_diagnostico_independiente : templates.faro_diagnostico_empresa;
  return t.daptaId ? t : null;
}

export const renderTemplate = (t: WaTemplate, nombre: string) => t.body.replace("{{nombre}}", nombre);
