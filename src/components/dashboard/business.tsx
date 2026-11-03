import Link from "next/link";
import type { BusinessMetrics, FunnelStep, Group, GroupMetrics, Interval, Kpi, TrendWeek, Verdict } from "@/features/dashboard/business";
import { MIN_DIRECTIONAL, MIN_FORMAL, MIN_LEADS, MIN_QUALIFIED, MIN_RATE_N, RANGES } from "@/features/dashboard/business";
import { fmtInt, fmtPct, fmtUsd } from "@/features/dashboard/format";
import { cn } from "@/lib/utils";

/* F31 · Business dashboard sections. Pure server components: they only render the stored snapshot. */

const GROUP_LABEL: Record<Group, string> = { meta: "Meta (pauta)", faro: "Faro (prospección)" };
/** Faro is the brand accent; Meta a violet from the same palette (legible on the dark surfaces). */
export const GROUP_COLOR: Record<Group, string> = { meta: "#a78bfa", faro: "var(--faro-accent)" };
const fmtInterval = (i: Interval | null) => (i ? `IC 95 %: ${fmtPct(i.low)} a ${fmtPct(i.high)}` : "sin muestra");
const fmtDay = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" }).format(new Date(iso));
const fmtWeek = (week: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${week}T12:00:00Z`));

/* ---------------- header ---------------- */

export function minutesAgo(iso: string, now = new Date()): string {
  const min = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "hace menos de 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} días`;
}

export function RangeTabs({ range }: { range: number }) {
  return (
    <nav aria-label="Período" className="inline-flex rounded-button border border-border bg-faro-surface-1 p-1">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={`/app/dashboard?range=${r}`}
          aria-current={r === range ? "page" : undefined}
          className={cn("inline-flex min-h-9 items-center rounded-[8px] px-3 text-sm tabular-nums", r === range ? "bg-faro-accent font-semibold text-faro-accent-ink" : "text-faro-text-2 hover:text-white")}
        >
          {r} días
        </Link>
      ))}
    </nav>
  );
}

/* ---------------- KPI cards ---------------- */

type KpiFmt = "int" | "usd" | "pct";
const KPI_META: Record<Kpi["key"], { label: string; def: string; fmt: KpiFmt; lowerIsBetter?: boolean; minNote?: string }> = {
  qualified: { label: "Leads calificados", def: "Leads con una calificación real positiva (agente de Dapta) en el período.", fmt: "int" },
  cpql: { label: "CPQL", def: "Gasto real del período ÷ leads calificados del período.", fmt: "usd", lowerIsBetter: true, minNote: `mín. ${MIN_QUALIFIED} calificados` },
  cpl: { label: "CPL", def: "Gasto real del período ÷ leads nuevos del período.", fmt: "usd", lowerIsBetter: true, minNote: `mín. ${MIN_LEADS} leads` },
  rate: { label: "Tasa de calificación", def: "Calificados ÷ leads evaluados por el agente en el período.", fmt: "pct", minNote: `mín. ${MIN_RATE_N} evaluados` },
  spend: { label: "Gasto total", def: "Costos reales registrados en el período (pauta, datos, IA, envíos). Sin mock.", fmt: "usd" },
  newLeads: { label: "Leads nuevos", def: "Leads reales creados en el período, de todas las fuentes.", fmt: "int" },
};
const fmtValue = (v: number | null, f: KpiFmt) => (v === null ? "—" : f === "usd" ? fmtUsd(v) : f === "pct" ? fmtPct(v) : fmtInt(v));

function Delta({ k, f, lowerIsBetter }: { k: Kpi; f: KpiFmt; lowerIsBetter?: boolean }) {
  if (k.delta === null) return <span className="text-faro-text-3">sin comparación</span>;
  const up = k.delta > 0;
  const flat = Math.abs(k.delta) < 0.005;
  const good = flat ? null : up !== !!lowerIsBetter;
  const text = f === "pct" ? `${up ? "+" : ""}${(k.delta * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} pts` : `${up ? "+" : ""}${fmtPct(k.delta)}`;
  return (
    <span className={cn("font-medium tabular-nums", good === null ? "text-faro-text-2" : good ? "text-faro-accent" : "text-[var(--faro-danger)]")}>
      <span aria-hidden>{flat ? "→" : up ? "↑" : "↓"}</span> {text}
    </span>
  );
}

