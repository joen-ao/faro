import { describeComparison, formatCount, formatUsd, type LandingSide, type LandingStats } from "@/features/metrics/landing";
import type { PublicMetrics } from "@/features/metrics/public";
import { cn } from "@/lib/utils";
import { EMPTY, Eyebrow, ScreenSection, Usd, amount } from "./ui";

const SOURCE_LABEL: Record<string, string> = {
  osm: "OpenStreetMap",
  rues: "RUES",
  reps: "REPS",
  google_places: "Google Places",
  website: "Sitios web",
  meta_ads: "Pauta en Meta",
};

function Side({ label, note, side, accent }: { label: string; note: string; side: LandingSide; accent: boolean }) {
  return (
    <div
      data-testid={accent ? "free-side" : "paid-side"}
      className={cn("min-w-0 flex-1 py-10 sm:py-12", accent ? "border-b border-white/[0.12] md:border-b-0 md:border-r md:pr-12" : "md:pl-12")}
    >
      <h3 className="text-[15px] font-normal tracking-normal text-white/60" style={{ fontFamily: "var(--font-sans)" }}>
        {label}
      </h3>
      <p className={cn("mt-3 font-display font-bold leading-[0.95] tracking-[-0.05em]", accent ? "text-faro-accent" : "text-white/90")}>
        <Usd value={side.cpl} className="text-[64px] sm:text-[96px] lg:text-[128px]" emptyClassName="block py-4 text-3xl tracking-[-0.02em] sm:text-4xl" />
      </p>
      <p className="mt-4 leading-relaxed text-white/60">{note}</p>
      <p className="mt-2 text-sm text-faro-text-3">
        {formatCount(side.fit)} leads del perfil · {formatUsd(side.costUsd)} invertidos
      </p>
    </div>
  );
}

function SourceBars({ rows }: { rows: PublicMetrics["bySource"] }) {
  const shown = rows.filter((r) => r.fit > 0 || r.costUsd > 0);
  if (!shown.length) return null;
  const max = Math.max(...shown.map((r) => r.cpl ?? 0)) || 1;
  return (
    <dl className="mt-10 grid grid-cols-1 gap-x-10 gap-y-6 text-[15px] sm:grid-cols-2 lg:grid-cols-4">
      {shown.map((r) => (
        <div key={r.source} className="faro-reveal flex flex-col">
          <div className="flex justify-between gap-3">
            <dt>{SOURCE_LABEL[r.source] ?? r.source}</dt>
            <dd className={r.free ? "text-faro-accent" : "text-white"}>{r.cpl === null ? EMPTY : `USD ${amount(r.cpl)}`}</dd>
          </div>
          <div aria-hidden className="mt-2.5 h-0.5 bg-white/10">
            <div
              className={cn("m-bar h-0.5", r.free ? "bg-faro-accent" : "bg-white/70")}
              style={{ width: `${r.cpl === null ? 0 : Math.max(2, (r.cpl / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </dl>
  );
}

export function PaidVsFree({ stats, bySource = [] }: { stats: LandingStats; bySource?: PublicMetrics["bySource"] }) {
  return (
    <ScreenSection id="pauta" labelledBy="pauta-title" className="bg-[#050505]">
      <div aria-hidden className="absolute -left-[10%] top-[10%] h-[80%] w-[70%] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(203,232,80,0.14)_0%,rgba(0,0,0,0)_70%)]" />
      <div className="relative mx-auto w-full max-w-[1240px] px-4 py-24 sm:px-6">
        <div className="faro-reveal">
          <Eyebrow>Pauta vs. fuentes gratuitas</Eyebrow>
          <h2 id="pauta-title" className="mt-4 max-w-[900px] font-display text-4xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-[68px]">
            ¿Qué fuente rinde más por peso?
          </h2>
        </div>

        {stats.state === "empty" ? (
          <div data-testid="metrics-empty" className="faro-reveal mt-16 flex flex-col gap-3 border-y border-white/[0.12] py-12">
            <p className="font-display text-2xl font-semibold sm:text-3xl">Aún no hay datos del evento</p>
            <p className="max-w-xl leading-relaxed text-white/60">
              Cuando termine la primera búsqueda real, aquí aparecerá el costo por lead de cada fuente frente a la pauta. Mientras tanto, la demostración de arriba usa cifras de ejemplo.
            </p>
          </div>
        ) : (
          <div data-testid="metrics-ready" className="faro-reveal mt-16">
            <div className="flex flex-col border-y border-white/[0.12] md:flex-row">
              <Side label="Fuentes públicas · CPL del perfil" note="OpenStreetMap, RUES y REPS: solo cuesta la IA y las consultas." side={stats.free} accent />
              <Side label="Pauta en Meta · CPL del perfil" note="Mismo perfil, medido con los leads que llegaron por la campaña." side={stats.paid} accent={false} />
            </div>
            <p className="mt-8 text-lg text-white/80">{describeComparison(stats)}</p>
            <SourceBars rows={bySource} />
          </div>
        )}
        <p className="mt-8 text-[13px] text-faro-text-3">Números del evento, cada uno con su recibo. Se actualizan solos.</p>
      </div>
    </ScreenSection>
  );
}
