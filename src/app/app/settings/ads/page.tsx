import type { Metadata } from "next";
import { headers } from "next/headers";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { ICP_PAGES } from "@/config/icp-pages";
import { allowedAdHosts, apiCallLogger, bogotaDate, buildAdLink, getLastSync, listAdSpend, metaCampaignStats, unattributedSpend } from "@/features/ads";
import { getMetaAds, metaAdsConfigured, MetaAdsError } from "@/integrations/meta-ads";
import { getChannelMetrics } from "@/features/metrics";
import { getEnv } from "@/lib/env";
import { requireAppAccess } from "@/lib/app-access";
import { AdsPanel } from "./ads-panel";
import { MetaPanel, type LastSyncView, type MetaCampaignView, type MetaStatusView } from "./meta-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pauta · Configuración", robots: { index: false, follow: false } };

const fmt = (n: number) => `USD ${n.toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function AdsSettingsPage() {
  const h = await headers();
  const denied = requireAppAccess(new Request("http://internal/app/settings/ads", { headers: h }));
  if (denied) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-faro-text-2">Esta sección requiere la clave de acceso de la app (APP_ACCESS_KEY).</p>
      </main>
    );
  }

  const db = (await getReadyDb()) as unknown as AppDb;
  const [rows, metrics, orphan, meta] = await Promise.all([listAdSpend(db), getChannelMetrics(db), unattributedSpend(db), loadMeta(db)]);
  const orphanTotal = orphan.reduce((a, o) => a + o.usd, 0);
  const metaSource = metrics.real.bySource.find((r) => r.source === "meta_ads");
  const campaign = getEnv().META_ADS_CAMPAIGN_ID ?? "";
  const links = Object.keys(ICP_PAGES).map((slug) => ({
    slug,
    audience: ICP_PAGES[slug].audience,
    url: campaign ? buildAdLink(slug, campaign) : null,
  }));

  return (
    <main className="relative isolate min-h-dvh px-4 py-10 sm:py-14">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" style={{ background: "var(--faro-glow-violet)" }} />
      <div className="mx-auto max-w-5xl">
        <p className="text-xs uppercase tracking-[0.25em] text-faro-text-3">Configuración · Pauta</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Pauta en Meta, medida como una fuente más</h1>
        <p className="mt-2 max-w-2xl text-sm text-faro-text-2">
          Pega el enlace en tu anuncio, carga el gasto a mano o por CSV y Faro lo reparte solo entre los leads reales que llegaron por esa campaña.
        </p>

        <section aria-label="Resumen de pauta" className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="CPL de meta_ads (real)" value={metaSource && metaSource.cpl !== null && metaSource.costUsd > 0 ? fmt(metaSource.cpl) : "Sin datos"} accent hint={metaSource ? `${metaSource.fit} leads del perfil · ${fmt(metaSource.costUsd)} de costo total` : "Aún no hay leads de pauta"} />
          <Stat label="Gasto cargado" value={fmt(rows.filter((r) => !r.isDemo).reduce((a, r) => a + r.usd, 0))} hint="Sin filas de prueba" />
          <Stat label="Filas de prueba" value={String(rows.filter((r) => r.isDemo).length)} hint="Marcadas DEMO, fuera de los totales reales" />
        </section>

        {orphanTotal > 0 && (
          <p role="note" className="mt-4 rounded-card border border-border bg-card p-4 text-sm text-faro-text-2">
            Gasto sin leads atribuidos aún: <strong className="text-foreground">{fmt(orphanTotal)}</strong> ({orphan.map((o) => o.campaign).join(", ")}). No entra al CPL hasta que lleguen leads con ese <code className="text-faro-accent">utm_campaign</code>; revisa que el nombre coincida.
          </p>
        )}

        <MetaPanel status={meta.status} campaigns={meta.campaigns} lastSync={meta.lastSync} />

        <h2 className="mt-12 text-xl font-semibold tracking-tight">Carga manual y enlace UTM</h2>
        <p className="mt-1 text-sm text-faro-text-2">Para gasto de otras cuentas o si la API no está conectada. Una fila sincronizada desde Meta reemplaza la manual del mismo día y campaña.</p>

        <AdsPanel
          links={links}
          defaultCampaign={campaign}
          rows={rows.map((r) => ({ id: r.id, platform: r.platform, campaign: r.campaign, date: r.date, usd: r.usd, impressions: r.impressions, clicks: r.clicks, isDemo: r.isDemo }))}
        />
      </div>
    </main>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className="rounded-card border border-border bg-card p-5" style={accent ? { borderColor: "var(--faro-border-active)" } : undefined}>
      <p className="text-xs text-faro-text-3">{label}</p>
      <p className={`mt-2 font-display text-3xl font-bold tracking-tight ${accent ? "text-faro-accent" : ""}`}>{value}</p>
      <p className="mt-1 text-xs text-faro-text-2">{hint}</p>
    </div>
  );
}

/** Live Meta account + campaigns (best effort: an API failure shows as an error, never breaks the page). */
async function loadMeta(db: AppDb): Promise<{ status: MetaStatusView; campaigns: MetaCampaignView[]; lastSync: LastSyncView | null }> {
  const env = getEnv();
  const ads = getMetaAds(env, apiCallLogger(db));
  const status: MetaStatusView = {
    mock: ads.isMock,
    configured: metaAdsConfigured(env),
    accountName: null,
    currency: null,
    pageId: env.META_PAGE_ID ?? null,
    spendEnabled: env.ADS_SPEND_ENABLED,
    maxDailyBudget: env.ADS_MAX_DAILY_BUDGET_COP,
    allowedHosts: allowedAdHosts(env),
    error: null,
  };
  let campaigns: MetaCampaignView[] = [];
  try {
    const [account, list, stats] = await Promise.all([ads.getAccount(), ads.listCampaigns(), metaCampaignStats(db, bogotaDate(29))]);
    status.accountName = account.name;
    status.currency = account.currency;
    campaigns = list.map((c) => {
      const st = ads.isMock ? undefined : stats.get(c.id);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        effectiveStatus: c.effectiveStatus,
        dailyBudget: c.dailyBudget,
        spendLocal: st?.spendLocal ?? 0,
        usd: st?.usd ?? 0,
        impressions: st?.impressions ?? 0,
        clicks: st?.clicks ?? 0,
        conversations: st?.conversations ?? 0,
      };
    });
  } catch (e) {
    status.error = e instanceof MetaAdsError ? `Meta: ${e.message}` : "No se pudo leer la cuenta de Meta.";
  }
  const last = await getLastSync(db);
  const lastSync: LastSyncView | null = last ? { at: last.at, mode: last.mode, saved: last.saved, rows: last.rows, since: last.since, until: last.until, error: last.error } : null;
  return { status, campaigns, lastSync };
}
