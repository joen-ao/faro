/**
 * Festivos de Colombia 2026 (Ley 51 de 1983 / Emiliani: traslados al lunes siguiente).
 * Fechas ISO en hora local de Bogotá. Verificado contra el calendario oficial 2026
 * (Pascua: 5 abr 2026).
 */
export const HOLIDAYS_CO_2026: Readonly<Record<string, string>> = {
  "2026-01-01": "Año Nuevo",
  "2026-01-12": "Reyes Magos (trasladado)",
  "2026-03-23": "San José (trasladado)",
  "2026-04-02": "Jueves Santo",
  "2026-04-03": "Viernes Santo",
  "2026-05-01": "Día del Trabajo",
  "2026-05-18": "Ascensión del Señor (trasladado)",
  "2026-06-08": "Corpus Christi (trasladado)",
  "2026-06-15": "Sagrado Corazón (trasladado)",
  "2026-06-29": "San Pedro y San Pablo",
  "2026-07-20": "Día de la Independencia",
  "2026-08-07": "Batalla de Boyacá",
  "2026-08-17": "Asunción de la Virgen (trasladado)",
  "2026-10-12": "Día de la Raza (trasladado)",
  "2026-11-02": "Todos los Santos (trasladado)",
  "2026-11-16": "Independencia de Cartagena (trasladado)",
  "2026-12-08": "Inmaculada Concepción",
  "2026-12-25": "Navidad",
};

export const SEND_TIMEZONE_CO = "America/Bogota";

/** Ventanas de envío CO por día de la semana (0 = domingo). Horas locales [inicio, fin). */
export const SEND_WINDOWS_CO: Readonly<Record<number, readonly [number, number] | null>> = {
  0: null,
  1: [7, 19],
  2: [7, 19],
  3: [7, 19],
  4: [7, 19],
  5: [7, 19],
  6: [8, 15],
};
