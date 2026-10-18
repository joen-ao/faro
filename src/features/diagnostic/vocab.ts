/** Health searches (dental, REPS, CIIU 86xx) keep the clinic/patient copy; every other sector reads "empresa"/"cliente". */
export function isHealthSector(criteria: unknown): boolean {
  const c = (criteria ?? {}) as { sector?: unknown; ciiu?: unknown; osmTags?: unknown };
  const sector = typeof c.sector === "string" ? c.sector.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase() : "";
  const ciiu = Array.isArray(c.ciiu) ? c.ciiu.map(String) : [];
  const tags = Array.isArray(c.osmTags) ? c.osmTags.map(String) : [];
  if (!sector && !ciiu.length && !tags.length) return true; // demo / legacy pages: unchanged
  return /dental|odonto|clinic|salud|medic|ips|consultorio/.test(sector) || ciiu.some((x) => x.startsWith("86")) || tags.some((t) => /dentist|clinic|doctor|hospital/.test(t));
}

const SWAPS: Array<[RegExp, string]> = [
  // Appointment wording first (longest phrases before single words).
  [/costándole citas/g, "costándole clientes"],
  [/«Agendar cita»/g, "«Agendar asesoría»"],
  [/«Hola, quiero pedir una cita»/g, "«Hola, quiero una asesoría»"],
  [/agendar citas en línea/g, "agendar asesorías en línea"],
  [/pide cita/g, "pide una asesoría"],
  [/pida cita/g, "pida una asesoría"],
  [/pedir cita/g, "pedir una asesoría"],
  [/confirme la cita/g, "confirme la reunión"],
  [/buscan cita/g, "buscan asesoría"],
  [/recibir más citas/g, "recibir más clientes"],
  [/conversaciones y citas/g, "conversaciones y reuniones"],
  [/\bcitas\b/g, "reuniones"],
  [/\bcita\b/g, "reunión"],
  [/captación de pacientes/g, "captación de clientes"],
  [/pacientes/g, "clientes"],
  [/Pacientes/g, "Clientes"],
  [/paciente/g, "cliente"],
  [/clínicas/g, "empresas"],
  [/Clínicas/g, "Empresas"],
  [/clínica/g, "empresa"],
  [/Clínica/g, "Empresa"],
  [/motivo de consulta/g, "motivo de contacto"],
];

/** Swaps the clinic vocabulary for a generic business one (all swaps keep gender and number: la clínica -> la empresa). */
export function localize(text: string, health: boolean): string {
  if (health) return text;
  return SWAPS.reduce((s, [re, to]) => s.replace(re, to), text);
}
