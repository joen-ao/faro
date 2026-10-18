import type { ServiceInput } from "@/features/offer/schema";

/**
 * Initial catalog: the real services of Mokub (mokub.co), the team's studio. Used while app_settings 'services'
 * is empty, so production shows them without writing to the database; editing them in /app/settings/oferta
 * saves a copy to app_settings. Only facts published by Mokub; no person names.
 */
export const DEFAULT_CATALOG_SOURCE = "mokub.co";

export const DEFAULT_COMPANY = {
  name: "Mokub",
  about: "Estudio AI-first de Bogotá con clientes en EE. UU., España y Latinoamérica.",
  pitch: "Para negocios cuyas mejores horas se van en trabajo que un agente podría hacer solo.",
} as const;

export const DEFAULT_CATALOG_NOTE = "Mantenimiento mensual disponible: hosting, cambios, monitoreo y evolución.";

export const DEFAULT_SERVICES: ServiceInput[] = [
  {
    id: "agentes-ia",
    name: "Agentes de IA y automatización",
    description:
      "Agentes que trabajan dentro de la operación real: responden, clasifican, extraen datos y ejecutan tareas con supervisión humana. Construidos para producción, no para la demo.",
    outcome: "Menos trabajo manual y repetitivo; procesos que pasan de horas a minutos.",
    proof: "Proceso crítico automatizado en Banco de la República: de 30 h a 15 min. Más de 15 proyectos en producción.",
    entryOffer: "Llamada de descubrimiento gratuita de 15–20 min.",
    keywords: ["whatsapp", "agenda", "citas", "respuesta", "formulario", "fuera de horario"],
  },
  {
    id: "rag",
    name: "Sistemas RAG y bases de conocimiento",
    description: "Convierten información dispersa en una base que los agentes consultan con búsqueda semántica.",
    outcome: "Respuestas precisas basadas en la información del negocio.",
    proof: "Call center farmacéutico con dominio de seguridad del paciente.",
    entryOffer: "Propuesta gratuita en menos de 24 h.",
    keywords: ["información", "preguntas frecuentes", "soporte"],
  },
  {
    id: "software-crm",
    name: "Software y CRMs a medida",
    description: "Aplicaciones y sistemas completos para casos que ninguna herramienta del mercado resuelve.",
    outcome: "Software hecho exactamente para cómo trabaja el negocio.",
    proof: "CRM B2B SaaS con agentes de IA integrados (Nirbound); sistema con 5 módulos de IA (KOS).",
    entryOffer: "Desde USD 3.000 · propuesta gratuita en menos de 24 h.",
    keywords: ["agenda", "pacientes", "seguimiento", "crm"],
  },
  {
    id: "landing-webs",
    name: "Landing pages y webs",
    description: "Páginas rápidas, hechas a mano y diseñadas por una diseñadora UI/UX. Entrega en días, no en meses.",
    outcome: "Un sitio moderno que convierte visitas en clientes.",
    entryOffer: "Desde USD 450.",
    keywords: ["sin sitio web", "sitio desactualizado", "copyright viejo", "sin formulario", "sin agenda en línea"],
  },
];
