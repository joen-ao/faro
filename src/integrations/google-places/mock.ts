import { toSourceCompany } from "./real";
import type { PlacesAdapter, PlacesCriteria, PlacesResult, RawPlace } from "./types";

/** Synthetic demo places (fictional businesses). Never counted as real: `isMock` + `is_demo` on persist. */
export const MOCK_PLACES: RawPlace[] = [
  {
    id: "MOCK_PLACE_001",
    displayName: { text: "Clínica Dental Demo Chapinero" },
    formattedAddress: "Cra 13 # 60-10, Chapinero, Bogotá, Colombia",
    location: { latitude: 4.6486, longitude: -74.0628 },
    websiteUri: "https://clinica-demo-chapinero.example.com",
    internationalPhoneNumber: "+57 601 555 0101",
    types: ["dentist", "health"],
    businessStatus: "OPERATIONAL",
  },
  {
    id: "MOCK_PLACE_002",
    displayName: { text: "Odontología Demo Usaquén" },
    formattedAddress: "Cl 119 # 6-20, Usaquén, Bogotá, Colombia",
    location: { latitude: 4.6951, longitude: -74.0321 },
    internationalPhoneNumber: "+57 310 555 0102",
    types: ["dentist"],
    businessStatus: "OPERATIONAL",
  },
  {
    id: "MOCK_PLACE_003",
    displayName: { text: "Centro Dental Demo Cerrado" },
    formattedAddress: "Cl 80 # 20-5, Bogotá, Colombia",
    location: { latitude: 4.6697, longitude: -74.0707 },
    types: ["dentist"],
    businessStatus: "CLOSED_PERMANENTLY",
  },
];

export function createMockPlaces(places: RawPlace[] = MOCK_PLACES): PlacesAdapter {
  return {
    async search(criteria?: PlacesCriteria): Promise<PlacesResult> {
      const companies = places.flatMap((p) => toSourceCompany(p, { city: criteria?.city ?? "Bogotá", isMock: true }) ?? []);
      return { companies, calls: 0, latencyMs: 0, isMock: true };
    },
  };
}
