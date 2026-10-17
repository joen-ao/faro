import { describe, expect, it } from "vitest";
import { looksLikePersonName } from "@/features/compliance/person-name";

const CASES: Array<[string, boolean]> = [
  ["Dra. Ana María Gómez", true],
  ["Dr. Juan Pérez", true],
  ["Od. Carolina Ruiz", true],
  ["Odontóloga Laura Torres", true],
  ["Yanira Cruz", true],
  ["Carlos Andrés Mejía", true],
  ["John Smith", true],
  ["Consultorio Dr. Pérez", false],
  ["Clínica Dental Sonreír", false],
  ["Odontología Integral Andina SAS", false],
  ["Sonrisan Art", false],
  ["Prado Veraniego", false],
  ["Restaurante La Brasa Roja", false],
  ["Centro Oral Bogotá", false],
  ["Dental", false],
  ["", false],
];

describe("looksLikePersonName", () => {
  it.each(CASES)("%s -> %s", (name, expected) => {
    expect(looksLikePersonName(name)).toBe(expected);
  });
  it("handles null/undefined", () => {
    expect(looksLikePersonName(null)).toBe(false);
    expect(looksLikePersonName(undefined)).toBe(false);
  });
});
