import { describe, expect, it } from "vitest";
import { classifyBusinessName, hasBrandTag, keepBusinessName, looksLikePersonName, nameCategory } from "@/features/compliance/person-name";

const PEOPLE = [
  "María de los Ángeles Pérez",
  "Ana María de la Cruz",
  "Liliana del Pilar Ruiz",
  "María Fernanda Ospina de Ramírez",
  "Valentina Ospina",
  "Esteban Henao Restrepo",
  "Daniela Gutiérrez",
  "Camila Sánchez Muñoz",
  "Cristian Álvarez",
  "Jairo Castaño",
  "Yeison Muñoz",
  "Alejandra Restrepo",
  "Mariana Henao",
  "Hernán Darío Zapata",
  "Germán Castaño",
  "Luz Marina Ortiz Bustos Peña",
  "Carolina",
  "Pérez",
  "Dra. Ana María Gómez",
  "Dr. Juan Pérez",
  "Doctora Paula Andrea Giraldo",
  "Odontólogo Edgar Ramírez",
  "Gloria Inés Valencia",
  "Andrés Felipe Gómez Restrepo",
  "Claudia Ríos",
  "Od. Carolina Ruiz",
  "Morales Restrepo",
  "Oralia Morales",
  "Gloria Ospina",
  "Liliana Cardona",
  "Mauricio Pérez Navarro",
  "Paola Gómez",
  "Jorge Quintero",
  "Ricardo Peña",
  "Dr. Rojas",
  "Edwin Alexander Corpas",
  "Martha Cecilia Medicis",
];

/** Not in the dictionaries: only the strict allow-list (professional / unknown category) catches them. */
const PEOPLE_STRICT = ["Yuliana Cuervo", "Brayan Steven Mosquera", "Jhonatan Ibarguen", "Yurany Chaverra", "Fredy Alonso Moncada", "Nubia Esperanza Cifuentes"];

/** Real OSM names the F19-r3 review showed were wrongly dropped by the pure allow-list. */
const COMMERCE_KEPT = ["La Mona", "Bellini", "Trento", "Kokorico", "Chalet Suizo", "Renata", "Storia d'Amore", "La Carbonera", "Cuatro Estaciones", "Brasas", "Andrés Carne de Res", "El Corral", "Corpas Pizza", "Medicis Restaurante"];
const CLINICS_KEPT = ["Coodontólogos", "OroSalud", "Prosalud", "COISalud", "Orthoclinic", "Orthoimplant", "Orthosonrisa", "Ortho Day", "Policlinico San Cristobal", "Molarium", "Muelas y Muelitas", "Ondontologia", "Dr. Smile", "Vargas Odontólogos", "Corpas Pizza"];
const MASKED = ["Doctora Xiomara Pérez - Odontología Estética", "Consultorio Odontológico Dra. Ana Gómez", "Clínica odontológica Dra. Nora", "Consultorio Dr. Pérez", "Odontología Dra. Liliana Ruiz"];

const BUSINESSES = [
  "Dr. Smile",
  "Dra. Sonrisa",
  "Doc Dental",
  "Vargas Odontólogos",
  "Clínica Dental Sonrisas",
  "Odontología Integral del Norte",
  "Martha Lucía Spa",
  "Gómez & Asociados",
  "Rodríguez Hermanos",
  "Torres Médicos",
  "Carolina Dental",
  "Ortiz Dental Studio",
  "Torres Gómez Odontología",
  "Mejía Ortodoncia",
  "Sonrisa Perfecta",
  "Clínica Odontológica Marly",
  "Dentix",
  "Smile Center",
  "Restaurante La Brasa Roja",
  "Café del Parque",
  "Acadent",
  "Orallife",
  "Oral Advance AD",
  "Diseña sonrrisas",
];

