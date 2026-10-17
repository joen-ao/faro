import { eq } from "drizzle-orm";
import { companies, companySources, contactPoints, costEntries, events, fitAssessments, hunts, icpProfiles, leads, qualifications, workspaces } from "@/db/schema";
import type { AppDb } from "@/db/types";
import type { MergedPair } from "@/features/dedupe/plan";
import { ICP_EXAMPLES } from "@/features/icp/presets";

/** Fixed id so `/app/hunts/demo` and tests can find the seeded demo hunt. */
export const DEMO_HUNT_ID = "00000000-0000-4000-8000-00000000f019";
export const DEMO_POINTS = 2000;

/** Same rule as the outreach demo (F10): only outside production, unless FARO_ALLOW_DEMO=1. */
export const demoAllowed = () => process.env.NODE_ENV !== "production" || process.env.FARO_ALLOW_DEMO === "1";
const DEMO_UNLOCATED = 60;

/** Deterministic PRNG (mulberry32): the demo looks the same on every machine. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Neighbourhood centres of Bogotá with weights (denser where clinics really cluster). */
const CENTRES: Array<[number, number, number, number]> = [
  [4.6486, -74.0628, 0.014, 18], // Chapinero
  [4.7019, -74.0415, 0.012, 14], // Usaquén / Cedritos
  [4.7213, -74.0452, 0.01, 9],
  [4.6351, -74.0782, 0.012, 11], // Teusaquillo
  [4.6097, -74.0728, 0.01, 8], // Centro
  [4.6702, -74.0702, 0.01, 10], // Barrios Unidos
  [4.7418, -74.0846, 0.016, 8], // Suba
  [4.6679, -74.1226, 0.014, 7], // Fontibón
  [4.6277, -74.1493, 0.016, 6], // Kennedy
  [4.5921, -74.1145, 0.014, 4], // Puente Aranda / Tunal
  [4.5612, -74.1121, 0.012, 2],
  [4.7632, -74.0412, 0.012, 3], // Toberín / Norte
];

const ADJ = ["Aurora", "Sonrisa", "Marfil", "Nórdica", "Andina", "Prisma", "Alba", "Cedro", "Lumen", "Cristal", "Zenit", "Orquídea", "Roble", "Faro", "Bruma", "Delta", "Maple", "Ágata", "Pinar", "Colibrí"];
const KIND = ["Clínica Dental", "Odontología", "Centro Odontológico", "Salud Oral", "Ortodoncia", "Dental Studio"];

type Status = "found" | "fit" | "contacted" | "responded" | "qualified";

function pickCentre(r: () => number) {
  const total = CENTRES.reduce((a, c) => a + c[3], 0);
  let x = r() * total;
  for (const c of CENTRES) {
    x -= c[3];
    if (x <= 0) return c;
  }
  return CENTRES[0];
}
const gauss = (r: () => number) => (r() + r() + r() + r() - 2) / 2;

export interface DemoRow {
  i: number;
  name: string;
  lat: number | null;
  lng: number | null;
  source: "osm" | "rues" | "reps";
  status: Status;
  score: number;
  nit: string | null;
  /** NIT confirmed in RUES/REPS (always true for those sources; for OSM it models a fused registry match). */
  registry: boolean;
  signal: boolean;
  website: string | null;
  email: string | null;
  phone: string | null;
}

/** Same weights as `scoreFit` (F08): the score is earned/applicable, never invented. */
export const DEMO_WEIGHTS = { web: 20, contact: 20, legal: 20, sector: 20, city: 10, signals: 10 } as const;

export function demoScore(r: Pick<DemoRow, "website" | "email" | "registry" | "signal">): number {
  const w = DEMO_WEIGHTS;
  const earned = (r.website ? w.web : 0) + (r.email ? w.contact : 0) + (r.registry ? w.legal : 0) + w.sector + w.city + (r.signal ? w.signals : 0);
  return Math.round((earned / (w.web + w.contact + w.legal + w.sector + w.city + w.signals)) * 100);
}

