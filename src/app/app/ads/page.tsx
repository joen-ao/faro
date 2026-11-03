import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { Plus } from "lucide-react";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { ICP_PAGES } from "@/config/icp-pages";
import { minutesAgo } from "@/components/dashboard/business";
import { Button } from "@/components/ui/button";
import { allowedAdHosts, apiCallLogger, bogotaDate, buildAdLink, getLastSync, listAdSpend, metaCampaignStats, unattributedSpend } from "@/features/ads";
import { adPerformance, DEFAULT_SETTINGS, evaluateRules, getCopilotSettings, listActions, listLearnings, listRecommendations, type AdPerformance } from "@/features/copilot";
import { readDashboardDetail } from "@/features/dashboard/data";
import { getMetaAds, metaAdsConfigured, MetaAdsError } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv } from "@/lib/env";
import { AdsPanel } from "./ads-panel";
import { LearningsPanel } from "./learnings-panel";
import { money } from "./format";
import { Campaigns, ChangeLog, Decisions, ManualCampaign, PilotSettings, SyncLine, type AdRow, type CampaignRow, type StatusView } from "./operate";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pauta", robots: { index: false, follow: false } };

/** Below this many qualified leads a CPQL is shown but flagged (same floor as the dashboard). */
const MIN_QUALIFIED = 3;
const usd = (n: number) => `USD ${n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function PautaPage() {
  const h = await headers();
  const denied = requireAppAccess(new Request("http://internal/app/ads", { headers: h }));
  if (denied) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-faro-text-2">Esta sección requiere la clave de acceso de la app (APP_ACCESS_KEY).</p>
      </main>
    );
  }

  const env = getEnv();
  const db = (await getReadyDb()) as unknown as AppDb;
  // Light reads in sequence (F31): the pooler has few connections and none of these is heavy.
  const meta = await loadMeta(db);
  const perf = await adPerformance(db, bogotaDate(29));
  const recs = await listRecommendations(db, meta.status.mock);
  const actions = await listActions(db, meta.status.mock);
  const learnings = await listLearnings(db, meta.status.mock);
  const settings = await getCopilotSettings(db);
  const snapshot = await readDashboardDetail(db);
  const rows = await listAdSpend(db);
  const orphan = await unattributedSpend(db);
  const { skipped } = evaluateRules({ settings, maxBudget: 0, minBudget: 0, campaigns: [], adSets: [], ads: [], faroCampaignIds: new Set(), perf: { d3: new Map(), d7: new Map(), prev7: new Map(), d14: new Map() }, lastBudgetChange: new Map(), now: new Date() });

  const cur = meta.status.currency;
  const campaigns: CampaignRow[] = meta.campaigns.map((c) => {
    const ads = perf.filter((p) => p.campaignId === c.id);
    const leads = sum(ads, "leads");
    const qualified = sum(ads, "qualified");
    return { ...c, leads, qualified, cpql: qualified > 0 ? c.spend / qualified : null, ads: ads.map(adRow) };
  });
  const total = { spend: sum(perf, "spendLocal"), leads: sum(perf, "leads"), qualified: sum(perf, "qualified") };
  const cpql = total.qualified > 0 ? total.spend / total.qualified : null;
  const open = recs.filter((r) => r.status === "proposed");
  const orphanTotal = orphan.reduce((a, o) => a + o.usd, 0);
  const metaSource = snapshot?.data.matrix.bySource.find((r) => r.source === "meta_ads");
  const campaignId = env.META_ADS_CAMPAIGN_ID ?? "";
  const links = Object.keys(ICP_PAGES).map((slug) => ({ slug, audience: ICP_PAGES[slug].audience, url: campaignId ? buildAdLink(slug, campaignId) : null }));

  return (
    <main>
      <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-8 sm:px-6 sm:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold leading-tight tracking-[-0.03em] sm:text-[40px]">Pauta</h1>
            <p className="mt-2 max-w-xl text-sm text-faro-text-2">Así van tus anuncios en Meta, medidos hasta el lead calificado.</p>
          </div>
          <Button asChild size="lg" className="font-semibold">
            <Link href="/app/ads/copilot" prefetch={false}>
              <Plus className="size-4" /> Nueva campaña
            </Link>
          </Button>
        </header>
        <SyncLine status={meta.status} ago={meta.status.lastSyncAt ? minutesAgo(meta.status.lastSyncAt) : null} />

        <section aria-label="Resumen de 30 días" className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border lg:grid-cols-4">
          <Kpi label="Gasto · 30 días" value={total.spend > 0 ? money(total.spend, cur) : "—"} />
          <Kpi label="Leads" value={total.leads ? String(total.leads) : "—"} />
          <Kpi label="Calificados" value={total.qualified ? String(total.qualified) : "—"} />
          <Kpi
            label="CPQL"
            value={money(cpql, cur)}
            accent
            note={[cpql !== null && total.qualified < MIN_QUALIFIED ? "pocos datos" : null, open.length ? `${open.length} por decidir` : "Nada por decidir"].filter(Boolean).join(" · ")}
          />
        </section>
        {total.spend === 0 && <p className="mt-2 text-xs text-faro-text-3">Sin datos todavía: las métricas por anuncio llegan con la sincronización diaria de las 6:00, después de activar una campaña.</p>}

        <div className="mt-7 space-y-7">
          <Decisions
            recs={open.map((r) => ({ id: r.id, rule: r.rule, action: r.action, title: r.title, evidence: r.evidence, requiresApproval: r.requiresApproval }))}
            spendEnabled={env.ADS_SPEND_ENABLED}
          />
          <Campaigns campaigns={campaigns} status={meta.status} />
          <LearningsPanel
            learnings={learnings.map((l) => ({ id: l.id, dimension: l.dimension, metric: l.metric, winner: l.winner, statement: l.statement, confidence: l.confidence, source: l.source, periodStart: l.periodStart, periodEnd: l.periodEnd }))}
          />

          <details className="group rounded-card border border-border bg-card p-5 sm:p-6">
            <summary className="cursor-pointer list-none font-display text-lg font-semibold">
              <span aria-hidden className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
              Ajustes avanzados
              <span className="mt-1 block pl-5 font-sans text-sm font-normal text-faro-text-3">Piloto automático, registro de cambios, gasto manual y enlaces UTM, crear a mano</span>
            </summary>
            <div className="mt-6 space-y-8 divide-y divide-border [&>*:not(:first-child)]:pt-8">
              <PilotSettings settings={settings ?? DEFAULT_SETTINGS} skipped={skipped} />
              <ChangeLog
                actions={actions.map((a) => ({ id: a.id, actor: a.actor, action: a.action, entityId: a.entityId, before: a.before, after: a.after, ok: a.ok, error: a.error, revertOf: a.revertOf, at: a.at.toISOString() }))}
              />
              <div>
                <h3 className="font-semibold">Gasto manual y enlaces UTM</h3>
                <p className="mt-1 text-sm text-faro-text-2">
                  Para gasto de otras cuentas o si la API no está conectada. CPL de meta_ads en el tablero:{" "}
                  <strong className="text-foreground">{metaSource && metaSource.cpl !== null && metaSource.costUsd > 0 ? usd(metaSource.cpl) : "sin datos"}</strong> · gasto cargado{" "}
                  <strong className="text-foreground">{usd(rows.reduce((a, r) => a + r.usd, 0))}</strong> en {rows.length} filas.
                </p>
                {orphanTotal > 0 && (
                  <p role="note" className="mt-3 rounded-button border border-border p-3 text-sm text-faro-text-2">
                    Gasto sin leads atribuidos aún: <strong className="text-foreground">{usd(orphanTotal)}</strong> ({orphan.map((o) => o.campaign).join(", ")}). No entra al CPL hasta que lleguen leads con ese{" "}
                    <code className="text-faro-accent">utm_campaign</code>.
                  </p>
                )}
                <AdsPanel
                  links={links}
                  defaultCampaign={campaignId}
                  rows={rows.map((r) => ({ id: r.id, platform: r.platform, campaign: r.campaign, date: r.date, usd: r.usd, impressions: r.impressions, clicks: r.clicks }))}
                />
              </div>
              <ManualCampaign status={meta.status} />
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}

function Kpi({ label, value, note, accent }: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className="bg-card p-5">
      <p className="text-xs text-faro-text-3">{label}</p>
      <p className={`mt-2 font-display text-2xl font-bold tracking-tight tabular-nums sm:text-[28px] ${accent ? "text-faro-accent" : ""}`}>{value}</p>
      {note && <p className="mt-1 text-xs text-faro-text-2">{note}</p>}
    </div>
  );
}

const sum = <K extends keyof AdPerformance>(rows: AdPerformance[], k: K) => rows.reduce((a, r) => a + (r[k] as number), 0);

function adRow(p: AdPerformance): AdRow {
  return {
    adId: p.adId,
    name: p.angle ?? p.adName ?? `Anuncio ${p.adId}`,
    formatHint: p.formatHint,
    spend: p.spendLocal,
    ctr: p.ctr,
    ctrReady: p.ctrReady,
    leads: p.leads,
    qualified: p.qualified,
    cpql: p.cpql,
    qualityReady: p.qualityReady,
  };
}

/** Live Meta account + campaigns (best effort: an API failure shows as an error, never breaks the page). */
async function loadMeta(db: AppDb): Promise<{ status: StatusView; campaigns: Omit<CampaignRow, "leads" | "qualified" | "cpql" | "ads">[] }> {
  const env = getEnv();
  const ads = getMetaAds(env, apiCallLogger(db));
  const last = await getLastSync(db);
  const status: StatusView = {
    mock: ads.isMock,
    configured: metaAdsConfigured(env),
    accountName: null,
    currency: "COP",
    spendEnabled: env.ADS_SPEND_ENABLED,
    maxDailyBudget: env.ADS_MAX_DAILY_BUDGET_COP,
    allowedHosts: allowedAdHosts(env),
    error: null,
    lastSyncAt: last?.at ?? null,
    lastSyncError: last?.error ?? null,
  };
  try {
    const [account, list, stats] = await Promise.all([ads.getAccount(), ads.listCampaigns(), metaCampaignStats(db, bogotaDate(29))]);
    status.accountName = account.name;
    status.currency = account.currency ?? "COP";
    return {
      status,
      campaigns: list.map((c) => ({ id: c.id, name: c.name, status: c.status, dailyBudget: c.dailyBudget, spend: ads.isMock ? 0 : (stats.get(c.id)?.spendLocal ?? 0) })),
    };
  } catch (e) {
    status.error = e instanceof MetaAdsError ? `Meta: ${e.message}` : "No se pudo leer la cuenta de Meta.";
    return { status, campaigns: [] };
  }
}
