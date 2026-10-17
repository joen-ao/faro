/**
 * Heuristic for OSM / Places names that read like a natural person (SPEC §8: never store personal names).
 * Positive when the name starts with a professional title, or when it has 2-4 alphabetic words,
 * none of them a business word, and at least one is a common given name.
 * Conservative on purpose in one direction: anything with a business word ("Consultorio Dr. Pérez") is kept.
 */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const TITLE = /^\s*(dr|dra|doc|doctor|doctora|od|odont|odontologo|odontologa|odontol|dr\.|dra\.|od\.|odont\.)(\.|\s)/i;

const BUSINESS_WORDS = new Set(
  [
    "clinica", "clinic", "consultorio", "centro", "center", "dental", "dentist", "dentistry", "odontologia", "odontologico", "odontologica", "odonto",
    "ortodoncia", "ortodoncista", "endodoncia", "ips", "studio", "estudio", "salud", "oral", "sonrisa", "sonrisas", "smile", "sas", "ltda", "eu", "sa",
    "grupo", "instituto", "laboratorio", "hospital", "restaurante", "restaurant", "cafe", "bar", "grill", "pizzeria", "cocina", "kitchen", "food", "foods",
    "comidas", "parrilla", "bistro", "burger", "sushi", "cia", "y", "de", "del", "la", "el", "los", "las", "the", "and", "&", "group", "care", "health",
    "medical", "medico", "especializada", "especialistas", "express", "plus", "arte", "art", "lab", "dent", "rehabilitacion", "estetica", "implantes",
    "servicios", "soluciones", "empresa", "company", "corp", "inc", "llc", "co", "bogota", "miami", "norte", "sur", "centro", "andina", "colombia",
  ].map(fold),
);

const GIVEN_NAMES = new Set(
  [
    "juan", "jose", "luis", "carlos", "jorge", "pedro", "miguel", "andres", "camilo", "david", "daniel", "diego", "felipe", "sergio", "ricardo", "fernando",
    "alejandro", "oscar", "javier", "mario", "manuel", "alberto", "eduardo", "gustavo", "hector", "julian", "mauricio", "nicolas", "santiago", "sebastian",
    "ana", "maria", "carolina", "paola", "claudia", "diana", "sandra", "liliana", "patricia", "martha", "marta", "luz", "gloria", "adriana", "andrea",
    "natalia", "laura", "catalina", "juliana", "angela", "yanira", "monica", "viviana", "carmen", "sofia", "isabel", "lucia", "elena", "johana", "jhon",
    "john", "michael", "robert", "william", "james", "mary", "jennifer", "linda", "susan", "karen", "lisa", "jessica", "sarah", "thomas", "charles", "richard",
    "gomez", "perez", "rodriguez", "garcia", "martinez", "lopez", "gonzalez", "hernandez", "ramirez", "torres", "cruz", "diaz", "vargas", "castro", "rojas",
    "moreno", "jimenez", "ruiz", "mejia", "ortiz", "silva", "suarez", "mendoza", "salazar", "cardenas", "bustos", "navarro", "smith", "johnson", "brown",
  ].map(fold),
);

/** True when the name looks like a natural person (to be excluded, never stored or shown). */
export function looksLikePersonName(name: string | null | undefined): boolean {
  if (!name) return false;
  const raw = name.trim();
  if (!raw) return false;
  const lowered = fold(raw);
  const words = lowered.replace(/[^a-z\s.]/g, " ").split(/\s+/).map((w) => w.replace(/\./g, "")).filter(Boolean);
  // A leading professional title ("Dra. Ana Gómez", "Od. Pérez") always means a person.
  if (TITLE.test(lowered + " ")) return true;
  if (words.some((w) => BUSINESS_WORDS.has(w))) return false;
  if (words.length < 2 || words.length > 4) return false;
  if (!words.every((w) => /^[a-z]+$/.test(w))) return false;
  return words.some((w) => GIVEN_NAMES.has(w));
}
