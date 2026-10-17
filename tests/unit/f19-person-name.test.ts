import { describe, expect, it } from "vitest";
import { hasBrandTag, keepBusinessName, looksLikePersonName } from "@/features/compliance/person-name";

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
  "Yanira Cruz",
  "Od. Carolina Ruiz",
  "Morales Restrepo",
  "Oralia Morales",
];

const BUSINESSES = [
  "Dr. Smile",
  "Dra. Sonrisa",
  "Doc Dental",
  "Vargas Odontólogos",
  "Clínica Dental Sonrisas",
  "Odontología Integral del Norte",
  "Consultorio Dr. Pérez",
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
    expect(keepBusinessName("Ortopedia Marly", { extraWords: ["ortoped"] })).toBe(true);
    expect(keepBusinessName("Ortopedia Marly")).toBe(false);
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