/**
 * Pure generator of the synthetic dataset (tested; no DB). Score comes from the criteria; only leads with a
 * verified legal entity (NIT in a registry) and score >= 60 advance to fit/contacted/qualified.
 */
export function generateDemoRows(total = DEMO_POINTS, unlocated = DEMO_UNLOCATED): DemoRow[] {
  const r = rng(19);
  const rows: DemoRow[] = [];
  for (let i = 0; i < total + unlocated; i++) {
    const located = i < total;
    const [clat, clng, spread] = pickCentre(r);
    const roll = r();
    const source: DemoRow["source"] = !located ? (roll < 0.5 ? "rues" : "reps") : roll < 0.7 ? "osm" : roll < 0.9 ? "reps" : "rues";
    const name = `${KIND[Math.floor(r() * KIND.length)]} ${ADJ[Math.floor(r() * ADJ.length)]} ${String(i + 1).padStart(4, "0")}`;
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
    const registry = source !== "osm" || r() < 0.42;
    const website = r() < 0.62 ? `https://${slug}.example` : null;
    const email = r() < 0.5 ? `info@${slug}.example` : null;
    const signal = website !== null && r() < 0.55;
    const score = demoScore({ website, email, registry, signal });
    const sr = r();
    const status: Status = registry && score >= 60 ? (sr < 0.58 ? "fit" : sr < 0.87 ? "contacted" : "qualified") : "found";
    rows.push({
      i,
      name: `${name} SAS`,
      lat: located ? clat + gauss(r) * spread : null,
      lng: located ? clng + gauss(r) * spread * 1.1 : null,
      source,
      status,
      score,
      nit: registry ? `9${String(Math.floor(r() * 99_999_999)).padStart(8, "0")}` : null,
      registry,
      signal,
      website,
      email,
      phone: r() < 0.4 ? `+5716${String(Math.floor(r() * 9_999_999)).padStart(7, "0")}` : null,
    });
  }
  return rows;
}

const criteriaFor = (row: DemoRow) => {
  const url = `https://demo.faro.invalid/${row.source}/${row.i + 1}`;
  const c = (criterio: string, peso: number, ok: boolean, evidencia: string) => ({ criterio, cumplido: ok, evidencia, url: ok ? url : null, peso });
  return [
    c("Tiene sitio web", 20, !!row.website, row.website ? `Sitio web registrado: ${row.website}` : "Sin sitio web"),
    c("Contacto generico verificable", 20, !!row.email, row.email ? "Contacto generico (email) publicado en la fuente" : "Sin contacto generico"),
    c("Persona juridica verificada", 20, row.registry, row.registry ? `NIT ${row.nit} en registro ${row.source === "reps" ? "REPS" : "RUES"}` : "Sin registro oficial (RUES/REPS)"),
    c("Sector coincide (dental)", 20, true, row.source === "osm" ? "osm: amenity=dentist" : row.source === "rues" ? "rues: CIIU 8622" : "reps: nombre con ODONT"),
    c("Ciudad: Bogota", 10, true, "Ciudad registrada: Bogota"),
    c("Senales: agenda en linea", 10, row.signal, row.signal ? `"Agende su cita en línea con nuestro equipo" (agenda en linea)` : "No se encontro evidencia en el sitio"),
  ];
};

const chunk = <T,>(a: T[], n = 400): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, k) => a.slice(k * n, k * n + n));

let seeding: Promise<string> | undefined;

/** Idempotent and single-flight per process. Everything is `is_demo` (and sources `is_mock`) so it never touches real totals. */
export function ensureDemoHunt(db: AppDb): Promise<string> {
  return (seeding ??= seedDemo(db).catch((e) => {
    seeding = undefined;
    throw e;
  }));
}

