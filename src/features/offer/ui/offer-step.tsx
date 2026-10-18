"use client";

import { Check, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { recommendService } from "../match";
import type { Angle, Refinement, Service } from "../schema";
import { ServicesEditor } from "./services-editor";

export interface OfferSelection {
  services: Service[];
  angles: Angle[];
  refinements: Refinement[];
}

type Decision = "pending" | "accepted" | "dismissed";
interface CatalogState {
  services: Service[];
  origin: "panel" | "default" | "empty";
  loaded: boolean;
}

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent";

function DecisionButtons({ state, onChange, label }: { state: Decision; onChange: (d: Decision) => void; label: string }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        type="button"
        data-testid="angle-accept"
        aria-pressed={state === "accepted"}
        aria-label={`Aceptar: ${label}`}
        onClick={() => onChange(state === "accepted" ? "pending" : "accepted")}
        className={cn("inline-flex h-9 items-center gap-1.5 rounded-[8px] border px-3 text-[13px] transition-colors", focusRing, state === "accepted" ? "border-faro-accent bg-faro-accent text-faro-accent-ink" : "border-white/16 text-white/85 hover:border-faro-accent")}
      >
        <Check className="size-3.5" aria-hidden /> {state === "accepted" ? "Aceptado" : "Aceptar"}
      </button>
      <button
        type="button"
        data-testid="angle-dismiss"
        aria-pressed={state === "dismissed"}
        aria-label={`Descartar: ${label}`}
        onClick={() => onChange(state === "dismissed" ? "pending" : "dismissed")}
        className={cn("grid size-9 place-items-center rounded-[8px] border transition-colors", focusRing, state === "dismissed" ? "border-white/30 bg-white/10 text-white" : "border-white/16 text-faro-text-3 hover:text-white")}
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

/**
 * Step 2 of a new search: which of the team's services this search brings, the value angles Claude proposes for
 * the segment (accept / dismiss) and a preview of how Faro uses them.
 */
export function OfferStep({
  criteria,
  error,
  onChange,
}: {
  /** Parsed ICP; angles are requested once it exists. */
  criteria: { sector: string; city: string; signals: string[] } | null;
  error: string | null;
  onChange: (s: OfferSelection) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogState>({ services: [], origin: "empty", loaded: false });
  const [selected, setSelected] = useState<string[]>([]);
  const [angles, setAngles] = useState<{ key: string; angles: Angle[]; refinements: Refinement[]; isMock: boolean } | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings/services")
      .then((r) => r.json())
      .then((j: { services?: Service[]; origin?: "panel" | "default" }) => setCatalog({ services: j.services ?? [], origin: j.services?.length ? (j.origin ?? "panel") : "empty", loaded: true }))
      .catch(() => setCatalog({ services: [], origin: "empty", loaded: true }));
  }, []);

  const chosen = useMemo(() => catalog.services.filter((s) => selected.includes(s.id)), [catalog.services, selected]);
  // The request body doubles as the cache key: a new request only when the profile or the chosen services change.
  const key = criteria && chosen.length ? JSON.stringify({ criteria: { sector: criteria.sector, city: criteria.city, signals: criteria.signals }, services: chosen }) : null;

  const fetchedKey = angles?.key ?? null;

  useEffect(() => {
    if (!key || fetchedKey === key || failed?.key === key) return;
    let alive = true;
    fetch("/api/icp/angles", { method: "POST", headers: { "content-type": "application/json" }, body: key })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { angles?: Angle[]; refinements?: Refinement[]; is_mock?: boolean; error?: string };
        if (!r.ok || !j.angles) throw new Error(j.error ?? `HTTP ${r.status}`);
        if (alive) {
          setAngles({ key, angles: j.angles, refinements: j.refinements ?? [], isMock: !!j.is_mock });
          setDecisions({});
        }
      })
      .catch((e: Error) => alive && setFailed({ key, message: `No pudimos proponer ángulos (${e.message}).` }));
    return () => {
      alive = false;
    };
  }, [key, fetchedKey, failed?.key]);

  const current = angles && angles.key === key ? angles : null;
  const anglesError = failed && failed.key === key ? failed.message : null;
  const anglesBusy = !!key && !current && !anglesError;
  const acceptedAngles = useMemo(() => (current?.angles ?? []).filter((_, i) => decisions[`a${i}`] === "accepted"), [current, decisions]);
  const acceptedRefinements = useMemo(() => (current?.refinements ?? []).filter((_, i) => decisions[`r${i}`] === "accepted"), [current, decisions]);

  useEffect(() => {
    onChange({ services: chosen, angles: acceptedAngles, refinements: acceptedRefinements });
  }, [chosen, acceptedAngles, acceptedRefinements, onChange]);

  // Preview: the example clinic without WhatsApp, with the service that would be suggested for it.
  const preview = useMemo(() => {
    const services = chosen.length ? chosen : catalog.services;
    const rec = recommendService([{ id: "whatsapp", status: "opportunity" }], services, acceptedAngles);
    return rec;
  }, [chosen, catalog.services, acceptedAngles]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <section id="oferta" aria-labelledby="oferta-title" data-testid="offer-step" className="faro-rise flex scroll-mt-20 flex-col gap-5 rounded-[20px] border border-white/12 bg-faro-surface-1 p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] uppercase tracking-[0.2em] text-faro-accent">Paso 2</p>
          <h2 id="oferta-title" className="mt-1.5 font-display text-[22px] font-semibold md:text-[24px]" style={{ letterSpacing: "-0.02em" }}>
            ¿Qué valor les llevas?
          </h2>
          <p className="mt-1.5 max-w-[520px] text-[15px] leading-normal text-white/60">
            Elige los servicios de esta búsqueda. Con ellos Faro escribe el correo, conecta cada hallazgo del diagnóstico con tu servicio y le da contexto al agente de Dapta.
          </p>
        </div>
        {catalog.services.length > 0 && (
          <a href="/app/settings/oferta" className={cn("inline-flex h-10 items-center rounded-[10px] border border-white/16 px-3.5 text-[14px] text-white/85 hover:border-white/40", focusRing)}>
            Editar mis servicios
          </a>
        )}
      </div>

      {!catalog.loaded ? (
        <p className="text-[14px] text-faro-text-3">Cargando tus servicios…</p>
      ) : catalog.services.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-white/80">Aún no tienes servicios guardados. Créalos aquí mismo: Claude te propone el catálogo y tú lo editas.</p>
          <ServicesEditor initial={[]} origin="empty" suggestOpen onSaved={(services) => setCatalog({ services, origin: "panel", loaded: true })} />
        </div>
      ) : (
        <fieldset>
          <legend className="sr-only">Servicios de esta búsqueda</legend>
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2.5">
            {catalog.services.map((s) => {
              const on = selected.includes(s.id);
              return (
                <li key={s.id}>
                  <label
                    data-testid={`service-pick-${s.id}`}
                    className={cn(
                      "flex h-full cursor-pointer flex-col gap-1.5 rounded-[14px] border bg-faro-surface-2 p-4 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-faro-accent",
                      on ? "border-faro-accent" : "border-white/10 hover:border-white/30",
                    )}
                  >
                    <span className="flex items-start gap-2.5">
                      <input type="checkbox" checked={on} onChange={() => toggle(s.id)} className="mt-1 size-4 accent-[var(--faro-accent)]" />
                      <span className="font-semibold leading-snug">{s.name}</span>
                    </span>
                    <span className="pl-6.5 text-[13px] leading-snug text-faro-text-2">{s.outcome}</span>
                    {s.entryOffer && <span className="pl-6.5 text-[12px] text-faro-text-3">{s.entryOffer}</span>}
                  </label>
                </li>
              );
            })}
          </ul>
          {catalog.origin === "default" && <p className="mt-2 text-[12.5px] text-faro-text-3">Catálogo inicial (de mokub.co). Puedes editarlo en Mis servicios.</p>}
        </fieldset>
      )}

      {error && (
        <p role="alert" data-testid="offer-error" className="rounded-[10px] border border-[var(--faro-danger)]/40 bg-[var(--faro-danger)]/10 px-4 py-2.5 text-[13.5px]">
          {error}
        </p>
      )}

      {chosen.length > 0 && (
        <div className="flex flex-col gap-3" data-testid="angles">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="text-[15px] font-semibold">Ángulos de valor para este segmento</h3>
            <span className="text-[12.5px] text-faro-text-3">{current?.isMock ? "modo demostración" : "propuestos por Claude"} · acepta los que usarás</span>
          </div>
          {!criteria ? (
            <p className="text-[13.5px] text-faro-text-3">Estructura el perfil (paso 1) y Claude propone cómo conectar tus servicios con este segmento.</p>
          ) : anglesBusy && !current ? (
            <p role="status" className="flex items-center gap-2 text-[13.5px] text-faro-text-2">
              <Sparkles className="size-4 text-faro-accent" aria-hidden /> Pensando ángulos…
            </p>
          ) : anglesError ? (
            <p role="alert" className="text-[13.5px] text-[var(--faro-danger)]">{anglesError}</p>
          ) : current ? (
            <>
              <ul className="flex flex-col gap-2">
                {current.angles.map((a, i) => {
                  const d = decisions[`a${i}`] ?? "pending";
                  return (
                    <li key={`a${i}`} data-testid="angle-card" data-state={d} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-faro-surface-2 p-3.5 pl-4", d === "dismissed" && "opacity-50")}>
                      <p className="min-w-0 flex-1 basis-64 text-[14px] leading-snug">{a.text}</p>
                      <DecisionButtons state={d} label={a.text} onChange={(v) => setDecisions((x) => ({ ...x, [`a${i}`]: v }))} />
                    </li>
                  );
                })}
              </ul>
              {current.refinements.length > 0 && (
                <>
                  <h4 className="mt-1 text-[13.5px] font-semibold text-white/85">Para afinar el perfil</h4>
                  <ul className="flex flex-col gap-2">
                    {current.refinements.map((r, i) => {
                      const d = decisions[`r${i}`] ?? "pending";
                      return (
                        <li key={`r${i}`} data-testid="refinement-card" className={cn("flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-dashed border-white/16 p-3.5 pl-4", d === "dismissed" && "opacity-50")}>
                          <p className="min-w-0 flex-1 basis-64 text-[14px] leading-snug text-white/85">{r.text}</p>
                          <DecisionButtons state={d} label={r.text} onChange={(v) => setDecisions((x) => ({ ...x, [`r${i}`]: v }))} />
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </>
          ) : null}
        </div>
      )}

      {preview && (
        <div data-testid="offer-preview" className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 rounded-[14px] bg-faro-surface-2 p-4.5">
          <div>
            <p className="text-[12px] uppercase tracking-[0.14em] text-faro-text-3">En el correo</p>
            <p className="mt-2 text-[14px] leading-normal">
              «Vimos que su sitio no tiene WhatsApp. {preview.service.name}: {preview.service.outcome}
              {preview.service.entryOffer ? ` ${preview.service.entryOffer}` : ""}»
            </p>
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-[0.14em] text-faro-text-3">En el diagnóstico</p>
            <p className="mt-2 text-[14px] leading-normal">Cada oportunidad muestra «Cómo le ayudamos» con el servicio que la resuelve.</p>
          </div>
          <div>
            <p className="text-[12px] uppercase tracking-[0.14em] text-faro-text-3">Al agente de Dapta</p>
            <p className="mt-2 text-[14px] leading-normal">Recibe el servicio sugerido de cada empresa y tu oferta para calificar si lo necesita.</p>
          </div>
        </div>
      )}
    </section>
  );
}
