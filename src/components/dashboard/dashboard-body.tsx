import { buildRecommendation } from "@/features/dashboard/recommendation";
import { fmtUsd } from "@/features/dashboard/format";
import type { MetricsBucket } from "@/features/metrics/channels";
import { MatrixPanel } from "./matrix-panel";
import { CplBars, EmptyState, Funnel, KpiRow, PaidVsFree, Panel, RecommendationCard } from "./panels";

/** All charts for one world. `demo` buckets are labelled DEMO and never summed into the real ones. */
export function DashboardBody({ bucket, demo = false }: { bucket: MetricsBucket; demo?: boolean }) {
  const p = demo ? "d" : "r";
  const empty = bucket.totals.found === 0 && bucket.totals.costUsd === 0;
  if (empty) return demo ? null : <EmptyState />;
  const rec = buildRecommendation({ real: bucket });
  return (
    <div className="space-y-4">
      {!demo && (bucket.excludedMockUsd > 0 || bucket.excludedDemoUsd > 0) && (
        <p className="rounded-button border border-border px-3 py-2 text-xs text-faro-text-2">
          Se excluyen {fmtUsd(bucket.excludedMockUsd + bucket.excludedDemoUsd)} de costos de prueba (mock/demo) de estos totales.
        </p>
      )}
      <KpiRow bucket={bucket} />
      <RecommendationCard rec={rec} demo={demo} />
      <Panel id={`${p}-matrix`} title="Matriz fuente × canal" hint="Toca una celda para ver sus leads y abrir el recibo de cada uno.">
        <MatrixPanel bucket={bucket} demo={demo} />
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel id={`${p}-funnel`} title="Embudo por fuente" hint="De la empresa encontrada al lead calificado.">
          <Funnel bucket={bucket} />
        </Panel>
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
