import type { DashWindow } from "@/features/dashboard/filters";
import type { FunnelStep, Metric, ProspectingData, TrendBucket } from "@/features/dashboard/prospecting";
import { fmtInt, fmtPct, fmtUsd } from "@/features/dashboard/format";
import { cn } from "@/lib/utils";

/* F43 · Prospecting analytics under the global filters. Server components: they render what getProspecting computed. */

type Fmt = "int" | "usd";
const fmtV = (v: number | null, f: Fmt) => (v === null ? "—" : f === "usd" ? fmtUsd(v) : fmtInt(v));
const fmtDay = (ymd: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${ymd}T12:00:00Z`));

function Change({ m, lowerIsBetter }: { m: Metric; lowerIsBetter?: boolean }) {
  if (m.delta === null) return null;
  const flat = Math.abs(m.delta) < 0.005;
  const up = m.delta > 0;
  const good = flat ? null : up !== !!lowerIsBetter;
  return (
    <span className={cn("font-medium tabular-nums", good === null ? "text-faro-text-2" : good ? "text-faro-accent" : "text-[var(--faro-danger)]")}>
      {flat ? "sin cambio" : `${up ? "+" : "−"}${fmtPct(Math.abs(m.delta))}`}
    </span>
  );
}

/** Bars per bucket: magnitude without inventing a line between sparse days. */
function MiniBars({ values, label }: { values: (number | null)[]; label: string }) {
  const nums = values.map((v) => v ?? 0);
  const max = Math.max(...nums);
  if (max <= 0 || values.length < 2) return null;
  return (
    <svg viewBox={`0 0 ${values.length * 6} 28`} width={Math.min(140, values.length * 6)} height={28} role="img" aria-label={label} preserveAspectRatio="none" className="shrink-0">
      {nums.map((v, i) => (
        <rect key={i} x={i * 6 + 1} y={28 - Math.max(v > 0 ? 2 : 0, (v / max) * 26)} width={4} height={Math.max(v > 0 ? 2 : 0, (v / max) * 26)} rx={1} fill={v > 0 ? "var(--faro-accent)" : "transparent"} opacity={i === nums.length - 1 ? 1 : 0.55} />
      ))}
    </svg>
  );
}

function Result({ label, m, fmt, def, lowerIsBetter, north, prevLabel }: { label: string; m: Metric; fmt: Fmt; def: string; lowerIsBetter?: boolean; north?: boolean; prevLabel: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-5 py-4 sm:py-5" data-testid={`result-${label}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={cn("text-sm", north ? "font-semibold text-white" : "text-faro-text-2")}>{label}</h3>
        {m.lowSample && <span className="shrink-0 rounded-full border border-[var(--faro-warn)] px-2 py-0.5 text-[11px] text-[var(--faro-warn)]">pocos datos</span>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className={cn("font-display font-bold tabular-nums tracking-tight", north ? "text-[44px] leading-none text-faro-accent" : "text-[32px] leading-none text-white", m.value === null && "text-faro-text-3")}>{fmtV(m.value, fmt)}</p>
        <MiniBars values={m.series} label={`${label} por período`} />
      </div>
      <p className="text-[13px]">
        <Change m={m} lowerIsBetter={lowerIsBetter} /> <span className="text-faro-text-3">{m.delta === null ? "Antes" : "vs."} {fmtV(m.prev, fmt)} <span className="whitespace-nowrap">({prevLabel})</span></span>
      </p>
      <p className="text-xs leading-relaxed text-faro-text-3">{def}</p>
    </div>
  );
}