export function Sparkline({ values, color = "var(--faro-accent)", label }: { values: (number | null)[]; color?: string; label: string }) {
  const W = 120;
  const H = 32;
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <span className="text-[11px] text-faro-text-3">tendencia sin datos</span>;
  const max = Math.max(...nums);
  const min = Math.min(0, ...nums);
  const x = (i: number) => (values.length === 1 ? W / 2 : (i / (values.length - 1)) * (W - 4) + 2);
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);
  let d = "";
  values.forEach((v, i) => {
    if (v === null) return;
    d += `${d && values[i - 1] !== null ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  const last = values.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {values[last] !== null && <circle cx={x(last)} cy={y(values[last] as number)} r={2.5} fill={color} />}
    </svg>
  );
}

function KpiCard({ k, prevLabel, north }: { k: Kpi; prevLabel: string; north?: boolean }) {
  const m = KPI_META[k.key];
  return (
    <article
      aria-labelledby={`kpi-${k.key}`}
      data-testid={`kpi-${k.key}`}
      className={cn("flex min-w-0 flex-col rounded-card border bg-faro-surface-1 p-5", north ? "border-[var(--faro-border-active)] sm:col-span-2" : "border-white/10")}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 id={`kpi-${k.key}`} className="text-[13px] text-faro-text-3">
          {m.label}
          {north && <span className="ml-2 rounded-full bg-faro-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-faro-accent-ink">Métrica norte</span>}
        </h3>
        {k.lowSample && <span className="shrink-0 rounded-full border border-[var(--faro-warn)] px-2 py-0.5 text-[11px] text-[var(--faro-warn)]">pocos datos</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <p className={cn("font-display font-bold tabular-nums tracking-tight", north ? "text-5xl text-faro-accent" : "text-3xl text-white", k.value === null && "text-faro-text-2")}>{fmtValue(k.value, m.fmt)}</p>
        <Sparkline values={k.series} label={`${m.label} por semana`} />
      </div>
      <p className="mt-2 text-[13px]">
        <Delta k={k} f={m.fmt} lowerIsBetter={m.lowerIsBetter} /> <span className="text-faro-text-3">vs. {prevLabel} ({fmtValue(k.prev, m.fmt)})</span>
      </p>
      {k.key === "rate" && <p className="mt-1 text-xs text-faro-text-3">{fmtInterval(k.interval)}</p>}
      <p className="mt-auto pt-3 text-xs leading-relaxed text-faro-text-3">
        {m.def}
        {k.key !== "spend" && ` n = ${fmtInt(k.n)}.`}
        {k.lowSample && m.minNote && ` Pocos datos (${m.minNote}).`}
      </p>
    </article>
  );
}

export function KpiSection({ b }: { b: BusinessMetrics }) {
  const prevLabel = `${b.rangeDays} días anteriores`;
  const k = b.kpis;
  return (
    <section aria-labelledby="kpis-h" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="kpis-h" className="font-display text-xl font-semibold">Resultados</h2>
        <p className="text-xs text-faro-text-3">
          {fmtDay(b.periodStart)} – {fmtDay(b.periodEnd)} · comparado con {fmtDay(b.prevStart)} – {fmtDay(b.periodStart)} · tendencia semanal (lun–dom, Bogotá)
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard k={k.qualified} prevLabel={prevLabel} north />
        <KpiCard k={k.cpql} prevLabel={prevLabel} />
        <KpiCard k={k.rate} prevLabel={prevLabel} />
      </div>
      <h2 className="pt-3 font-display text-xl font-semibold">Actividad</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard k={k.spend} prevLabel={prevLabel} />
        <KpiCard k={k.newLeads} prevLabel={prevLabel} />
        <KpiCard k={k.cpl} prevLabel={prevLabel} />
      </div>
    </section>
  );
}

/* ---------------- Meta vs. Faro ---------------- */

const ROWS: { label: string; get: (g: GroupMetrics) => string; hint?: (g: GroupMetrics) => string | null; outcome?: boolean }[] = [
  { label: "Gasto", get: (g) => fmtUsd(g.spendUsd) },
  { label: "Leads", get: (g) => fmtInt(g.leads), hint: (g) => (g.group === "meta" ? "llegaron por pauta" : "contactados en el período") },
  { label: "Clics / contactados", get: (g) => fmtInt(g.reach), hint: (g) => (g.group === "meta" ? "clics en anuncios" : "empresas contactadas") },
  { label: "Respuestas", get: (g) => fmtInt(g.responded) },
  { label: "Calificados", get: (g) => fmtInt(g.qualified), outcome: true },
  { label: "Tasa de calificación", get: (g) => fmtPct(g.rate), hint: (g) => fmtInterval(g.interval), outcome: true },
  { label: "CPL", get: (g) => fmtUsd(g.cpl) },
  { label: "CPQL", get: (g) => (g.cpql === null ? "n/d" : fmtUsd(g.cpql)), outcome: true },
  {
    label: "Mediana hasta 1.ª respuesta",
    get: (g) => (g.medianHoursToResponse === null ? "—" : `${g.medianHoursToResponse.toLocaleString("es-CO", { maximumFractionDigits: 1 })} h`),
  },
];

const CONFIDENCE_LABEL: Record<Verdict["confidence"], string> = { insuficiente: "Datos insuficientes", baja: "Confianza baja", media: "Confianza media", alta: "Confianza alta" };

export function MetaVsFaro({ b }: { b: BusinessMetrics }) {
  const groups = [b.groups.meta, b.groups.faro];
  const v = b.verdict;
  return (
    <section aria-labelledby="mvf-h" className="rounded-card border border-border bg-card p-5 sm:p-6" data-testid="meta-vs-faro">
      <h2 id="mvf-h" className="font-display text-xl font-semibold">Meta vs. Faro</h2>
      <p className="mt-1 text-sm text-faro-text-2">
        Meta: leads de pauta (UTM o fbclid) que llegaron en el período. Faro: empresas de fuentes públicas contactadas por primera vez en el período. Calificados hasta hoy.
      </p>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[300px] border-collapse text-sm">
          <caption className="sr-only">Comparación de Meta y Faro en el período</caption>
          <thead>
            <tr className="text-left text-faro-text-3">
              <th scope="col" className="py-2 pr-2 font-medium">
                <span className="sr-only">Métrica</span>
              </th>
              {groups.map((g) => (
                <th key={g.group} scope="col" className="py-2 pl-2 text-right font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="size-2 rounded-full" style={{ background: GROUP_COLOR[g.group] }} />
                    {GROUP_LABEL[g.group]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.label} className="border-t border-white/10 align-top">
                <th scope="row" className={cn("py-2.5 pr-2 text-left font-normal", r.outcome ? "text-white" : "text-faro-text-2")}>
                  {r.label}
                </th>
                {groups.map((g) => (
                  <td key={g.group} className="py-2.5 pl-2 text-right tabular-nums">
                    <span className={r.outcome ? "font-semibold text-white" : ""}>{r.get(g)}</span>
                    {r.hint?.(g) && <span className="block text-[11px] text-faro-text-3">{r.hint(g)}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <aside
        aria-label="Veredicto"
        data-testid="verdict"
        data-kind={v.kind}
        className={cn("mt-5 rounded-[10px] p-4 text-sm leading-relaxed", v.kind === "winner" ? "border border-[var(--faro-border-active)] bg-faro-surface-2 text-white" : "bg-faro-surface-2 text-faro-text-2")}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faro-text-3">{CONFIDENCE_LABEL[v.confidence]}</p>
        <p className="mt-1">{v.text}</p>
        <p className="mt-2 text-xs text-faro-text-3">
          Muestra mínima: {MIN_DIRECTIONAL} leads por lado para una lectura direccional, unos {MIN_FORMAL} para una formal. Mismas reglas que los recibos (F13): sin mock ni datos de prueba.
        </p>
      </aside>
    </section>
  );
}

/* ---------------- weekly trend ---------------- */

export function WeeklyTrend({ trend }: { trend: TrendWeek[] }) {
  const W = 640;
  const H = 200;
  const pad = { l: 34, r: 10, t: 12, b: 26 };
  const max = Math.max(1, ...trend.flatMap((t) => [t.meta.leads, t.faro.leads]));
  const x = (i: number) => pad.l + (trend.length <= 1 ? 0 : (i / (trend.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = (g: Group, k: "leads" | "qualified") => trend.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(t[g][k]).toFixed(1)}`).join("");
  const empty = trend.every((t) => t.meta.leads + t.faro.leads === 0);
  const labelEvery = Math.ceil(trend.length / 6);
  return (
    <section aria-labelledby="trend-h" className="rounded-card border border-border bg-card p-5 sm:p-6" data-testid="weekly-trend">
      <h2 id="trend-h" className="font-display text-xl font-semibold">Tendencia semanal</h2>
      <p className="mt-1 text-sm text-faro-text-2">Leads (línea continua) y calificados (punteada) por semana de entrada, lunes a domingo en hora de Bogotá.</p>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-faro-text-2">
        {(["meta", "faro"] as const).map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded" style={{ background: GROUP_COLOR[g] }} />
            {GROUP_LABEL[g]}
          </span>
        ))}
      </div>
      {empty ? (
        <p className="mt-6 rounded-[10px] bg-faro-surface-2 p-4 text-sm text-faro-text-2">Sin leads de Meta ni contactos de Faro en estas semanas.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label="Leads y calificados por semana, Meta y Faro">
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="rgba(255,255,255,0.08)" />
              <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize={11} fill="#9b9999">
                {Math.round(max * f)}
              </text>
            </g>
          ))}
          {(["meta", "faro"] as const).map((g) => (
            <g key={g}>
              <path d={line(g, "leads")} fill="none" stroke={GROUP_COLOR[g]} strokeWidth={2} strokeLinejoin="round" />
              <path d={line(g, "qualified")} fill="none" stroke={GROUP_COLOR[g]} strokeWidth={2} strokeDasharray="4 4" strokeLinejoin="round" />
            </g>
          ))}
          {trend.map((t, i) =>
            i % labelEvery === 0 || i === trend.length - 1 ? (
              <text key={t.week} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill="#9b9999">
                {fmtWeek(t.week)}
              </text>
            ) : null,
          )}
        </svg>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-faro-text-2 hover:text-white">Ver la tabla por semana</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[320px] text-right text-xs tabular-nums">
            <thead className="text-faro-text-3">
              <tr>
                <th scope="col" className="py-1.5 text-left font-medium">Semana</th>
                <th scope="col" className="py-1.5 font-medium">Meta leads</th>
                <th scope="col" className="py-1.5 font-medium">Meta calif.</th>
                <th scope="col" className="py-1.5 font-medium">Faro leads</th>
                <th scope="col" className="py-1.5 font-medium">Faro calif.</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((t) => (
                <tr key={t.week} className="border-t border-white/10">
                  <th scope="row" className="py-1.5 text-left font-normal">{fmtWeek(t.week)}</th>
                  <td>{fmtInt(t.meta.leads)}</td>
                  <td>{fmtInt(t.meta.qualified)}</td>
                  <td>{fmtInt(t.faro.leads)}</td>
                  <td>{fmtInt(t.faro.qualified)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

/* ---------------- funnel by group ---------------- */

const STEP_LABEL: Record<FunnelStep["key"], string> = { found: "Encontrados", fit: "Del perfil", contacted: "Contactados", responded: "Respondieron", qualified: "Calificados" };

function GroupFunnelList({ group, steps }: { group: Group; steps: FunnelStep[] }) {
  const top = Math.max(1, steps[0]?.value ?? 0);
  return (
    <div className="min-w-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden className="size-2 rounded-full" style={{ background: GROUP_COLOR[group] }} />
        {GROUP_LABEL[group]}
      </h3>
      <ol className="mt-3 space-y-2.5" data-testid={`funnel-${group}`}>
        {steps.map((s) => (
          <li key={s.key} data-stage={s.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
            <span className="text-sm text-white/75">{STEP_LABEL[s.key]}</span>
            <span className="text-right text-sm tabular-nums">
              <strong>{fmtInt(s.value)}</strong>
              {s.stepRate !== null && <span className="ml-2 text-xs text-faro-text-3">{fmtPct(s.stepRate)} del paso anterior</span>}
            </span>
            <div className="col-span-2 h-2.5 rounded bg-faro-surface-2">
              <div className="h-full rounded" style={{ width: `${s.value > 0 ? Math.max(1.5, (s.value / top) * 100) : 0}%`, background: GROUP_COLOR[group] }} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GroupFunnels({ b }: { b: BusinessMetrics }) {
  return (
    <section aria-labelledby="funnel-h" className="rounded-card border border-border bg-card p-5 sm:p-6">
      <h2 id="funnel-h" className="font-display text-xl font-semibold">Embudo por canal</h2>
      <p className="mt-1 text-sm text-faro-text-2">
        Leads creados en el período y hasta dónde llegaron. En Meta el lead llegó solo (cuenta como contactado); la respuesta es una conversación con el agente o una respuesta a un mensaje.
      </p>
      <div className="mt-5 grid gap-6 md:grid-cols-2">
        <GroupFunnelList group="meta" steps={b.funnel.meta} />
        <GroupFunnelList group="faro" steps={b.funnel.faro} />
      </div>
    </section>
  );
}
