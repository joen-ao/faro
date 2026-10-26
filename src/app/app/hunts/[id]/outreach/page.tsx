import type { Metadata } from "next";
import { cookies } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { ensureMigrated, getDb } from "@/db/client";
import { companies, hunts, icpProfiles, leads, messages } from "@/db/schema";
import { checkSendWindow, describeCustomWindow } from "@/features/compliance/windows";
import { getSendWindow } from "@/features/settings/send-window";
import { ensureOutreachDemo } from "@/features/outreach/demo";
import { listOutreachRows, outreachCounts, OUTREACH_PAGE_SIZE, type OutreachSegment } from "@/features/outreach/service";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { areaLabel } from "@/features/icp/presets";
import { OutreachClient, type QueueItem } from "./outreach-client";
import { WhatsappPanel } from "./whatsapp-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contacto · Faro", robots: { index: false, follow: false } };

// One bootstrap per server process: concurrent first requests must not race the seed.
let demoHunt: Promise<string> | undefined;

const SECTOR_TITLE: Record<string, string> = { dental: "Clínicas dentales", restaurant: "Restaurantes" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-5">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-faro-text-2">{body}</p>
    </main>
  );
}

export default async function OutreachPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ now?: string; tipo?: string; pagina?: string }>;
}) {
  const { id } = await params;
  const { now: nowParam, tipo, pagina } = await searchParams;
  const jar = await cookies();
  if (requireAppAccess(new Request("http://localhost/", { headers: { cookie: jar.toString() } }))) {
    return <Notice title="Acceso restringido" body="Esta vista requiere la clave de la app (cookie faro_key)." />;
  }

  const env = getEnv();
  const conn = getDb();
  const db = conn.db;
  const isDemo = id === "demo";
  // The demo hunt is seeded on demand, never in production unless explicitly allowed.
  if (isDemo && process.env.NODE_ENV === "production" && process.env.FARO_ALLOW_DEMO !== "1") {
    return <Notice title="Demostración desactivada" body="La búsqueda de demostración solo existe fuera de producción." />;
  }
  let huntId = id;
  if (isDemo) {
    demoHunt ??= ensureMigrated(conn).then(() => ensureOutreachDemo(db));
    huntId = await demoHunt;
  } else if (!UUID.test(id)) {
    return <Notice title="Búsqueda no encontrada" body="El identificador no es válido." />;
  }
  const [hunt] = await db.select().from(hunts).where(eq(hunts.id, huntId)).limit(1);
  if (!hunt) return <Notice title="Búsqueda no encontrada" body="No existe una búsqueda con ese identificador." />;
  const [profile] = await db.select({ criteria: icpProfiles.criteria }).from(icpProfiles).where(eq(icpProfiles.id, hunt.icpProfileId)).limit(1);
  const crit = (profile?.criteria ?? {}) as { sector?: unknown; city?: unknown; cities?: unknown; scope?: unknown; country?: unknown };
  const rawSector = typeof crit.sector === "string" ? crit.sector : "";
  const sector = SECTOR_TITLE[rawSector] ?? (rawSector ? rawSector.charAt(0).toUpperCase() + rawSector.slice(1) : "Búsqueda");
  const area = areaLabel(crit);
  const huntTitle = area ? `${sector} · ${area}` : sector;

  // `?now=` only on the demo, so screenshots are deterministic.
  const parsed = isDemo && nowParam ? new Date(nowParam) : null;
  const now = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();

  const counts = await outreachCounts(db, huntId);
  // Companies first (automatic email); independents (manual contact) on their own tab.
  const segment: OutreachSegment = tipo === "independientes" || (tipo !== "empresas" && counts.empresas.total === 0 && counts.independientes.total > 0) ? "independientes" : "empresas";
  const pages = Math.max(1, Math.ceil(counts[segment].total / OUTREACH_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.parseInt(pagina ?? "1", 10) || 1));
  const rows = await listOutreachRows(db, huntId, env, now, { segment, page });
  const queueRows = await db
    .select({
      id: messages.id,
      status: messages.status,
      channel: messages.contactChannel,
      rule: messages.blockedByRule,
      subject: messages.subject,
      company: companies.name,
      at: messages.createdAt,
    })
    .from(messages)
    .innerJoin(leads, eq(leads.id, messages.leadId))
    .innerJoin(companies, eq(companies.id, leads.companyId))
    .where(eq(leads.huntId, huntId))
    .orderBy(desc(messages.createdAt))
    .limit(40);
  const queue: QueueItem[] = queueRows.map((q) => ({ ...q, at: q.at.toISOString() }));
  const { setting } = await getSendWindow(db);
  const win = checkSendWindow(now, "CO", setting);
  const windowLabel =
    setting.policy === "custom"
      ? `${describeCustomWindow(setting)} (Bogotá) · horario del equipo`
      : setting.policy === "extendida"
        ? "Todos los días 8:00–20:00 (Bogotá) · ventana extendida del equipo"
        : "Lun–vie 7:00–19:00 · sáb 8:00–15:00 (Bogotá) · nunca domingo ni festivos";

  return (
    <OutreachClient
      huntId={huntId}
      huntTitle={huntTitle}
      isDemoHunt={isDemo}
      sendEnabled={env.SEND_ENABLED === true}
      whatsappEnabled={env.WHATSAPP_ENABLED === true}
      humanRate={env.HUMAN_MINUTE_RATE_USD}
      nowIso={now.toISOString()}
      window={{ allowed: win.allowed, reason: win.reason, nextAllowedAt: win.nextAllowedAt?.toISOString() ?? null, policy: setting.policy, label: windowLabel }}
      rows={rows.map((r) => ({
        ...r,
        assessment: { ...r.assessment, nextAllowedAt: r.assessment.nextAllowedAt?.toISOString() ?? null, blocks: r.assessment.blocks.map((b) => ({ rule: b.rule, message: b.message })) },
      }))}
      queue={queue}
      segment={segment}
      whatsappPanel={isDemo ? null : <WhatsappPanel huntId={huntId} segment={segment} />}
      counts={counts}
      page={page}
      pages={pages}
    />
  );
}