describe("names of sources without legal nature (allow-list)", () => {
  it.each(PEOPLE)("excludes person name: %s", (n) => {
    expect(keepBusinessName(n)).toBe(false);
  });
  it.each(BUSINESSES)("keeps business name: %s", (n) => {
    expect(keepBusinessName(n)).toBe(true);
  });
  it.each(PEOPLE_STRICT)("strict category excludes person outside the dictionaries: %s", (n) => {
    expect(keepBusinessName(n, { category: "professional" })).toBe(false);
    expect(keepBusinessName(n)).toBe(false);
  });
  it("names without any business word are excluded even when they are not in the person dictionaries", () => {
    expect(keepBusinessName("Prado Veraniego")).toBe(false);
    expect(keepBusinessName("Sonrisan Art")).toBe(true); // "sonri*" counts as a business word
    expect(keepBusinessName("Zxqv Plomp")).toBe(false);
  });
  it("a chain brand tag keeps a name without business words; a person with a title never does", () => {
    expect(keepBusinessName("Cruz Verde", { brand: true })).toBe(true);
    expect(keepBusinessName("Dra. Ana María Gómez", { brand: true })).toBe(false);
    expect(hasBrandTag({ tags: { brand: "Cruz Verde" } })).toBe(true);
    expect(hasBrandTag({ brand: "Cruz Verde" })).toBe(true);
    expect(hasBrandTag({ tags: {} })).toBe(false);
  });
  it("extra sector words widen the allow-list", () => {
    expect(keepBusinessName("Kinesiología Marly", { extraWords: ["kinesi"] })).toBe(true);
    expect(keepBusinessName("Kinesiología Marly")).toBe(false);
  });
});

describe("looksLikePersonName (second barrier)", () => {
  it.each(PEOPLE)("person: %s", (n) => {
    expect(looksLikePersonName(n)).toBe(true);
  });
  it.each(BUSINESSES)("not a person: %s", (n) => {
    expect(looksLikePersonName(n)).toBe(false);
  });
  it("handles empty input", () => {
    expect(looksLikePersonName(null)).toBe(false);
    expect(looksLikePersonName("  ")).toBe(false);
  });
});

describe("F19b recall by OSM category", () => {
  it.each([...COMMERCE_KEPT])("commerce keeps: %s", (n) => {
    expect(keepBusinessName(n, { category: "commerce" })).toBe(true);
  });
  it.each(CLINICS_KEPT)("professional keeps: %s", (n) => {
    expect(keepBusinessName(n, { category: "professional" })).toBe(true);
  });
  it.each([...PEOPLE])("every category excludes a person: %s", (n) => {
    for (const category of ["professional", "commerce", "unknown"] as const) expect(keepBusinessName(n, { category })).toBe(false);
  });
  it("without a business word, commerce keeps and professional excludes", () => {
    expect(keepBusinessName("La Mona", { category: "commerce" })).toBe(true);
    expect(keepBusinessName("La Mona", { category: "professional" })).toBe(false);
    expect(keepBusinessName("La Mona")).toBe(false);
  });
  it.each(MASKED)("masks a titled person inside a business name: %s", (n) => {
    const v = classifyBusinessName(n, { category: "professional" });
    expect(v.action).toBe("mask");
    expect(v.action === "mask" && v.name).toMatch(/por verificar\)$/);
    expect(keepBusinessName(n, { category: "professional" })).toBe(false);
  });
  it("short prefixes no longer collide with surnames", () => {
    expect(keepBusinessName("Corpas", { category: "professional" })).toBe(false);
    expect(keepBusinessName("Corporación Dental Norte", { category: "professional" })).toBe(true);
    expect(keepBusinessName("Medicis", { category: "professional" })).toBe(false);
  });
  it("derives the category from OSM tags", () => {
    expect(nameCategory({ tags: { amenity: "dentist" } })).toBe("professional");
    expect(nameCategory({ tags: { healthcare: "clinic" } })).toBe("professional");
    expect(nameCategory({ tags: { office: "lawyer" } })).toBe("professional");
    expect(nameCategory({ tags: { amenity: "restaurant" } })).toBe("commerce");
    expect(nameCategory({ tags: { shop: "bakery" } })).toBe("commerce");
    expect(nameCategory({})).toBe("unknown");
  });
});
