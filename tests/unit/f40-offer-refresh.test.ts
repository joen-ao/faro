import { describe, expect, it } from "vitest";
import { refreshHuntOffer } from "@/features/offer/resolve";
import { ServiceCatalog } from "@/features/offer/schema";

const svc = (id: string, price: string) => ({ id, name: `Servicio ${id}`, price, description: "Descripción del servicio", outcome: "Resultado del servicio" });

const catalog = ServiceCatalog.parse([svc("agentes-ia", "Desde $1.490.000 + $290.000/mes"), svc("landing-webs", "Esencial $1.390.000"), svc("rag", "Piloto desde $4.900.000")]);

const snapshot = (services: ReturnType<typeof svc>[], angles: { serviceId: string }[] = []) => ({
  serviceIds: services.map((s) => s.id),
  services,
  angles: angles.map((a) => ({ text: "Negocios sin WhatsApp pierden clientes", serviceId: a.serviceId, signal: "whatsapp" })),
});

describe("F40 · hunt offer uses the catalog's current text and price", () => {
  it("swaps a snapshot service for the catalog one with the same id", () => {
    const eff = refreshHuntOffer(snapshot([svc("agentes-ia", "450usd")]), catalog);
    expect(eff.origin).toBe("hunt");
    expect(eff.services.map((s) => [s.id, s.price])).toEqual([["agentes-ia", "Desde $1.490.000 + $290.000/mes"]]);
  });

  it("drops services gone from the catalog, with their angles", () => {
    const eff = refreshHuntOffer(snapshot([svc("agentes-ia", "450usd"), svc("software-crm", "Desde USD 3.000")], [{ serviceId: "agentes-ia" }, { serviceId: "software-crm" }]), catalog);
    expect(eff.services.map((s) => s.id)).toEqual(["agentes-ia"]);
    expect(eff.angles.map((a) => a.serviceId)).toEqual(["agentes-ia"]);
  });

  it("falls back to the whole catalog when no snapshot service survives", () => {
    const eff = refreshHuntOffer(snapshot([svc("software-crm", "Desde USD 3.000")]), catalog);
    expect(eff.origin).toBe("catalog");
    expect(eff.services).toHaveLength(3);
  });

  it("no hunt offer -> catalog", () => {
    expect(refreshHuntOffer(null, catalog).origin).toBe("catalog");
  });
});
