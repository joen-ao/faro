import Link from "next/link";
import type { ComplianceMetrics } from "@/features/compliance/metrics";
import { contactLabel, fmtInt, fmtInterval, fmtPct, fmtUsd, INSUFFICIENT, sourceLabel } from "@/features/dashboard/format";
import { splitPaidVsFree, type Recommendation } from "@/features/dashboard/recommendation";
import type { MetricsBucket, MetricsRow } from "@/features/metrics/channels";
import { cn } from "@/lib/utils";

export function Panel({ title, hint, children, className, id }: { title: string; hint?: string; children: React.ReactNode; className?: string; id?: string }) {
  return (
    <section aria-labelledby={id} className={cn("rounded-card border border-border bg-card p-5 sm:p-6", className)}>
      <h3 id={id} className="font-display text-lg font-semibold">{title}</h3>
      {hint && <p className="mt-1 text-sm text-faro-text-2">{hint}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Kpi({ label, value, note, empty, accent }: { label: string; value: string; note: string; empty?: boolean; accent?: boolean }) {
  return (
    <div className="rounded-card border border-white/10 bg-faro-surface-1 p-5">
      <p className="text-[13px] text-faro-text-3">{label}</p>
      <p className={cn("mt-2 font-display font-bold tabular-nums tracking-tight", empty ? "text-lg leading-[2.75rem] text-faro-text-2" : cn("text-4xl", accent ? "text-faro-accent" : "text-white"))}>{value}</p>
      <p className="mt-1 text-[13px] text-faro-text-3">{note}</p>
    </div>
  );
}

export function KpiRow({ bucket }: { bucket: MetricsBucket }) {
  const t = bucket.totals;
  const q = t.qualifiedRate;
  const rate = q.n > 0 ? q.k / q.n : null;
  return (
    <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Leads del perfil" value={fmtInt(t.fit)} accent note={`de ${fmtInt(t.found)} encontrados`} />
      <Kpi label="CPL global" value={t.cpl === null ? INSUFFICIENT : fmtUsd(t.cpl)} empty={t.cpl === null} note={`${fmtUsd(t.costUsd)} en API + IA + envíos ÷ ${fmtInt(t.fit)} del perfil`} />
      <Kpi
        label="% calificado"
        value={rate === null ? INSUFFICIENT : fmtPct(rate)}
        empty={rate === null}
        note={q.n > 0 ? `${q.k} de ${q.n} por el agente de Dapta · ${fmtInterval(q)}` : "aún sin leads del perfil"}
      />
      <Kpi label="CPLC" value={t.cplc === null ? "n/d" : fmtUsd(t.cplc)} empty={t.cplc === null} note={t.cplc === null ? "costo por lead calificado · ningún calificado todavía" : `costo por lead calificado · ÷ ${t.qualified} calificados`} />
    </section>
  );
}

const TOTAL_STAGES = ["found", "fit", "contacted", "opened", "chatted", "qualified"] as const;

/** Whole-world funnel (design: Encontrados → … → Calificados). Log-scaled bars so small stages stay visible next to thousands found. */
export function TotalsFunnel({ bucket, id }: { bucket: MetricsBucket; id: string }) {
  const t = bucket.totals;
  const stages = TOTAL_STAGES.map((k) => FUNNEL_STAGES.find((s) => s.key === k)!);
  const scale = Math.log10(Math.max(1, t.found) + 1);
  return (
    <section aria-labelledby={id} className="min-w-0 flex-[3_1_560px] rounded-card border border-white/10 bg-faro-surface-1 p-5 sm:p-6">
      <h3 id={id} className="font-display text-xl font-semibold">Embudo</h3>
      <ol className="mt-5 space-y-3 sm:space-y-2.5" data-testid="funnel-total">
        {stages.map((s, i) => {
          const v = t[s.key];
          const w = v > 0 ? Math.max(2, (Math.log10(v + 1) / scale) * 100) : 0;
          return (
            <li key={s.key} data-stage={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1.5 sm:grid-cols-[170px_minmax(0,1fr)_64px]">
              <span className="text-sm text-white/75">{s.label}</span>
              <span className="text-right font-bold tabular-nums sm:order-3">{fmtInt(v)}</span>
              <div className="col-span-2 h-5 sm:order-2 sm:col-span-1 sm:h-7">
                <div className="h-full rounded-lg" style={{ width: `${Math.min(100, w)}%`, background: i === 0 ? "var(--faro-surface-3)" : `rgba(203,232,80,${s.alpha})` }} />
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-xs text-faro-text-3">Barras en escala logarítmica para que las etapas pequeñas se vean junto a los encontrados.</p>
    </section>
  );
}

/** Highlights the first recommended source name in lime inside the sentence. */
function RecText({ rec }: { rec: Recommendation }) {
  const label = rec.sources[0] ? sourceLabel(rec.sources[0]) : null;
  const at = label ? rec.text.indexOf(label) : -1;
  if (!label || at < 0) return <>{rec.text}</>;
  return (
    <>
      {rec.text.slice(0, at)}
      <strong className="text-faro-accent">{label}</strong>
      {rec.text.slice(at + label.length)}
    </>
  );
}

/** CPL and CPLC per source with the recommendation sentence (real) or a labelled example (demo). */
export function CplTable({ bucket, rec, id, demo = false }: { bucket: MetricsBucket; rec: Recommendation; id: string; demo?: boolean }) {
  const rows = bucket.bySource.filter((r) => r.source !== null);
  const hasPaid = rows.some((r) => r.source === "meta_ads");
  const cell = "py-3 text-right tabular-nums";
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="min-w-0 flex-[2_1_380px] scroll-mt-20 rounded-card border border-white/10 bg-faro-surface-1 p-5 sm:p-6">
      <h3 id={`${id}-h`} className="font-display text-xl font-semibold">CPL por fuente</h3>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Leads del perfil, costo por lead (CPL) y costo por lead calificado (CPLC) de cada fuente</caption>
          <thead>
            <tr className="text-left text-faro-text-3">
              <th scope="col" className="py-2 font-medium">Fuente</th>
              <th scope="col" className="py-2 text-right font-medium">Del perfil</th>
              <th scope="col" className="py-2 text-right font-medium">CPL</th>
              <th scope="col" className="py-2 text-right font-medium">CPLC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.source} className="border-t border-white/10">
                <th scope="row" className="py-3 pr-3 text-left font-normal">{sourceLabel(r.source)}</th>
                <td className={cell}>{fmtInt(r.fit)}</td>
                <td className={cn(cell, r.cpl === null ? "text-faro-text-3" : "text-faro-accent")}>{r.cpl === null ? "sin datos" : fmtUsd(r.cpl)}</td>
                <td className={cn(cell, r.cplc === null ? "text-faro-text-3" : "text-white")}>{r.cplc === null ? "n/d" : fmtUsd(r.cplc)}</td>
              </tr>
            ))}
            {!hasPaid && (
              <tr className="border-t border-white/10">
                <th scope="row" className="py-3 pr-3 text-left font-normal">{sourceLabel("meta_ads")}</th>
                <td className={cell}>0</td>
                <td className={cn(cell, "text-faro-text-3")}>sin datos</td>
                <td className={cn(cell, "text-faro-text-3")}>n/d</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <aside aria-label="Recomendación" className={cn("mt-4 rounded-[10px] bg-faro-surface-2 p-3.5 text-sm leading-relaxed", rec.kind === "winner" ? "text-white" : "text-faro-text-2")}>
        {demo && <span className="mb-1 block text-xs font-semibold tracking-[0.14em] text-faro-text-3">DEMO · no es una recomendación real</span>}
        <RecText rec={rec} />
      </aside>
    </section>
  );
}

export function RecommendationCard({ rec, demo = false }: { rec: Recommendation; demo?: boolean }) {
  const good = rec.kind === "winner";
  return (
    <aside aria-label="Recomendación" className={cn("rounded-card border p-5 sm:p-6", good ? "border-faro-accent bg-faro-surface-2" : "border-border bg-card")}>
      <p className="text-xs uppercase tracking-[0.14em] text-faro-text-3">{demo ? "Ejemplo con datos DEMO · no es una recomendación real" : "Recomendación"}</p>
      <p className={cn("mt-2 font-display text-xl font-semibold leading-snug sm:text-2xl", good ? "text-white" : "text-faro-text-2")}>{rec.text}</p>
      {good && !demo && <p className="mt-2 text-xs text-faro-text-3">Calculado solo con datos reales, con muestra mínima por fuente.</p>}
    </aside>
  );
}

type StageKey = keyof Pick<MetricsRow, "found" | "fit" | "contacted" | "opened" | "responded" | "chatted" | "qualified">;
export const FUNNEL_STAGES: { key: StageKey; label: string; alpha: number }[] = [
  { key: "found", label: "Encontrados", alpha: 0.22 },
  { key: "fit", label: "Del perfil", alpha: 0.35 },
  { key: "contacted", label: "Contactados", alpha: 0.48 },
  { key: "opened", label: "Abrieron diagnóstico", alpha: 0.62 },
  { key: "responded", label: "Respondieron", alpha: 0.75 },
  { key: "chatted", label: "Conversaron con el agente", alpha: 0.88 },
  { key: "qualified", label: "Calificados", alpha: 1 },
];

/** Funnel per source (default) or per contact channel. Real and demo buckets are never mixed here. */
export function Funnel({ bucket, by = "source" }: { bucket: MetricsBucket; by?: "source" | "contact" }) {
  const rows = by === "source" ? bucket.bySource : bucket.byContact;
  const max = Math.max(1, ...rows.map((r) => (by === "source" ? r.found : Math.max(r.found, r.contacted))));
  if (rows.length === 0) return <p className="text-sm text-faro-text-2">Aún no hay contactos por canal.</p>;
  return (
    <div data-testid={`funnel-${by}`}>
      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-faro-text-2" aria-label="Etapas del embudo">
        {FUNNEL_STAGES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgba(203,232,80,${s.alpha})` }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
      <ul className="space-y-5">
        {rows.map((r) => (
          <li key={(by === "source" ? r.source : r.contact) ?? "x"}>
            <p className="mb-1.5 text-sm font-medium">{by === "source" ? sourceLabel(r.source) : contactLabel(r.contact)}</p>
            <div className="space-y-1">
              {FUNNEL_STAGES.map((s) => (
                <div key={s.key} className="flex items-center gap-3" data-stage={s.key}>
                  <div className="h-3.5 flex-1">
                    <div className="h-full rounded-r-[4px]" style={{ width: `${Math.min(100, (r[s.key] / max) * 100)}%`, minWidth: r[s.key] > 0 ? 3 : 0, background: `rgba(203,232,80,${s.alpha})` }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs tabular-nums text-faro-text-2 sm:w-52">
                    <span className="text-white">{fmtInt(r[s.key])}</span> <span className="hidden sm:inline">{s.label.toLowerCase()}</span>
                  </span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Side({ title, tag, cpl, cplc, fit, qualified, cost }: { title: string; tag: string; cpl: number | null; cplc: number | null; fit: number; qualified: number; cost: number }) {
  return (
    <div className="rounded-card border border-border bg-faro-surface-2 p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-faro-text-3">{tag}</p>
      <p className="mt-1 font-display text-base font-semibold">{title}</p>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-xs text-faro-text-2">CPL</dt>
          <dd className="text-2xl font-bold tabular-nums">{cpl === null ? "n/d" : fmtUsd(cpl)}</dd>
        </div>
        <div>
          <dt className="text-xs text-faro-text-2">CPLC</dt>
          <dd className="text-2xl font-bold tabular-nums">{cplc === null ? "n/d" : fmtUsd(cplc)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-faro-text-3">
        {fit} del perfil · {qualified} calificados · {fmtUsd(cost)} gastados
      </p>
    </div>
  );
}

export function PaidVsFree({ bucket }: { bucket: MetricsBucket }) {
  const { paid, free } = splitPaidVsFree(bucket.bySource);
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {paid ? (
          <Side title="Pauta (Meta Ads)" tag="De pago" cpl={paid.cpl} cplc={paid.cplc} fit={paid.fit} qualified={paid.qualified} cost={paid.costUsd} />
        ) : (
          <div className="rounded-card border border-dashed border-border p-4 text-sm text-faro-text-2">
            <p className="font-medium text-white">Sin pauta cargada</p>
            <p className="mt-1">Carga el gasto en Configuración → Pauta para compararlo con las fuentes gratuitas.</p>
          </div>
        )}
        <Side title="Fuentes gratuitas" tag="Resto de fuentes" cpl={free.cpl} cplc={free.cplc} fit={free.fit} qualified={free.qualified} cost={free.costUsd} />
      </div>
      {paid && paid.cplc !== null && free.cplc !== null && (
        <p className="mt-4 text-sm text-faro-text-2">
          Un lead calificado cuesta <strong className="text-white">{(paid.cplc / free.cplc).toLocaleString("es-CO", { maximumFractionDigits: 1 })}×</strong> más por pauta que por fuentes gratuitas.
        </p>
      )}
    </div>
  );
}

const CPL_COLOR = "#CBE850";
const CPLC_COLOR = "#A99BFF";

export function CplBars({ bucket }: { bucket: MetricsBucket }) {
  const rows = bucket.byContact;
  const max = Math.max(0.0001, ...rows.flatMap((r) => [r.cpl ?? 0, r.cplc ?? 0]));
  const pct = (v: number | null) => (v === null ? 0 : Math.max(1.5, (v / max) * 100));
  return (
    <div>
      <ul className="mb-4 flex gap-5 text-xs text-faro-text-2" aria-label="Leyenda">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CPL_COLOR }} aria-hidden />CPL (por lead del perfil)</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CPLC_COLOR }} aria-hidden />CPLC (por lead calificado)</li>
      </ul>
      {rows.length === 0 ? (
        <p className="text-sm text-faro-text-2">Aún no hay contactos por canal.</p>
      ) : (
        <ul className="space-y-4">
          {rows.map((r) => (
            <li key={r.contact}>
              <p className="mb-1 text-sm font-medium">{contactLabel(r.contact)}</p>
              {([["CPL", r.cpl, CPL_COLOR], ["CPLC", r.cplc, CPLC_COLOR]] as const).map(([l, v, color]) => (
                <div key={l} className="mb-1 flex items-center gap-3">
                  <div className="h-3.5 flex-1">
                    <div className="h-full rounded-r-[4px]" style={{ width: `${pct(v)}%`, background: v === null ? "transparent" : color, outline: v === null ? "1px dashed rgba(255,255,255,0.3)" : undefined }} />
                  </div>
                  <span className="w-28 shrink-0 text-right text-xs tabular-nums">
                    <span className="text-faro-text-3">{l} </span>
                    <span className={v === null ? "text-faro-text-2" : "text-white"}>{v === null ? "n/d" : fmtUsd(v)}</span>
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CompliancePanel({ m }: { m: ComplianceMetrics }) {
  const item = (label: string, value: string, ok: boolean | null, note: string) => (
    <div className="rounded-card border border-border bg-faro-surface-2 p-4">
      <dt className="text-xs text-faro-text-2">{label}</dt>
      <dd className="mt-1 flex items-center gap-2 text-2xl font-bold tabular-nums">
        {value}
        {ok !== null && (
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ok ? "bg-faro-accent text-[#1a1a1c]" : "bg-destructive text-[#1a1a1c]")}>{ok ? "OK" : "Revisar"}</span>
        )}
      </dd>
      <p className="mt-1 text-xs text-faro-text-3">{note}</p>
    </div>
  );
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {item("Personas naturales contactadas", String(m.naturalPersonsContacted), m.naturalPersonsContacted === 0, "Debe ser 0: solo personas jurídicas")}
      {item("Remitente identificado", m.senderIdentifiedPct === null ? "Sin envíos" : `${m.senderIdentifiedPct.toLocaleString("es-CO")} %`, m.senderIdentifiedPct === null ? null : m.senderIdentifiedPct === 100, `${m.sentTotal} mensajes enviados`)}
      {item("Opt-outs respetados", `${m.optOutsRespected} de ${m.optOutsTotal}`, m.optOutsRespected === m.optOutsTotal, "Nadie recibe un mensaje tras darse de baja")}
      {item("Envíos bloqueados por horario", String(m.blockedBySchedule), null, `${m.blockedTotal} bloqueados en total · Ley 2300`)}
    </dl>
  );
}

export function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-card border border-dashed border-border bg-card p-8 sm:p-12">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-70" style={{ background: "var(--faro-glow-violet)" }} />
      <div className="relative max-w-xl">
        <h3 className="font-display text-2xl font-bold leading-tight sm:text-3xl">Todavía no hay datos reales para medir</h3>
        <p className="mt-3 text-faro-text-2">
          El tablero se llena cuando haces una búsqueda y contactas empresas. Empieza así: describe a quién quieres vender, deja que Faro encuentre empresas en fuentes abiertas, contacta y mira cuánto cuesta cada lead calificado.
        </p>
        <ol className="mt-5 space-y-2 text-sm text-faro-text-2">
          <li><span className="text-faro-accent">1.</span> Describe tu cliente ideal.</li>
          <li><span className="text-faro-accent">2.</span> Revisa las empresas encontradas y contáctalas.</li>
          <li><span className="text-faro-accent">3.</span> Vuelve aquí: CPL, CPLC y la fuente que más conviene.</li>
        </ol>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Link href="/app/new" className="inline-flex min-h-11 items-center rounded-button bg-faro-accent px-5 text-sm font-semibold text-[#1a1a1c] hover:brightness-110">
            Encontrar mis clientes
          </Link>
          <span className="text-sm text-faro-text-3">¿Solo quieres ver cómo se ve? Activa «Incluir datos de prueba».</span>
        </div>
      </div>
    </div>
  );
}
