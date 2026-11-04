import type { Metadata } from "next";
import { headers } from "next/headers";
import { Attribution } from "@/components/attribution";
import { FunnelSection, HealthSection, ResultsBand, TrendSection } from "@/components/dashboard/analytics";
import { BreakdownTable } from "@/components/dashboard/breakdown-table";
import { MetaVsFaro, minutesAgo } from "@/components/dashboard/business";
import { DashboardBody } from "@/components/dashboard/dashboard-body";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { EmptyState } from "@/components/dashboard/panels";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { getDashboardSnapshots } from "@/features/dashboard/data";
import { parseFilters, resolveWindow, snapshotRange, type DashFilters } from "@/features/dashboard/filters";
import { sourceLabel } from "@/features/dashboard/format";
import { getProspecting } from "@/features/dashboard/prospecting";
import { requireAppAccess } from "@/lib/app-access";

export const dynamic = "force-dynamic";
/** The first computation (no snapshot yet) and the background refresh (`after`) need room. */
export const maxDuration = 60;
export const metadata: Metadata = { title: "Tablero · Faro", robots: { index: false } };

const CHANNEL_TEXT: Record<DashFilters["channel"], string> = { all: "", email: "Correo", whatsapp: "WhatsApp", meta: "Meta (pauta)" };
const SEGMENT_TEXT: Record<DashFilters["segment"], string> = { all: "", empresas: "Empresas", independientes: "Independientes" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const h = await headers();
  if (requireAppAccess(new Request("http://faro.local/app/dashboard", { headers: h }))) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-faro-text-2">El tablero es interno. Entra con la clave de acceso del equipo.</p>
      </main>
    );
  }
  const filters = parseFilters(await searchParams);
  const w = resolveWindow(filters);
  const range = snapshotRange(filters);
  const db = (await getReadyDb()) as unknown as AppDb;
  // F43: prospecting is computed live under the filters; Meta vs. Faro and the receipts keep their stored copies (F31).
  const p = await getProspecting(db, filters, w, { sourceLabel });
  const { business, detail } = await getDashboardSnapshots(db, range ?? 30);
  const d = detail.data;
  const huntLabel = filters.huntId ? p.hunts.find((x) => x.id === filters.huntId)?.label : null;
  const summary = [CHANNEL_TEXT[filters.channel], SEGMENT_TEXT[filters.segment], huntLabel, `${w.label}, comparado con ${w.prevLabel}`].filter(Boolean).join(" · ");
  const empty = p.funnel[0]!.value === 0 && p.results.qualified.value === 0 && d.matrix.totals.found === 0;

  return (
    <main>
      <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-8 sm:px-6 sm:pb-[72px] sm:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-4 pb-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold leading-tight tracking-[-0.03em] sm:text-[40px]">Tablero</h1>
            <p className="mt-1.5 max-w-xl text-sm text-faro-text-2">Cuánto cuesta una reunión y un lead calificado, y qué segmento responde. Solo datos reales, con recibo.</p>
          </div>
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <RefreshButton range={range ?? 30} />
            <p className="text-xs text-faro-text-3" data-testid="snapshot-age">
              Prospección en vivo · Meta vs. Faro actualizado {minutesAgo(business.computedAt)}
              {business.stale && " (recalculando)"}
            </p>
          </div>
        </header>

        <FilterBar filters={filters} hunts={p.hunts} summary={summary} />

        <div className="mt-7 space-y-7">
          {empty && <EmptyState />}
          <ResultsBand p={p} w={w} />
          <div className="grid gap-7 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <FunnelSection p={p} />
            <TrendSection p={p} w={w} />
          </div>
          <BreakdownTable data={p.breakdown} />

          {filters.channel === "all" &&
            (range ? (
              <MetaVsFaro b={business.data} />
            ) : (
              <section className="rounded-card border border-border bg-card p-5 text-sm text-faro-text-2 sm:p-6">
                <h2 className="font-display text-xl font-semibold text-white">Meta vs. Faro</h2>
                <p className="mt-1">La comparación de canales con su veredicto se calcula sobre 7, 30 o 90 días. Elige uno de esos períodos para verla.</p>
              </section>
            ))}

          <HealthSection p={p} compliance={d.compliance} />

          <details className="group rounded-card border border-border bg-card p-5 sm:p-6">
            <summary className="cursor-pointer list-none font-display text-lg font-semibold">
              <span aria-hidden className="mr-2 inline-block transition-transform group-open:rotate-90">
                ›
              </span>
              Detalle por fuente y canal (histórico, con recibos)
            </summary>
            <div className="mt-5">
              <DashboardBody bucket={d.matrix} />
            </div>
          </details>
        </div>

        <footer className="mt-10 border-t border-border pt-5">
          <Attribution />
        </footer>
      </div>
    </main>
  );
}
