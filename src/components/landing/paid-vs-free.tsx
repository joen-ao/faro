import { describeComparison, formatCount, formatUsd, type LandingSide, type LandingStats } from "@/features/metrics/landing";

function Side({ label, note, side, accent, widthPct }: { label: string; note: string; side: LandingSide; accent: boolean; widthPct: number }) {
  return (
    <div className="flex flex-col gap-4 rounded-card border border-faro-border bg-faro-surface-1 p-7" data-testid={accent ? "free-side" : "paid-side"}>
      <div>
        <h3 className="font-display text-lg font-semibold">{label}</h3>
        <p className="text-sm text-faro-text-3">{note}</p>
      </div>
      <p className={`font-display text-4xl font-bold ${accent ? "text-faro-accent" : "text-white"}`}>
        {side.cpl === null ? "Sin datos" : formatUsd(side.cpl)}
        {side.cpl !== null && <span className="ml-2 text-sm font-normal text-faro-text-3">por lead</span>}
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-white/10" role="presentation">
        <div className="h-full rounded-full" style={{ width: `${Math.max(widthPct, side.cpl === null ? 0 : 3)}%`, background: accent ? "var(--faro-gradient-brand)" : "#9b9999" }} />
      </div>
      <p className="text-sm text-faro-text-2">
        {formatCount(side.fit)} leads del perfil · {formatUsd(side.costUsd)} invertidos
      </p>
    </div>
  );
}

export function PaidVsFree({ stats }: { stats: LandingStats }) {
  return (
    <section id="pauta" aria-labelledby="pauta-title" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24">
      <h2 id="pauta-title" className="max-w-2xl font-display text-3xl font-bold leading-tight sm:text-4xl">
        Pauta vs. fuentes gratuitas
      </h2>
      <p className="mt-3 max-w-xl text-faro-text-2">Números reales de lo que Faro encontró durante el evento. Sin datos de ejemplo, sin empresas expuestas.</p>

      {stats.state === "empty" ? (
        <div data-testid="metrics-empty" className="mt-12 flex flex-col gap-2 rounded-card border border-dashed border-faro-border p-10">
          <p className="font-display text-2xl font-semibold">Aún no hay datos del evento</p>
          <p className="max-w-lg text-faro-text-2">
            Cuando termine la primera búsqueda real, aquí aparecerá el costo por lead de cada fuente frente a la pauta. Mientras tanto, la demostración de arriba usa cifras de ejemplo.
          </p>
        </div>
      ) : (
        <div className="mt-12" data-testid="metrics-ready">
          <div className="grid gap-5 md:grid-cols-2">
            {(() => {
              const max = Math.max(stats.paid.cpl ?? 0, stats.free.cpl ?? 0) || 1;
              return (
                <>
                  <Side label="Fuentes gratuitas" note="OpenStreetMap, RUES, REPS y más" side={stats.free} accent widthPct={((stats.free.cpl ?? 0) / max) * 100} />
                  <Side label="Pauta (Meta Ads)" note="El canal de control" side={stats.paid} accent={false} widthPct={((stats.paid.cpl ?? 0) / max) * 100} />
                </>
              );
            })()}
          </div>
          <p className="mt-6 text-lg text-faro-text-2">
            {describeComparison(stats)}
          </p>
          <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-faro-border pt-8 sm:grid-cols-4">
            {[
              ["Empresas encontradas", stats.leadsFound],
              ["Del perfil", stats.leadsFit],
              ["Contactadas", stats.contacted],
              ["Calificadas por Dapta", stats.qualified],
            ].map(([k, v]) => (
              <div key={k as string} className="flex flex-col-reverse">
                <dt className="text-sm text-faro-text-3">{k}</dt>
                <dd className="font-display text-3xl font-bold">{formatCount(v as number)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