async function seedDemo(db: AppDb): Promise<string> {
  const [existing] = await db.select({ id: hunts.id }).from(hunts).where(eq(hunts.id, DEMO_HUNT_ID)).limit(1);
  if (existing) return DEMO_HUNT_ID;

  const rows = generateDemoRows();
  const example = ICP_EXAMPLES[0];
  const [ws] = await db.insert(workspaces).values({ name: "Demo Workspace F19", offerDescription: "Demo: software de agenda para clinicas dentales", senderName: "Faro (demo)", country: "CO" }).returning();
  const [icp] = await db.insert(icpProfiles).values({ workspaceId: ws.id, prompt: example.prompt, criteria: example.criteria, threshold: 60 }).returning();
  const t0 = Date.now() - 12 * 60_000;

  const compIds: string[] = [];
  for (const part of chunk(rows)) {
    const inserted = await db
      .insert(companies)
      .values(
        part.map((r) => ({
          name: r.name,
          normalizedName: r.name.toLowerCase(),
          nit: r.nit,
          city: "Bogota",
          lat: r.lat,
          lng: r.lng,
          website: r.website,
          address: r.lat ? `Calle ${10 + (r.i % 120)} # ${5 + (r.i % 60)}-${10 + (r.i % 80)}` : null,
          isDemo: true,
        })),
      )
      .returning({ id: companies.id });
    compIds.push(...inserted.map((x) => x.id));
  }

  // Fused duplicates (demo): second source of a handful of companies.
  const pairs: MergedPair[] = [];
  const reasons = ["name+distance", "nit", "name+phone", "name+domain"] as const;
  for (let k = 0; k < 46; k++) {
    const i = (k * 41 + 7) % DEMO_POINTS;
    const r = rows[i];
    pairs.push({
      keptCompanyId: compIds[i],
      keptName: r.name,
      mergedName: r.name.replace(/ SAS$/, "").toUpperCase() + " S.A.S.",
      mergedChannel: r.source === "osm" ? (k % 2 ? "rues" : "reps") : "osm",
      mergedExternalId: `demo:dup:${i}`,
      reason: reasons[k % 4],
      similarity: Math.round((0.72 + ((k * 7) % 28) / 100) * 1000) / 1000,
      ...(k % 4 === 0 ? { distanceMeters: 8 + ((k * 13) % 70) } : {}),
    });
  }

  const count = (s: DemoRow["source"]) => rows.filter((r) => r.source === s).length;
  const logAt = (m: number, text: string) => ({ at: new Date(t0 + m * 60_000).toISOString(), text });
  const src = (s: DemoRow["source"], minutes: number) => ({
    state: "done",
    cursor: count(s),
    total: count(s),
    fetched: count(s),
    isMock: true,
    log: [logAt(minutes, `${count(s)} registros procesados · fuente completa (demo)`)],
  });
  await db.insert(hunts).values({
    id: DEMO_HUNT_ID,
    icpProfileId: icp.id,
    status: "completed",
    startedAt: new Date(t0),
    finishedAt: new Date(t0 + 9 * 60_000),
    progress: {
      isDemo: true,
      sources: { osm: src("osm", 3), rues: src("rues", 6), reps: src("reps", 9) },
      dedupe: { inserted: rows.length, merged: pairs.length, pairs, total: rows.length + pairs.length },
    },
  });

  const URL: Record<DemoRow["source"], string> = { osm: "https://demo.faro.invalid/osm", rues: "https://demo.faro.invalid/rues", reps: "https://demo.faro.invalid/reps" };
  const LIC: Record<DemoRow["source"], string> = { osm: "ODbL 1.0 © OpenStreetMap contributors (demo)", rues: "CC BY-SA 4.0 · datos.gov.co (demo)", reps: "CC BY-SA 4.0 · datos.gov.co (demo)" };
  const leadIds: string[] = [];
  for (const part of chunk(rows)) {
    await db.insert(companySources).values(
      part.map((r) => ({ companyId: compIds[r.i], sourceChannel: r.source, externalId: `demo:${r.source}:${r.i + 1}`, raw: { demo: true, ciiu: r.source === "rues" ? "8622" : undefined }, sourceUrl: `${URL[r.source]}/${r.i + 1}`, license: LIC[r.source], isMock: true })),
    );
    const ins = await db
      .insert(leads)
      .values(
        part.map((r) => ({
          companyId: compIds[r.i],
          huntId: DEMO_HUNT_ID,
          status: r.status,
          primarySource: r.source,
          fitScore: r.score,
          slug: `demo-f19-${r.i + 1}`,
          isDemo: true,
          createdAt: new Date(t0 + r.i * 260), // staggered: the stream pages by timestamp
        })),
      )
      .returning({ id: leads.id });
    leadIds.push(...ins.map((x) => x.id));
    await db.insert(fitAssessments).values(
      part.map((r) => ({ companyId: compIds[r.i], icpProfileId: icp.id, score: r.score, criteriaMet: criteriaFor(r), whyNow: r.status === "found" ? r.registry ? "Sin criterios suficientes todavia." : "Sin criterios suficientes todavia. (por verificar: persona juridica)" : `Encaja por: sector, ciudad${r.signal ? ", sitio web con agenda en linea" : ""}.`, model: "rules" })),
    );
    const cps = part.flatMap((r) => [
      ...(r.email ? [{ companyId: compIds[r.i], type: "email" as const, value: r.email, isGeneric: true, sourceChannel: r.source, evidenceUrl: `${URL[r.source]}/${r.i + 1}` }] : []),
      ...(r.phone ? [{ companyId: compIds[r.i], type: "phone" as const, value: r.phone, isGeneric: false, sourceChannel: r.source, evidenceUrl: `${URL[r.source]}/${r.i + 1}` }] : []),
    ]);
    if (cps.length) await db.insert(contactPoints).values(cps).onConflictDoNothing();
  }

  // Outreach trail + qualification + a tiny cost receipt for advanced leads.
  const adv = rows.filter((r) => r.status === "contacted" || r.status === "qualified");
  for (const part of chunk(adv)) {
    const ev = part.flatMap((r) => {
      const leadId = leadIds[r.i];
      const at = new Date(t0 + 9 * 60_000 + r.i * 100);
      const base = [
        { leadId, type: "sent" as const, at, isDemo: true, isMock: true },
        { leadId, type: "delivered" as const, at: new Date(at.getTime() + 4000), isDemo: true, isMock: true },
      ];
      return r.status === "qualified"
        ? [...base, { leadId, type: "reply" as const, at: new Date(at.getTime() + 3_600_000), isDemo: true, isMock: true }, { leadId, type: "qualified" as const, at: new Date(at.getTime() + 3_900_000), isDemo: true, isMock: true }]
        : base;
    });
    await db.insert(events).values(ev);
    await db.insert(costEntries).values(
      part.flatMap((r) => [
        { leadId: leadIds[r.i], huntId: DEMO_HUNT_ID, sourceChannel: r.source, category: "data" as const, quantity: 1, unit: "lead", rate: 0, usd: 0, evidence: "Fuente publica gratuita", isDemo: true, isMock: true },
        { leadId: leadIds[r.i], huntId: DEMO_HUNT_ID, sourceChannel: r.source, category: "ai" as const, quantity: 2400, unit: "tokens", rate: 0.0000075, usd: 0.018, evidence: "Redaccion del mensaje (demo)", isDemo: true, isMock: true },
        { leadId: leadIds[r.i], huntId: DEMO_HUNT_ID, sourceChannel: r.source, contactChannel: "email" as const, category: "email" as const, quantity: 1, unit: "email", rate: 0.0004, usd: 0.0004, evidence: "Envio de correo (demo)", isDemo: true, isMock: true },
      ]),
    );
  }
  const qual = rows.filter((r) => r.status === "qualified");
  for (const part of chunk(qual)) {
    await db.insert(qualifications).values(
      part.map((r) => ({
        leadId: leadIds[r.i],
        origin: "fallback" as const,
        qualified: true,
        score: 82,
        summary: "Demo: interes en agendamiento automatico, presupuesto confirmado y decision en el mes.",
        bant: { budget: "si", authority: "gerencia", need: "agenda", timeline: "30 dias" },
        isDemo: true,
        isMock: true,
      })),
    );
  }
  return DEMO_HUNT_ID;
}
