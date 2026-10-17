import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { screenOsmCompanies } from "@/features/compliance/person-name";
import { accentCopy } from "@/features/hunts/ui/format";
import type { SourceCompany } from "@/integrations/overpass/types";
import { parseOverpass, toSourceCompanies } from "@/integrations/overpass/real";

/** Fixtures are real OSM samples with synthetic ids and synthetic person names; `_persons` lists the pure-person records. */
function load(file: string) {
  const json = JSON.parse(readFileSync(`fixtures/${file}`, "utf8")) as { _persons?: string[] };
  return { all: toSourceCompanies(parseOverpass(json as never), { city: "Bogotá", country: "CO" }), persons: new Set(json._persons ?? []) };
}

const DENTAL_WORDS = ["dental", "odont", "dentist", "dentista"];

function measure(file: string, extra: string[]) {
  const { all, persons } = load(file);
  const { kept, masked } = screenOsmCompanies(all, extra);
  const asIs = kept.filter((c) => c.isLegalEntity !== false);
  const businesses = all.filter((c) => !persons.has(c.name));
  const maskedCount = kept.length - asIs.length;
  // Recall: businesses kept as-is over businesses that are not masked. Precision: no pure person survives.
  const recall = asIs.filter((c) => !persons.has(c.name)).length / (businesses.length - maskedCount);
  const personsKept = kept.filter((c) => persons.has(c.name));
  console.info(`${file}: recall ${(recall * 100).toFixed(1)}% (${businesses.length} businesses, ${persons.size} persons, ${masked} masked)`);
  return { all, persons, businesses, recall, personsKept, masked };
}

describe("drawer copy accents", () => {
  it("restores Spanish accents on stored ASCII criteria", () => {
    expect(accentCopy("Contacto generico verificable")).toBe("Contacto genérico verificable");
    expect(accentCopy("Persona juridica verificada")).toBe("Persona jurídica verificada");
    expect(accentCopy("Senales: agenda en linea")).toBe("Señales: agenda en línea");
  });
});

describe("F19b recall on real OSM fixtures (Bogotá, sanitized)", () => {
  it("fixtures carry no OSM ids", () => {
    for (const f of ["overpass-restaurants-bogota.json", "overpass-dental-bogota-wide.json"]) {
      const { all } = load(f);
      expect(all.every((c) => /^osm:node\/\d{1,3}$/.test(c.externalId))).toBe(true);
    }
  });

  it("keeps at least 90% of restaurants / cafes / fast food, with no person kept", () => {
    const m = measure("overpass-restaurants-bogota.json", []);
    expect(m.all.length).toBeGreaterThanOrEqual(200);
    expect(m.recall).toBeGreaterThanOrEqual(0.9);
    expect(m.personsKept).toHaveLength(0);
  });

  it("keeps at least 90% of dental businesses, with no pure person kept", () => {
    const m = measure("overpass-dental-bogota-wide.json", DENTAL_WORDS);
    expect(m.all.length).toBeGreaterThanOrEqual(300);
    expect(m.persons.size).toBeGreaterThanOrEqual(10);
    expect(m.recall).toBeGreaterThanOrEqual(0.9);
    expect(m.personsKept).toHaveLength(0);
  });

  it("masked records lose the person's name everywhere (name, raw, osm tags) and are never legal entities", () => {
    const base: SourceCompany = { name: "", externalId: "osm:node/1", sourceUrl: "u", license: "ODbL", sourceChannel: "osm" as const, isMock: false, raw: {} };
    const { kept, masked } = screenOsmCompanies([
      {
        ...base,
        name: "Doctora Xiomara Pérez - Odontología Estética",
        phone: "+573001112233",
        email: "milena@x.co",
        raw: { osm_id: "node/1", tags: { amenity: "dentist", name: "Doctora Xiomara Pérez - Odontología Estética", "name:es": "Xiomara Pérez" } },
      },
      { ...base, externalId: "osm:node/2", name: "La Mona", raw: { tags: { amenity: "restaurant" } } },
    ]);
    expect(masked).toBe(1);
    expect(kept).toHaveLength(2);
    const m = kept[0];
    expect(m.name).toBe("Consultorio odontológico (por verificar)");
    expect(m.isLegalEntity).toBe(false);
    expect(m.phone).toBeUndefined();
    expect(m.email).toBeUndefined();
    expect(JSON.stringify(m.raw)).not.toMatch(/Xiomara|Pérez/);
    const osmTags = Object.entries((m.raw.tags ?? {}) as Record<string, unknown>).map(([k, v]) => `${k}=${String(v)}`);
    expect(osmTags.join("|")).not.toMatch(/Xiomara|Pérez|name=/);
    expect(kept[1].isLegalEntity).toBeUndefined();
  });

  it("the Overpass adapter never keeps `name` in raw tags", () => {
    const [c] = toSourceCompanies(parseOverpass({ elements: [{ type: "node", id: 1, lat: 1, lon: 1, tags: { name: "Doctora Ana Gómez", amenity: "dentist" } }] }));
    expect(JSON.stringify(c.raw)).not.toMatch(/Ana|Gómez/);
  });
});
