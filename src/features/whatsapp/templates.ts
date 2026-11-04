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
  /** F45 · Name of the template in Meta (same text and buttons), used with WHATSAPP_SEND_MODE=cloud_api. */
  metaName: string;
  /** What the sender uses: the Dapta id (dapta_flow) or the Meta name once APPROVED (cloud_api); null = not offered. */
  sendRef: string | null;
  /** Body with {{nombre}}, as Meta approved it (stored on the message for the record). */
  body: string;
}


/** Meta names of the three Mokub templates (created from Dapta's panel, F37). */
export const META_TEMPLATE_NAMES: Record<TemplateKey, string> = {
  faro_diagnostico_clinica: "mokub_diagnostico_clinica",
  faro_diagnostico_empresa: "mokub_diagnostico_empresa",
  faro_diagnostico_independiente: "mokub_diagnostico_independiente",
};

type TemplateEnv = Pick<Env, "DAPTA_WA_TEMPLATE_CLINICA" | "DAPTA_WA_TEMPLATE_EMPRESA" | "DAPTA_WA_TEMPLATE_INDEPENDIENTE"> & Partial<Pick<Env, "WHATSAPP_SEND_MODE">>;

/** `approved`: Meta template names with status APPROVED (cloud_api mode only). */
export function waTemplates(env: TemplateEnv, approved: ReadonlySet<string> = new Set()): Record<TemplateKey, WaTemplate> {
  const cloud = env.WHATSAPP_SEND_MODE === "cloud_api";
  const ref = (key: TemplateKey, daptaId: string | null) => (cloud ? (approved.has(META_TEMPLATE_NAMES[key]) ? META_TEMPLATE_NAMES[key] : null) : daptaId);
  const t = (key: TemplateKey, label: string, daptaId: string | null, body: string): WaTemplate => ({ key, label, daptaId, metaName: META_TEMPLATE_NAMES[key], sendRef: ref(key, daptaId), body });
  // F38: the old Faro · 30X Hackathon template (4c0206b2-…) is no longer sent; nothing goes out until the id is set.
  return {
    faro_diagnostico_clinica: t("faro_diagnostico_clinica", "Clínica (REPS)", env.DAPTA_WA_TEMPLATE_CLINICA ?? null, "Hola, {{nombre}}. Le escribe el equipo de Mokub. Su clínica aparece en el registro público REPS y preparamos un diagnóstico gratuito de cómo atiende y agenda pacientes nuevos. ¿Le gustaría verlo? Si no desea recibir más mensajes, responda BAJA."),
    faro_diagnostico_empresa: t("faro_diagnostico_empresa", "Empresa", env.DAPTA_WA_TEMPLATE_EMPRESA ?? null, "Hola, {{nombre}}. Le escribe el equipo de Mokub. Encontramos su empresa en un registro público y preparamos un diagnóstico gratuito de su presencia digital: cómo la encuentran y cómo le escriben sus clientes. ¿Le gustaría verlo y, si le sirve, agendar una videollamada de 20 minutos? Si no desea recibir más mensajes, responda BAJA."),
    faro_diagnostico_independiente: t("faro_diagnostico_independiente", "Independiente", env.DAPTA_WA_TEMPLATE_INDEPENDIENTE ?? null, "Hola, {{nombre}}. Le escribe el equipo de Mokub. Su negocio aparece en un registro público y preparamos un diagnóstico gratuito de cómo lo encuentran y le escriben sus clientes. ¿Le gustaría verlo? Si no desea recibir más mensajes, responda BAJA."),
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
  return t.sendRef ? t : null;
}

export const renderTemplate = (t: WaTemplate, nombre: string) => t.body.replace("{{nombre}}", nombre);