export function ResultsBand({ p, w }: { p: ProspectingData; w: DashWindow }) {
  const r = p.results;
  return (
    <section aria-labelledby="res-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="res-h" className="font-display text-xl font-semibold">
          Resultados
        </h2>
        <p className="text-sm text-faro-text-2">
          Gasto atribuible: <span className="font-semibold tabular-nums text-white">{fmtUsd(r.spend.value)}</span> <span className="text-faro-text-3">({fmtUsd(r.spend.prev)} antes)</span>
        </p>
      </div>
      <div className="mt-3 grid divide-y divide-border overflow-hidden rounded-card border border-border bg-faro-surface-1 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4 [&>*:nth-child(n+3)]:sm:border-t [&>*:nth-child(n+3)]:sm:border-border xl:[&>*:nth-child(n+3)]:border-t-0">
        <Result label="Leads calificados" north m={r.qualified} fmt="int" prevLabel={w.prevLabel} def="Positivos del agente de Dapta en el período. La métrica norte." />
        <Result label="Reuniones agendadas" m={r.meetings} fmt="int" prevLabel={w.prevLabel} def="Diagnósticos que el agente reservó en el calendario de Mokub." />
        <Result label="Costo por reunión" m={r.costPerMeeting} fmt="usd" lowerIsBetter prevLabel={w.prevLabel} def="Gasto atribuible ÷ reuniones. Pocos datos con menos de 3." />
        <Result label="CPQL" m={r.cpql} fmt="usd" lowerIsBetter prevLabel={w.prevLabel} def="Gasto atribuible ÷ leads calificados. Pocos datos con menos de 3." />
      </div>
    </section>
  );
}

function FunnelRow({ s, max, first }: { s: FunnelStep; max: number; first: boolean }) {
  const pct = max > 0 ? (s.value / max) * 100 : 0;
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 py-2 sm:grid-cols-[12rem_minmax(0,1fr)_7.5rem]">
      <span className="truncate text-sm text-faro-text-2">{s.label}</span>
      <span className="relative h-7 overflow-hidden rounded-[6px] bg-white/[0.04]" aria-hidden>
        <span className="absolute inset-y-0 left-0 rounded-[6px] bg-faro-accent/85" style={{ width: `${Math.max(s.value > 0 ? 1.5 : 0, pct)}%` }} />
      </span>
      <span className="text-right tabular-nums">
        <span className="font-semibold text-white">{fmtInt(s.value)}</span>
        {!first && <span className="ml-1.5 text-xs text-faro-text-3">{s.rate === null ? "—" : fmtPct(s.rate)}</span>}
      </span>
    </li>
  );
}

export function FunnelSection({ p }: { p: ProspectingData }) {
  const max = p.funnel[0]?.value ?? 0;
  const worst = p.funnel.slice(1).filter((s) => s.rate !== null && p.funnel[0]!.value >= 20).sort((a, b) => (a.rate ?? 1) - (b.rate ?? 1))[0];
  return (
    <section aria-labelledby="fun-h" className="rounded-card border border-border bg-card p-5 sm:p-6">
      <h2 id="fun-h" className="font-display text-xl font-semibold">
        Embudo de prospección
      </h2>
      <p className="mt-1 text-sm text-faro-text-2">Quienes recibieron su primer mensaje en el período, seguidos hasta hoy. El porcentaje es la conversión desde el paso anterior.</p>
      {max === 0 ? (
        <p className="mt-6 text-sm text-faro-text-3">Nadie recibió un primer mensaje con estos filtros. Prueba otro período o quita un filtro.</p>
      ) : (
        <>
          <ol className="mt-4 divide-y divide-white/[0.05]">
            {p.funnel.map((s, i) => (
              <FunnelRow key={s.key} s={s} max={max} first={i === 0} />
            ))}
          </ol>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-faro-text-3">Costo por contactado</dt>
              <dd className="font-semibold tabular-nums text-white">{fmtUsd(p.costPerContacted)}</dd>
            </div>
            <div>
              <dt className="text-faro-text-3">Costo por respuesta</dt>
              <dd className="font-semibold tabular-nums text-white">{fmtUsd(p.costPerReply)}</dd>
            </div>
            {worst && (
              <div className="min-w-0 basis-full sm:basis-auto">
                <dt className="text-faro-text-3">Mayor caída</dt>
                <dd className="text-white">
                  {worst.label}: <span className="tabular-nums">{fmtPct(worst.rate)}</span> pasa
                </dd>
              </div>
            )}
          </dl>
        </>
      )}
      {p.meta && (
        <p className="mt-4 text-sm text-faro-text-2">
          Por pauta llegaron <span className="font-semibold tabular-nums text-white">{fmtInt(p.meta.arrived)}</span> leads que escribieron solos:{" "}
          <span className="tabular-nums text-white">{fmtInt(p.meta.meetings)}</span> agendaron y <span className="tabular-nums text-white">{fmtInt(p.meta.qualified)}</span> calificaron.
        </p>
      )}
    </section>
  );
}

