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

const CLINIC_ID = "4c0206b2-ad45-43e0-9d74-c27a3b1640df";

export function waTemplates(env: Pick<Env, "DAPTA_WA_TEMPLATE_EMPRESA" | "DAPTA_WA_TEMPLATE_INDEPENDIENTE">): Record<TemplateKey, WaTemplate> {
  return {
    faro_diagnostico_clinica: {
      key: "faro_diagnostico_clinica",
      label: "Clínica (REPS)",
      daptaId: CLINIC_ID,
      body: "Hola, {{nombre}}. Somos Faro, un proyecto del 30X Hackathon. Su clínica aparece en el registro público REPS y preparamos un diagnóstico gratuito de cómo atiende y agenda pacientes nuevos. ¿Le interesa que le contemos en 2 minutos? Si no desea recibir más mensajes, responda BAJA.",
    },
    faro_diagnostico_empresa: {
      key: "faro_diagnostico_empresa",
      label: "Empresa",
      daptaId: env.DAPTA_WA_TEMPLATE_EMPRESA ?? null,
      body: "Hola, {{nombre}}. Le escribe Mokub con Faro. Encontramos su empresa en un registro público y preparamos un diagnóstico gratuito de su presencia digital: cómo la encuentran y cómo le escriben sus clientes. ¿Le interesa que le contemos en 2 minutos? Si no desea recibir más mensajes, responda BAJA.",
    },
    faro_diagnostico_independiente: {
      key: "faro_diagnostico_independiente",
      label: "Independiente",
      daptaId: env.DAPTA_WA_TEMPLATE_INDEPENDIENTE ?? null,
      body: "Hola, {{nombre}}. Le escribe Mokub con Faro. Su negocio aparece en un registro público y preparamos un diagnóstico gratuito de cómo lo encuentran y le escriben sus clientes. ¿Le interesa verlo? Si no desea recibir más mensajes, responda BAJA.",
    },
  };
}

/**
 * The clinic template says "aparece en el registro público REPS": only true for a lead with a REPS source.
 * Otherwise the generic company or independent template (when its id is configured).
 */
export function pickTemplate(
  lead: { hasReps: boolean; independent: boolean },
  templates: Record<TemplateKey, WaTemplate>,
): WaTemplate | null {
  if (lead.hasReps) return templates.faro_diagnostico_clinica;
  const t = lead.independent ? templates.faro_diagnostico_independiente : templates.faro_diagnostico_empresa;
  return t.daptaId ? t : null;
}

export const renderTemplate = (t: WaTemplate, nombre: string) => t.body.replace("{{nombre}}", nombre);
