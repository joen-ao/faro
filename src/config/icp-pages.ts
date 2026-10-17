/** Generic ICP diagnostic pages for paid media (`/d/icp/[icpSlug]?utm_source=meta&utm_campaign=<id>`). SPEC §9.4. */
export interface IcpPage {
  slug: string;
  audience: string;
  headline: string;
  points: string[];
}

export const ICP_PAGES: Record<string, IcpPage> = {
  "clinicas-dentales-bogota": {
    slug: "clinicas-dentales-bogota",
    audience: "Clínicas y consultorios odontológicos de Bogotá",
    headline: "¿Tu clínica pierde pacientes que no llegan a agendar?",
    points: [
      "Revisamos fuentes públicas (REPS, RUES, OpenStreetMap) para mostrarte cómo te encuentra un paciente.",
      "Un asistente de Dapta responde dudas y deja tu solicitud lista para el equipo.",
      "Solo hablamos con empresas: nunca usamos datos de personas naturales.",
    ],
  },
  "dental-miami": {
    slug: "dental-miami",
    audience: "Consultorios dentales de Miami",
    headline: "¿Tu consultorio dental recibe todas las citas que podría?",
    points: [
      "Revisamos fuentes públicas para mostrarte cómo te encuentra un paciente en línea.",
      "Un asistente de Dapta responde dudas y deja tu solicitud lista para el equipo.",
      "Solo hablamos con empresas, nunca con personas naturales.",
    ],
  },
};