const SERIES: { key: keyof Omit<TrendBucket, "key">; label: string; color: string }[] = [
  { key: "sent", label: "Primeros mensajes", color: "rgba(255,255,255,0.28)" },
  { key: "opened", label: "Abrieron la propuesta", color: "var(--faro-accent)" },
  { key: "replied", label: "Respondieron", color: "#a78bfa" },
  { key: "meetings", label: "Reuniones", color: "#f5b544" },
];

export function TrendSection({ p, w }: { p: ProspectingData; w: DashWindow }) {
  const t = p.trend;
  const max = Math.max(1, ...t.map((b) => b.sent), ...t.map((b) => b.opened + b.replied + b.meetings));
  const H = 160;
  const bw = 100 / Math.max(1, t.length);
  const labelEvery = Math.ceil(t.length / 7);
  const quiet = t.every((b) => b.sent + b.opened + b.replied + b.meetings === 0);
  return (
    <section aria-labelledby="tr-h" className="rounded-card border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="tr-h" className="font-display text-xl font-semibold">
          Tendencia {w.bucket === "day" ? "por día" : "por semana"}
        </h2>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-faro-text-2">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      </div>
      {quiet ? (
        <p className="mt-6 text-sm text-faro-text-3">Sin actividad en el período con estos filtros.</p>
      ) : t.length === 1 ? (
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SERIES.map((s) => (
            <div key={s.key}>
              <dt className="text-xs text-faro-text-3">{s.label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-white">{fmtInt(t[0]![s.key])}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <>
          <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="mt-5 h-40 w-full" role="img" aria-label={`Primeros mensajes, aperturas, respuestas y reuniones ${w.bucket === "day" ? "por día" : "por semana"}`}>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={0} x2={100} y1={H * g} y2={H * g} stroke="rgba(255,255,255,0.06)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" />
            ))}
            {t.map((b, i) => {
              const x = i * bw + bw * 0.15;
              const wBar = bw * 0.7;
              const sentH = (b.sent / max) * (H - 4);
              let y = H;
              return (
                <g key={b.key}>
                  <title>{`${fmtDay(b.key)}: ${b.sent} primeros mensajes, ${b.opened} abrieron, ${b.replied} respondieron, ${b.meetings} reuniones`}</title>
                  <rect x={x} y={H - sentH} width={wBar} height={sentH} fill="rgba(255,255,255,0.14)" />
                  {SERIES.slice(1).map((s) => {
                    const h = (b[s.key] / max) * (H - 4);
                    y -= h;
                    return h > 0 ? <rect key={s.key} x={x + wBar * 0.2} y={y} width={wBar * 0.6} height={h} fill={s.color} /> : null;
                  })}
                </g>
              );
            })}
          </svg>
          <div className="relative mt-2 h-4 text-[11px] text-faro-text-3" aria-hidden>
            {t.map((b, i) =>
              i % labelEvery === 0 ? (
                <span key={b.key} className="absolute whitespace-nowrap" style={{ left: `${(i + 0.5) * bw}%`, transform: i === 0 ? "translateX(-25%)" : "translateX(-50%)" }}>
                  {fmtDay(b.key)}
                </span>
              ) : null,
            )}
          </div>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-faro-text-2 hover:text-white">Ver la tabla</summary>
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-left text-xs text-faro-text-3">
                  <tr>
                    <th className="py-1.5 font-medium">{w.bucket === "day" ? "Día" : "Semana del"}</th>
                    {SERIES.map((s) => (
                      <th key={s.key} className="py-1.5 text-right font-medium">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {t.map((b) => (
                    <tr key={b.key}>
                      <td className="py-1.5">{fmtDay(b.key)}</td>
                      {SERIES.map((s) => (
                        <td key={s.key} className="py-1.5 text-right">
                          {fmtInt(b[s.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

const CATEGORY: Record<string, string> = { ai: "IA", email: "Envío de correos", whatsapp: "WhatsApp", data: "Datos", scraping: "Búsqueda web", ads: "Pauta", dapta: "Dapta", human: "Tiempo del equipo" };

export function HealthSection({ p, compliance }: { p: ProspectingData; compliance: { senderIdentifiedPct: number | null; optOutsRespected: number; optOutsTotal: number; naturalPersonsContacted: number; blockedBySchedule: number } }) {
  const h = p.health;
  const item = (label: string, value: string, note: string, warn = false) => (
    <div className="min-w-0">
      <dt className="text-xs text-faro-text-3">{label}</dt>
      <dd className={cn("mt-1 font-display text-2xl font-bold tabular-nums", warn ? "text-[var(--faro-warn)]" : "text-white")}>{value}</dd>
      <p className="mt-0.5 text-xs text-faro-text-3">{note}</p>
    </div>
  );
  return (
    <section aria-labelledby="hl-h" className="rounded-card border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="hl-h" className="font-display text-xl font-semibold">
          Salud del envío
        </h2>
        <p className="text-sm tabular-nums text-faro-text-2">
          Hoy: {fmtInt(h.today.emails)}/{fmtInt(h.today.emailsPerDay)} correos{h.today.dailyEnabled ? "" : " (envío diario apagado)"} · {fmtInt(h.today.whatsapp)}/{fmtInt(h.today.whatsappLimit)} WhatsApp
        </p>
      </div>
      {h.unreported > 0 && (
        <p className="mt-3 rounded-[8px] border border-[var(--faro-warn)]/40 bg-[var(--faro-warn)]/10 px-3 py-2 text-sm text-[var(--faro-warn)]">
          {fmtInt(h.unreported)} correos enviados hace más de una hora siguen sin confirmación de entrega. Si el número no baja, revisa el webhook de Resend (/api/webhooks/email).
        </p>
      )}
      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        {item("Entrega", fmtPct(h.deliveryRate), `${fmtInt(h.contacted)} contactados`)}
        {item("Rebotes", fmtInt(h.bounced), "direcciones bloqueadas", h.contacted > 0 && h.bounced / h.contacted > 0.05)}
        {item("Quejas de spam", fmtInt(h.complaints), "se suprimen solas", h.complaints > 0)}
        {item("Bajas", fmtInt(h.optOuts), "en el período")}
        {item("Remitente identificado", compliance.senderIdentifiedPct === null ? "—" : `${compliance.senderIdentifiedPct.toLocaleString("es-CO")} %`, "histórico", compliance.senderIdentifiedPct !== null && compliance.senderIdentifiedPct < 100)}
      </dl>
      <div className="mt-5 grid gap-5 border-t border-border pt-4 text-sm lg:grid-cols-2">
        <div>
          <h3 className="text-xs text-faro-text-3">Gasto del período por concepto</h3>
          {h.spendByCategory.length === 0 ? (
            <p className="mt-1 text-faro-text-3">Sin gasto atribuible con estos filtros.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {h.spendByCategory.map((c) => (
                <li key={c.category} className="flex justify-between gap-3 tabular-nums">
                  <span className="text-faro-text-2">{CATEGORY[c.category] ?? c.category}</span>
                  <span className="text-white">{fmtUsd(c.usd)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="text-xs text-faro-text-3">Cumplimiento (histórico)</h3>
          <ul className="mt-1.5 space-y-1 text-faro-text-2">
            <li>
              Bajas respetadas: <span className="tabular-nums text-white">{compliance.optOutsRespected} de {compliance.optOutsTotal}</span>
            </li>
            <li>
              Independientes contactados: <span className="tabular-nums text-white">{fmtInt(compliance.naturalPersonsContacted)}</span>
            </li>
            <li>
              Bloqueados por horario: <span className="tabular-nums text-white">{fmtInt(compliance.blockedBySchedule)}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
