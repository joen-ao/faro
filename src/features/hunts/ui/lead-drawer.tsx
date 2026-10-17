"use client";

import { AlertTriangle, ArrowUpRight, Check, GitMerge, Mail, MapPin, Minus, Phone, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { getLeadDetail } from "../service";
import { COST_LABEL, EVENT_LABEL, REASON_LABEL, SOURCE_LABEL, STATUS_LABEL, fmtClock, fmtDate, fmtUsd } from "./format";
import { StatusDot } from "./lead-list";

export type LeadDetail = Awaited<ReturnType<typeof getLeadDetail>>;
type Criterion = { criterio: string; cumplido: boolean; evidencia: string; url: string | null; peso: number };

const THRESHOLD = 60;

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="border-t border-white/[0.08] px-6 py-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-white" style={{ letterSpacing: "-0.01em" }}>
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Placeholder for F13's LeadReceipt: built from this lead's own `cost_entries`. */
function ReceiptSlot({ d }: { d: LeadDetail }) {
  const total = d.costs.reduce((a, c) => a + c.usd, 0);
  const test = d.lead.isDemo || d.costs.some((c) => c.isMock || c.isDemo);
  return (
    <div className="faro-receipt rounded-t-[10px] px-5 pt-5" data-testid="receipt">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase">Recibo de lead</span>
        <span className="font-mono text-[11px] opacity-60">#{d.lead.slug.slice(0, 10)}</span>
      </div>
      <p className="mt-1 truncate text-[12px] opacity-70">{d.company.name}</p>
      <div className="my-3 border-t border-dashed border-black/30" />
      {d.costs.length === 0 ? (
        <p className="py-3 text-[12.5px] leading-snug opacity-70">Todavía no se ha atribuido ningún costo a este lead. Aparecerá aquí con cada mensaje y llamada a la IA.</p>
      ) : (
        <ul className="space-y-1.5">
          {d.costs.map((c, i) => (
            <li key={i} className="faro-receipt-row font-mono text-[12px]">
              <span className="truncate">{COST_LABEL[c.category] ?? c.category}</span>
              <span className="dots" aria-hidden />
              <span className="tabular-nums">{fmtUsd(c.usd)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="my-3 border-t border-dashed border-black/30" />
      <div className="faro-receipt-row font-mono text-[13px] font-bold">
        <span>TOTAL</span>
        <span className="dots" aria-hidden />
        <span className="tabular-nums">{fmtUsd(total)}</span>
      </div>
      {test && <p className="mt-3 text-[11px] leading-snug opacity-65">Datos de prueba: no suman a los totales reales del tablero.</p>}
    </div>
  );
}

function FitBlock({ d }: { d: LeadDetail }) {
  const fit = d.fit;
  if (!fit) return <p className="text-[13px] text-faro-text-3">Esta empresa todavía no tiene evaluación de encaje.</p>;
  const criteria = fit.criteria as Criterion[];
  const ok = fit.score >= THRESHOLD;
  return (
    <>
      <div className="flex items-end gap-4">
        <div className={cn("text-[48px] leading-none font-semibold tabular-nums", ok ? "text-faro-accent" : "text-white")} style={{ fontFamily: "var(--font-poppins)", letterSpacing: "-0.04em" }} data-testid="drawer-score">
          {fit.score}
          <span className="ml-1 text-[16px] font-medium text-faro-text-3">/100</span>
        </div>
        <div className="mb-1.5 min-w-0 flex-1">
          <div className="relative h-1.5 rounded-full bg-white/10">
            <div className={cn("h-full rounded-full", ok ? "bg-faro-accent" : "bg-faro-text-3")} style={{ width: `${fit.score}%` }} />
            <span aria-hidden className="absolute -top-1 h-3.5 w-px bg-white/70" style={{ left: `${THRESHOLD}%` }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-faro-text-3">{ok ? "Supera" : "No llega a"} el umbral de {THRESHOLD}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {criteria.map((c, i) => (
          <li key={i} className="flex gap-3">
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", c.cumplido ? "bg-faro-accent text-faro-accent-ink" : "bg-white/10 text-faro-text-3")}>
              {c.cumplido ? <Check className="size-3" strokeWidth={3} aria-label="Cumplido" /> : <Minus className="size-3" aria-label="No cumplido" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] font-medium text-white">{c.criterio}</span>
                {c.peso > 0 && <span className="text-[11.5px] text-faro-text-3 tabular-nums">{c.cumplido ? `+${c.peso}` : `0/${c.peso}`}</span>}
              </div>
              <p className="mt-0.5 text-[12.5px] leading-snug break-words text-faro-text-2">{c.evidencia}</p>
              {c.url && (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-faro-accent underline-offset-2 hover:underline">
                  Ver evidencia <ArrowUpRight className="size-3" aria-hidden />
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function LeadDrawer({ huntId, leadId, name, onClose, mobile }: { huntId: string; leadId: string; name: string; onClose: () => void; mobile: boolean }) {
  const [data, setData] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let off = false;
    fetch(`/api/hunts/${huntId}/leads/${leadId}`)
      .then(async (r) => (r.ok ? ((await r.json()) as LeadDetail) : Promise.reject(new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`))))
      .then((d) => !off && setData(d))
      .catch((e: Error) => !off && setError(e.message));
    return () => {
      off = true;
    };
  }, [huntId, leadId, attempt]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, leadId]);

  const status = data?.lead.status;
  return (
    <aside
      role="dialog"
      aria-label={`Detalle de ${name}`}
      data-testid="lead-drawer"
      className={cn(
        "absolute z-30 flex flex-col overflow-hidden border border-white/[0.14] bg-faro-surface-1 shadow-[0_24px_60px_rgba(0,0,0,0.6)]",
        mobile ? "faro-sheet-in inset-x-0 top-[6dvh] bottom-0 rounded-t-[16px]" : "faro-slide-in top-3 right-3 bottom-3 w-[460px] rounded-[16px]",
      )}
    >
      <header className="flex items-start gap-3 px-6 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
            {status && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 font-medium text-white">
                <StatusDot status={status} className="!size-2" /> {STATUS_LABEL[status]}
              </span>
            )}
            {data?.lead.isDemo && <span className="rounded-full border border-dashed border-white/40 px-2.5 py-1 font-semibold tracking-wide text-faro-text-2">DEMO</span>}
            {data && <span className="text-faro-text-3">{SOURCE_LABEL[data.lead.primarySource] ?? data.lead.primarySource}</span>}
          </div>
          <h2 className="mt-2.5 text-[21px] leading-tight font-semibold break-words text-white">{name}</h2>
          {data && (data.company.city || data.company.address) && (
            <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-faro-text-2">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{[data.company.address, data.company.city].filter(Boolean).join(", ")}</span>
            </p>
          )}
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar detalle" className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-white/[0.14] text-white transition-colors hover:border-faro-accent">
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="faro-scroll min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div role="alert" className="mx-6 mb-5 rounded-[10px] border border-[var(--faro-danger)]/40 bg-[var(--faro-danger)]/10 p-4 text-[13px]">
            <p className="flex items-center gap-2 font-medium text-white">
              <AlertTriangle className="size-4 text-[var(--faro-danger)]" aria-hidden /> No pudimos cargar esta empresa
            </p>
            <p className="mt-1 text-faro-text-2">{error}</p>
            <button type="button" onClick={() => {
                setError(null);
                setAttempt((a) => a + 1);
              }} className="mt-3 rounded-[10px] border border-white/25 px-3 py-1.5 text-xs font-semibold text-white hover:border-faro-accent">
              Reintentar
            </button>
          </div>
        )}
        {!data && !error && (
          <div className="space-y-4 px-6 pb-6">
            <div className="faro-skeleton h-20" />
            <div className="faro-skeleton h-36" />
            <div className="faro-skeleton h-24" />
          </div>
        )}
        {data && (
          <>
            {data.fit?.whyNow && (
              <div className="mx-6 mb-5 rounded-[10px] bg-faro-accent/[0.09] p-4">
                <div className="text-[11.5px] font-semibold text-faro-accent">Por qué ahora</div>
                <p className="mt-1 text-[13.5px] leading-snug text-white/90">{data.fit.whyNow}</p>
              </div>
            )}
            <Section title="Encaje con tu perfil">
              <FitBlock d={data} />
            </Section>

            <Section title="Fuentes y licencias" aside={<span className="text-[11.5px] text-faro-text-3">{data.sources.length}</span>}>
              <ul className="space-y-3">
                {data.sources.map((s, i) => (
                  <li key={i} className="text-[12.5px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{SOURCE_LABEL[s.channel] ?? s.channel}</span>
                      {s.isMock && <span className="rounded-[5px] border border-dashed border-white/30 px-1.5 py-px text-[10px] font-semibold tracking-wide text-faro-text-2 uppercase">Mock</span>}
                      <time className="ml-auto text-faro-text-3">{fmtDate(s.fetchedAt)}</time>
                    </div>
                    <p className="mt-0.5 text-faro-text-3">{s.license ?? "Licencia no informada"}</p>
                    {s.url && (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-faro-accent underline-offset-2 hover:underline">
                        <span className="truncate">{s.url.replace(/^https?:\/\//, "")}</span> <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {data.merged.length > 0 && (
                <div className="mt-4 rounded-[10px] border border-white/[0.08] bg-faro-surface-2 p-3">
                  <p className="flex items-center gap-1.5 text-[12px] font-medium text-white">
                    <GitMerge className="size-3.5 text-faro-accent" aria-hidden /> {data.merged.length === 1 ? "1 duplicado fusionado" : `${data.merged.length} duplicados fusionados`}
                  </p>
                  <ul className="mt-2 space-y-1 text-[12px] text-faro-text-2">
                    {data.merged.map((m, i) => (
                      <li key={i} className="truncate">
                        {m.name} · {REASON_LABEL[m.reason] ?? m.reason}
                        {m.distanceMeters != null ? ` · ${m.distanceMeters} m` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>

            <Section title="Contactos genéricos de la empresa" aside={<ShieldCheck className="size-4 text-faro-text-3" aria-label="Solo contactos de empresa" />}>
              {data.contacts.length === 0 ? (
                <p className="text-[13px] text-faro-text-3">Sin contactos públicos todavía. Faro nunca guarda nombres de personas ni correos personales.</p>
              ) : (
                <ul className="space-y-2">
                  {data.contacts.map((c, i) => (
                    <li key={i} className="flex items-center gap-2.5 text-[13px] text-white">
                      {c.type === "email" ? <Mail className="size-4 shrink-0 text-faro-text-3" aria-hidden /> : <Phone className="size-4 shrink-0 text-faro-text-3" aria-hidden />}
                      <span className="min-w-0 truncate">{c.value}</span>
                      {c.evidenceUrl && (
                        <a href={c.evidenceUrl} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0 text-[11.5px] text-faro-accent underline-offset-2 hover:underline">
                          fuente
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {data.company.website && (
                <a href={data.company.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[12.5px] text-faro-accent underline-offset-2 hover:underline">
                  {data.company.website.replace(/^https?:\/\//, "")} <ArrowUpRight className="size-3" aria-hidden />
                </a>
              )}
            </Section>

            {(data.events.length > 0 || data.qualification) && (
              <Section title="Línea de tiempo del lead">
                <ol className="space-y-2.5">
                  {data.events.map((e, i) => (
                    <li key={i} className="flex items-center gap-3 text-[13px]">
                      <span aria-hidden className="size-1.5 rounded-full bg-faro-accent" />
                      <span className="text-white">{EVENT_LABEL[e.type] ?? e.type}</span>
                      <time className="ml-auto text-[11.5px] text-faro-text-3 tabular-nums">{fmtClock(e.at)}</time>
                    </li>
                  ))}
                </ol>
                {data.qualification && (
                  <p className="mt-3 rounded-[10px] bg-faro-surface-2 p-3 text-[12.5px] leading-snug text-faro-text-2">
                    <span className="font-medium text-white">Resultado: {data.qualification.qualified ? "calificada" : "no calificada"}</span>
                    {data.qualification.isMock ? " (prueba)" : ""}. {data.qualification.summary}
                  </p>
                )}
              </Section>
            )}

            <div className="border-t border-white/[0.08] px-6 pt-5 pb-8">
              <h3 className="mb-3 text-[13px] font-semibold text-white">Recibo de lead</h3>
              <ReceiptSlot d={data} />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
