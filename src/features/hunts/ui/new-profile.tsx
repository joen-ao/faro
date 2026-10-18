"use client";

import { AlertTriangle, ArrowRight, Check, CornerDownLeft, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { findCity, findSector, ICP_EXAMPLES } from "@/features/icp/presets";
import { DEFAULT_THRESHOLD, type IcpCriteria } from "@/features/icp/schema";
import { OfferStep, type OfferSelection } from "@/features/offer/ui/offer-step";
import { cn } from "@/lib/utils";
import { estimateSources } from "../estimates";
import { SOURCE_LABEL, fmtInt } from "./format";
import "./hunts.css";

type Phase = "idle" | "parsing" | "ready" | "launching";
type Modes = { overpass?: string; socrata?: string };

const STEPS = ["Leyendo tu frase", "Identificando el sector", "Ubicando la ciudad", "Mapeando códigos CIIU y etiquetas del mapa"];
const MIN_THINK_MS = 1900;

const SOURCE_BLURB: Record<string, string> = {
  osm: "Negocios con ubicación exacta en el mapa. Ideal para descubrir.",
  rues: "Registro mercantil: confirma NIT y que sea persona jurídica.",
  reps: "Prestadores de salud habilitados, con correo de sede.",
};

/** Example labels are stored without accents (they double as mock-parse keys); show them properly. */
const accentLabel = (t: string) => t.replace(/\bClinicas\b/g, "Clínicas").replace(/\bBogota\b/g, "Bogotá");
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent";

function Chip({ children, onRemove, label }: { children: React.ReactNode; onRemove?: () => void; label: string }) {
  return (
    <span className="faro-step-in inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-faro-surface-2 pr-1.5 pl-3 text-[14px] text-white">
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Quitar ${label}`} className={`grid size-6 place-items-center rounded-[6px] text-faro-text-3 transition-colors hover:bg-white/15 hover:text-white ${focusRing}`}>
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

function ChipAdder({ label, onAdd }: { label: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState("");
  const commit = () => {
    const t = v.trim();
    if (t) onAdd(t);
    setV("");
  };
  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-dashed border-white/25 pr-3 pl-2.5 text-faro-text-2 focus-within:border-faro-accent">
      <Plus className="size-3.5" aria-hidden />
      <span className="sr-only">{`Añadir ${label}`}</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={`Añadir ${label}`}
        style={{ outline: "none" }}
        className="w-28 bg-transparent text-[14px] text-white outline-none placeholder:text-faro-text-3 focus-visible:outline-none"
      />
    </label>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[14px] font-semibold text-white">{title}</h3>
        {hint && <span className="text-[12px] text-faro-text-3">{hint}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function EditableChip({ value, onChange, label, suffix }: { value: string; onChange: (v: string) => void; label: string; suffix?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  const commit = () => {
    setEditing(false);
    const t = draft.trim();
    if (t && t !== value) onChange(t);
    else setDraft(value);
  };
  if (editing)
    return (
      <input
        ref={ref}
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        className="h-9 w-48 rounded-[10px] border border-faro-accent bg-faro-surface-2 px-3 text-[14px] text-white focus:outline-none"
      />
    );
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      aria-label={`${label}: ${value}. Editar`}
      className={`faro-step-in group inline-flex h-9 items-center gap-2 rounded-[10px] border border-faro-accent/40 bg-faro-surface-2 px-3 text-[14px] text-white transition-colors hover:border-faro-accent ${focusRing}`}
    >
      <span>
        {label}: <strong className="font-bold">{value}</strong>
        {suffix && <span className="ml-1 text-faro-text-3">({suffix})</span>}
      </span>
      <Pencil className="size-3 text-faro-text-3 transition-colors group-hover:text-faro-accent" aria-hidden />
    </button>
  );
}

function ThinkingSteps() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((x) => Math.min(STEPS.length, x + 1)), MIN_THINK_MS / STEPS.length);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" aria-live="polite" data-testid="thinking" className="space-y-3">
      <div className="h-[3px] overflow-hidden rounded-full bg-white/10">
        <div className="faro-beam h-full w-full rounded-full bg-faro-accent/30" />
      </div>
      <ul className="space-y-2">
        {STEPS.slice(0, n).map((s, i) => (
          <li key={s} className="faro-step-in flex items-center gap-2.5 text-[14px] text-faro-text-2">
            {i < n - 1 ? <Check className="size-4 text-faro-accent" aria-hidden /> : <span className="faro-live-dot ml-1 mr-1.5" aria-hidden />}
            {s}
            {i === n - 1 && "…"}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NewProfile() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [criteria, setCriteria] = useState<IcpCriteria | null>(null);
  const [aiMock, setAiMock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modes, setModes] = useState<Modes>({});
  const [submitted, setSubmitted] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const [offer, setOffer] = useState<OfferSelection>({ services: [], angles: [], refinements: [] });
  const [offerError, setOfferError] = useState<string | null>(null);
  const [autoEnrich, setAutoEnrich] = useState(true);
  const onOffer = useCallback((o: OfferSelection) => {
    setOffer(o);
    if (o.services.length) setOfferError(null);
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((h: { modes?: Modes }) => setModes(h.modes ?? {}))
      .catch(() => undefined);
  }, []);

  const structure = useCallback(async (text: string) => {
    const t = text.trim();
    if (t.length < 3) {
      setError("Cuéntanos un poco más: qué vendes y a quién.");
      return;
    }
    setError(null);
    setSubmitted(t);
    setPhase("parsing");
    try {
      const [res] = await Promise.all([fetch("/api/icp/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: t }) }), new Promise((r) => setTimeout(r, MIN_THINK_MS))]);
      const body = (await res.json().catch(() => ({}))) as { criteria?: IcpCriteria; is_mock?: boolean; error?: string };
      if (!res.ok || !body.criteria) throw new Error(body.error ?? `HTTP ${res.status}`);
      setCriteria(body.criteria);
      setAiMock(Boolean(body.is_mock));
      setPhase("ready");
    } catch (e) {
      setPhase("idle");
      setError(e instanceof Error ? `No pudimos estructurar tu perfil (${e.message}). Inténtalo de nuevo.` : "No pudimos estructurar tu perfil.");
    }
  }, []);

  useEffect(() => {
    if (phase === "ready") resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [phase]);

  const patch = (p: Partial<IcpCriteria>) => setCriteria((c) => (c ? { ...c, ...p } : c));
  const setSector = (sector: string) => {
    const m = findSector(sector);
    patch(m ? { sector: m.sector, ciiu: m.ciiu, osmTags: m.osmTags, placesTypes: m.placesTypes } : { sector });
  };
  const setCity = (city: string) => {
    const c = findCity(city);
    patch(c ? { city: c.city, country: c.country, bbox: c.bbox, language: c.language } : { city, bbox: undefined });
  };

  const estimates = useMemo(() => (criteria ? estimateSources(criteria) : []), [criteria]);
  const applicable = estimates.filter((e) => e.applicable);
  const totalEstimate = applicable.reduce((a, e) => a + (e.estimate ?? 0), 0);

  const offerCriteria = useMemo(
    () => (criteria && (phase === "ready" || phase === "launching") ? { sector: criteria.sector, city: criteria.city, signals: criteria.signals } : null),
    [criteria, phase],
  );

  const launch = async () => {
    if (!criteria) return;
    if (offer.services.length === 0) {
      setOfferError("Elige al menos un servicio: es lo que Faro le ofrecerá a cada empresa.");
      document.getElementById("oferta")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setError(null);
    setPhase("launching");
    try {
      const res = await fetch("/api/hunts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          prompt: submitted,
          criteria,
          offer: { serviceIds: offer.services.map((s) => s.id), services: offer.services, angles: offer.angles, refinements: offer.refinements },
          autoEnrich,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { huntId?: string; error?: string };
      if (!res.ok || !body.huntId) throw new Error(body.error ?? `HTTP ${res.status}`);
      router.push(`/app/hunts/${body.huntId}`);
    } catch (e) {
      setPhase("ready");
      setError(`No pudimos lanzar la búsqueda (${e instanceof Error ? e.message : "error"}). Revisa los datos y vuelve a intentarlo.`);
    }
  };

  const modeOf = (source: string): "real" | "mock" => ((source === "osm" ? modes.overpass : modes.socrata) === "real" ? "real" : "mock");
  const launching = phase === "launching";
  const canLaunch = phase === "ready" && !!criteria?.sector.trim() && !!criteria.city.trim() && applicable.length > 0;

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-black text-white">
      <div aria-hidden className="pointer-events-none absolute top-[-280px] left-1/2 h-[700px] w-[1100px] max-w-[200vw] -translate-x-1/2" style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(124,58,237,0.3) 0%, rgba(0,0,0,0) 70%)" }} />
      <div className="relative mx-auto flex w-full max-w-[880px] flex-col gap-7 px-4 pt-12 pb-44 sm:px-6 md:pt-[72px]">
        <section className="flex flex-col items-center gap-3.5 text-center">
          <h1 className="faro-rise max-w-[18ch] font-display text-[34px] leading-[1.06] font-bold text-balance md:text-[54px]" style={{ letterSpacing: "-0.035em" }}>
            ¿A quién le quieres <span className="text-faro-accent">vender</span>?
          </h1>
          <p className="faro-rise max-w-[560px] text-[16px] leading-relaxed text-white/65 md:text-[18px]" style={{ animationDelay: "70ms" }}>
            Descríbelo como se lo contarías a un colega. Faro lo convierte en un perfil y busca en fuentes públicas.
          </p>
        </section>

        <section className="faro-rise flex flex-col gap-4" style={{ animationDelay: "140ms" }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void structure(prompt);
            }}
            className="rounded-[20px] border border-faro-accent/40 bg-faro-surface-1 p-2 shadow-[0_0_0_6px_rgba(203,232,80,0.06)] transition-[border-color,box-shadow] focus-within:border-faro-accent focus-within:shadow-[0_0_0_6px_rgba(203,232,80,0.12)]"
          >
            <label htmlFor="prompt" className="sr-only">
              Describe a tu cliente ideal
            </label>
            <textarea
              id="prompt"
              data-testid="prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void structure(prompt);
                }
              }}
              rows={3}
              maxLength={2000}
              placeholder="Clínicas odontológicas en Bogotá con sitio web y correo de empresa…"
              className="block w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[18px] leading-normal text-white placeholder:text-faro-text-3 focus:outline-none md:px-5 md:pt-[18px] md:text-[20px]"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-1 pb-2 md:pr-3 md:pl-5">
              <p className="text-[13px] text-faro-text-3">
                Solo empresas · fuentes públicas · personas naturales excluidas
                <span className="ml-2 hidden items-center gap-1 align-middle lg:inline-flex">
                  · <kbd className="rounded-md border border-white/20 px-1.5 py-0.5 font-sans text-[11px]">Ctrl</kbd>+<CornerDownLeft className="size-3" aria-hidden />
                </span>
              </p>
              <button
                type="submit"
                data-testid="structure"
                disabled={prompt.trim().length < 3 || phase === "parsing" || launching}
                className="ml-auto inline-flex h-12 items-center gap-2 rounded-[10px] bg-faro-accent px-[22px] text-[15px] font-bold text-faro-accent-ink transition-[filter,transform] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-faro-surface-3 disabled:text-faro-text-3"
              >
                {phase === "idle" ? "Estructurar perfil" : "Volver a estructurar"} <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </form>

          {error && phase === "idle" && (
            <p role="alert" className="flex items-start gap-2 rounded-[10px] border border-[var(--faro-danger)]/40 bg-[var(--faro-danger)]/10 px-4 py-3 text-[13.5px]">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--faro-danger)]" aria-hidden /> {error}
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Ejemplos">
            {ICP_EXAMPLES.map((ex) => (
              <button
                key={ex.id}
                type="button"
                data-testid={`example-${ex.id}`}
                disabled={phase === "parsing" || launching}
                onClick={() => {
                  setPrompt(ex.prompt);
                  void structure(ex.prompt);
                }}
                className="inline-flex h-10 items-center rounded-full border border-white/[0.14] px-4 text-[14px] text-white/80 transition-colors hover:border-faro-accent hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent disabled:opacity-50"
              >
                {accentLabel(ex.label)}
              </button>
            ))}
          </div>
        </section>

        <OfferStep criteria={offerCriteria} error={offerError} onChange={onOffer} />

        {phase !== "idle" && (
          <section ref={resultRef} aria-label="Perfil estructurado" className="faro-rise flex scroll-mt-20 flex-col gap-5 rounded-[20px] border border-white/10 bg-faro-surface-1 p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <h2 className="font-display text-[20px] font-semibold">Tu perfil</h2>
              <span className="text-[13px] text-faro-text-3">{aiMock ? "Interpretado en modo demostración · editable" : "Estructurado por Claude · editable"}</span>
            </div>

            {phase === "parsing" && <ThinkingSteps />}

            {(phase === "ready" || phase === "launching") && criteria && (
              <>
                {aiMock && <p className="-mt-2 text-[12.5px] text-faro-text-3">Sin llave de Claude: sirve para los ejemplos y frases con sector y ciudad claros. Toca un chip para corregirlo.</p>}
                <div className="flex flex-wrap items-center gap-2 text-[14px]">
                  <EditableChip value={criteria.sector} onChange={setSector} label="Sector" />
                  <EditableChip value={criteria.city} onChange={setCity} label="Ciudad" suffix={criteria.country} />
                  {criteria.ciiu.map((c) => (
                    <span key={c} className="rounded-[10px] bg-faro-surface-2 px-3 py-2">
                      CIIU <strong className="font-bold">{c}</strong>
                    </span>
                  ))}
                  <span className="rounded-[10px] bg-faro-surface-2 px-3 py-2">
                    Umbral: <strong className="font-bold">{DEFAULT_THRESHOLD}/100</strong>
                  </span>
                </div>

                <Group title="Señales" hint="lo que buscamos en su sitio web">
                  {criteria.signals.map((s) => (
                    <Chip key={s} label={s} onRemove={() => patch({ signals: criteria.signals.filter((x) => x !== s) })}>
                      {s}
                    </Chip>
                  ))}
                  <ChipAdder label="señal" onAdd={(v) => !criteria.signals.includes(v) && patch({ signals: [...criteria.signals, v] })} />
                </Group>
                <Group title="Exclusiones" hint="nombres que descartamos">
                  {criteria.exclusions.map((s) => (
                    <Chip key={s} label={s} onRemove={() => patch({ exclusions: criteria.exclusions.filter((x) => x !== s) })}>
                      {s}
                    </Chip>
                  ))}
                  <ChipAdder label="exclusión" onAdd={(v) => !criteria.exclusions.includes(v) && patch({ exclusions: [...criteria.exclusions, v] })} />
                </Group>
                {criteria.osmTags.length > 0 && (
                  <p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[12.5px] leading-relaxed text-faro-text-3">
                    En el mapa lo buscamos como
                    {criteria.osmTags.map((t) => (
                      <code key={t} className="rounded-md bg-faro-surface-3/50 px-1.5 py-0.5 font-mono text-[11.5px] text-faro-text-2">
                        {t}
                      </code>
                    ))}
                  </p>
                )}

                <div className="border-t border-white/[0.08] pt-5">
                  <h3 className="text-[15px] font-semibold">Dónde vamos a buscar</h3>
                  <p className="mt-1 mb-3.5 text-[13px] text-faro-text-2">Fuentes públicas y gratuitas. Los números son estimados; verás los reales aparecer en el mapa.</p>
                  <ul className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2.5" data-testid="source-cards">
                    {estimates.map((e) => {
                      const mode = modeOf(e.source);
                      return (
                        <li key={e.source} className={cn("flex flex-col rounded-[12px] bg-faro-surface-2 p-4", !e.applicable && "opacity-60")}>
                          <p className="font-bold">{SOURCE_LABEL[e.source]}</p>
                          <p className="mt-1.5 text-[13px] text-faro-text-3">
                            {e.applicable && e.estimate != null ? (
                              <>
                                ≈ <span className="tabular-nums">{fmtInt(e.estimate)}</span> registros · gratis
                              </>
                            ) : e.applicable ? (
                              "Sin referencia medida · gratis"
                            ) : (
                              e.reason
                            )}
                          </p>
                          <p className="mt-1 text-[12px] leading-snug text-faro-text-3">{e.applicable ? SOURCE_BLURB[e.source] : ""}</p>
                          <p className={cn("mt-auto pt-2.5 text-[12px] font-medium", !e.applicable ? "text-faro-text-3" : mode === "real" ? "text-faro-accent" : "text-white/80")}>
                            <span aria-hidden>● </span>
                            {!e.applicable ? "No aplica" : mode === "real" ? "Real" : "Mock (datos de prueba)"}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            )}
          </section>
        )}
      </div>

      {(phase === "ready" || phase === "launching") && criteria && (
        <div className="faro-sheet-in fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.14] bg-black/90 backdrop-blur-sm" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto flex max-w-[880px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
            <div className="min-w-0 flex-1 basis-56">
              <p className="truncate text-[14.5px] font-medium">
                {applicable.length} {applicable.length === 1 ? "fuente" : "fuentes"} · {criteria.sector} en {criteria.city}
              </p>
              <p className="text-[12.5px] text-faro-text-3">{totalEstimate > 0 ? `~${fmtInt(totalEstimate)} registros por revisar, en lotes y en vivo` : "Se buscará en lotes y verás el avance en vivo"}</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-white/80" data-testid="auto-enrich">
              <input type="checkbox" checked={autoEnrich} onChange={(e) => setAutoEnrich(e.target.checked)} className="size-4 accent-[#cbe850]" />
              Al terminar, enriquecer sitios web con Apify
            </label>
            {error && (
              <p role="alert" className="basis-full text-[13px] text-[var(--faro-danger)]">
                {error}
              </p>
            )}
            <button
              type="button"
              data-testid="launch"
              onClick={launch}
              disabled={!canLaunch || launching}
              className="inline-flex h-12 items-center gap-2 rounded-[10px] bg-faro-accent px-6 text-[15px] font-bold text-faro-accent-ink transition-[filter,transform] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-faro-surface-3 disabled:text-faro-text-3"
            >
              {launching ? (
                <>
                  <span className="faro-live-dot !bg-faro-accent-ink" aria-hidden /> Creando la búsqueda…
                </>
              ) : (
                <>
                  Buscar clientes <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
