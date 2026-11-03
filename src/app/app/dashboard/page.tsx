import type { Metadata } from "next";
import { headers } from "next/headers";
import { Attribution } from "@/components/attribution";
import { GroupFunnels, KpiSection, MetaVsFaro, minutesAgo, RangeTabs, WeeklyTrend } from "@/components/dashboard/business";
import { DashboardBody } from "@/components/dashboard/dashboard-body";
import { OutreachPanel } from "@/components/dashboard/outreach-panel";
import { CompliancePanel, EmptyState, Panel } from "@/components/dashboard/panels";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { parseRange } from "@/features/dashboard/business";
import { getDashboardSnapshots } from "@/features/dashboard/data";
import { requireAppAccess } from "@/lib/app-access";

export const dynamic = "force-dynamic";
/** The first computation (no snapshot yet) and the background refresh (`after`) need room. */
export const maxDuration = 60;
export const metadata: Metadata = { title: "Tablero · Faro", robots: { index: false } };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const h = await headers();
  if (requireAppAccess(new Request("http://faro.local/app/dashboard", { headers: h }))) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-faro-text-2">El tablero es interno. Entra con la clave de acceso del equipo.</p>
      </main>
    );
  }
  const range = parseRange((await searchParams).range);
  const db = (await getReadyDb()) as unknown as AppDb;
  // Stored copies (F31): fresh -> instant; stale -> shown while refreshing in the background.
  const { business, detail } = await getDashboardSnapshots(db, range);
  const b = business.data;
  const d = detail.data;
  const empty = b.kpis.newLeads.value === 0 && b.kpis.spend.value === 0 && b.kpis.qualified.value === 0 && d.matrix.totals.found === 0;

  return (
    <main>
      <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-8 sm:px-6 sm:pb-[72px] sm:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] uppercase tracking-[0.2em] text-faro-text-3">Tablero</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight tracking-[-0.03em] sm:text-[40px]">¿Cuánto cuesta un lead calificado?</h1>
            <p className="mt-2 max-w-xl text-sm text-faro-text-2">Solo datos reales. Cada costo sale de un registro que se puede abrir hasta su recibo.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <RangeTabs range={range} />
            <div className="flex flex-col gap-1">
              <RefreshButton range={range} />
              <p className="text-xs text-faro-text-3" data-testid="snapshot-age">
                Actualizado {minutesAgo(business.computedAt)}
                {business.stale && " · recalculando en segundo plano"}
              </p>
            </div>
          </div>
        </header>

        <div className="mt-7 space-y-7">
          {empty && <EmptyState />}
          <KpiSection b={b} />
          <MetaVsFaro b={b} />
          <div className="grid gap-7 xl:grid-cols-2">
            <WeeklyTrend trend={b.trend} />
            <GroupFunnels b={b} />
          </div>

          <OutreachPanel m={d.outreach} />

          <details className="group rounded-card border border-border bg-card p-5 sm:p-6">
            <summary className="cursor-pointer list-none font-display text-lg font-semibold">
              <span aria-hidden className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
              Detalle por fuente y canal (histórico, con recibos)
            </summary>
            <div className="mt-5">
              <DashboardBody bucket={d.matrix} />
            </div>
          </details>

          <Panel id="compliance" title="Panel de cumplimiento" hint="Requisito obligatorio (SPEC §8). Solo mensajes reales; los de prueba no cuentan.">
            <CompliancePanel m={d.compliance} />
          </Panel>
        </div>

        <footer className="mt-10 border-t border-border pt-5">
          <Attribution />
        </footer>
      </div>
    </main>
  );
}
