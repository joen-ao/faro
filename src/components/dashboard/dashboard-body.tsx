import { buildRecommendation } from "@/features/dashboard/recommendation";
import { fmtUsd } from "@/features/dashboard/format";
import type { MetricsBucket } from "@/features/metrics/channels";
import { MatrixPanel } from "./matrix-panel";
import { CplTable, Funnel, Panel } from "./panels";

/** All-time detail (F13/F14): CPL by source, source x channel matrix with receipts, funnel by source. Real data only. */
export function DashboardBody({ bucket }: { bucket: MetricsBucket }) {
  if (bucket.totals.found === 0 && bucket.totals.costUsd === 0) {
    return <p className="text-sm text-faro-text-2">Todavía no hay leads reales para desglosar por fuente y canal.</p>;
  }
  const rec = buildRecommendation({ real: bucket });
  return (
    <div className="space-y-4">
      {(bucket.excludedMockUsd > 0 || bucket.excludedDemoUsd > 0) && (
        <p className="rounded-button border border-border px-3 py-2 text-xs text-faro-text-2">
          Se excluyen {fmtUsd(bucket.excludedMockUsd + bucket.excludedDemoUsd)} de costos de prueba (mock) de estos totales.
        </p>
      )}
      <CplTable bucket={bucket} rec={rec} id="cpl" />
      <Panel id="r-matrix" title="Matriz fuente × canal" hint="Toca una celda para ver sus leads y abrir el recibo de cada uno.">
        <MatrixPanel bucket={bucket} />
      </Panel>
      <Panel id="r-funnel" title="Embudo por fuente" hint="De la empresa encontrada al lead calificado, pasando por quién abrió su diagnóstico.">
        <Funnel bucket={bucket} />
      </Panel>
    </div>
  );
}
