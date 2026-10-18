import { buildDemoExample, buildRecommendation } from "@/features/dashboard/recommendation";
import { fmtUsd } from "@/features/dashboard/format";
import type { MetricsBucket } from "@/features/metrics/channels";
import { recommendNextBudget, simulateBandit } from "@/features/bandit";
import { BanditCard } from "./bandit-card";
import { MatrixPanel } from "./matrix-panel";
import { CplBars, CplTable, EmptyState, Funnel, KpiRow, PaidVsFree, Panel, RecommendationCard, TotalsFunnel } from "./panels";

/** All charts for one world. `demo` buckets are labelled DEMO and never summed into the real ones. */
export function DashboardBody({ bucket, demo = false, demoBucket = null }: { bucket: MetricsBucket; demo?: boolean; demoBucket?: MetricsBucket | null }) {
  const p = demo ? "d" : "r";
  const empty = bucket.totals.found === 0 && bucket.totals.costUsd === 0;
  if (empty) {
    if (demo) return null;
    const only = buildRecommendation({ real: bucket, demo: demoBucket });
    return (
      <div className="space-y-4">
        {only.kind === "demo_only" && <RecommendationCard rec={only} />}
        <BanditCard real={recommendNextBudget({ real: bucket }, 100)} simulation={simulateBandit()} />
        <EmptyState />
      </div>
    );
  }
  const rec = demo ? buildDemoExample(bucket) : buildRecommendation({ real: bucket });
  return (
    <div className="space-y-4">
      {!demo && (bucket.excludedMockUsd > 0 || bucket.excludedDemoUsd > 0) && (
        <p className="rounded-button border border-border px-3 py-2 text-xs text-faro-text-2">
          Se excluyen {fmtUsd(bucket.excludedMockUsd + bucket.excludedDemoUsd)} de costos de prueba (mock/demo) de estos totales.
        </p>
      )}
      <KpiRow bucket={bucket} />
      <div className="flex flex-wrap gap-4">
        <TotalsFunnel bucket={bucket} id={`${p}-funnel-total`} />
        <CplTable bucket={bucket} rec={rec} demo={demo} id={demo ? "d-cpl" : "cpl"} />
      </div>
      {!demo && <BanditCard real={recommendNextBudget({ real: bucket }, 100)} simulation={simulateBandit()} />}
      <Panel id={`${p}-matrix`} title="Matriz fuente × canal" hint="Toca una celda para ver sus leads y abrir el recibo de cada uno.">
        <MatrixPanel bucket={bucket} demo={demo} />
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Panel id={`${p}-funnel`} title="Embudo por fuente" hint="De la empresa encontrada al lead calificado, pasando por quién abrió su diagnóstico.">
            <Funnel bucket={bucket} />
          </Panel>
          <Panel id={`${p}-funnel-ch`} title="Embudo por canal" hint="Por canal del primer contacto. Aperturas deduplicadas (una por lead).">
            <Funnel bucket={bucket} by="contact" />
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel id={`${p}-paid`} title="Pauta vs. fuentes gratuitas" hint="La pauta es el canal de control.">
            <PaidVsFree bucket={bucket} />
          </Panel>
          <Panel id={`${p}-bars`} title="CPL vs. CPLC por canal" hint="Mismo eje en dólares. n/d: sin calificados todavía.">
            <CplBars bucket={bucket} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
