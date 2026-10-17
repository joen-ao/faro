"use client";

import { AlertTriangle, ArrowRight, Check, CornerDownLeft, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaroMark, FaroWordmark } from "@/components/faro-wordmark";
import { findCity, findSector, ICP_EXAMPLES } from "@/features/icp/presets";
import type { IcpCriteria } from "@/features/icp/schema";
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

function Chip({ children, onRemove, label }: { children: React.ReactNode; onRemove?: () => void; label: string }) {
  return (
    <span className="faro-step-in inline-flex h-8 items-center gap-1.5 rounded-full border border-white/[0.14] bg-faro-surface-2 pr-1.5 pl-3 text-[13.5px] text-white">
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Quitar ${label}`} className="grid size-5 place-items-center rounded-full text-faro-text-3 transition-colors hover:bg-white/15 hover:text-white">
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
    <label className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-white/25 pr-3 pl-2.5 text-faro-text-2 focus-within:border-faro-accent">
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
        className="w-28 bg-transparent text-[13px] text-white outline-none placeholder:text-faro-text-3 focus-visible:outline-none"
      />
    </label>
  );
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[13px] font-semibold text-white">{title}</h3>
        {hint && <span className="text-[12px] text-faro-text-3">{hint}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function EditableChip({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
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
        className="h-8 w-44 rounded-full border border-faro-accent bg-faro-surface-2 px-3 text-[13.5px] text-white focus:outline-none"
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
      className="faro-step-in group inline-flex h-8 items-center gap-2 rounded-full border border-faro-accent/60 bg-faro-surface-2 pr-3 pl-3.5 text-[13.5px] font-medium text-white transition-colors hover:border-faro-accent"
    >
      {value}
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

  const launch = async () => {
    if (!criteria) return;
    setError(null);
    setPhase("launching");
    try {
      const res = await fetch("/api/hunts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: submitted, criteria }) });
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
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[560px]" style={{ background: "var(--faro-glow-violet)" }} />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[860px] flex-col px-5 pb-40 md:px-8">
        <header className="flex items-center justify-between py-6">
          <FaroWordmark />
          <span className="text-[13px] text-faro-text-3">Nuevo perfil</span>
        </header>

        <section className="pt-6 pb-8 md:pt-14">
          <h1 className="faro-rise max-w-[16ch] text-[40px] leading-[1.04] font-semibold text-balance md:text-[60px]" style={{ letterSpacing: "-0.035em" }}>
            ¿A quién le quieres <span className="text-faro-accent">vender</span>?
          </h1>
          <p className="faro-rise mt-5 max-w-[52ch] text-[16px] leading-relaxed text-faro-text-2 md:text-[17px]" style={{ animationDelay: "70ms" }}>
            Cuéntalo como se lo contarías a un colega. Faro lo convierte en una búsqueda sobre fuentes públicas, con la evidencia de cada empresa.
          </p>
        </section>

        {phase === "idle" && (
          <section className="faro-rise" style={{ animationDelay: "140ms" }}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void structure(prompt);
              }}
              className="rounded-[16px] border border-white/[0.14] bg-faro-surface-1 transition-colors focus-within:border-faro-accent"
            >
              <label htmlFor="prompt" className="sr-only">
                Describe tu oferta y tu cliente ideal
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
                placeholder="Vendemos software de agendamiento y buscamos clínicas dentales en Bogotá con sitio web…"
                className="block w-full resize-none rounded-t-[16px] bg-transparent px-5 pt-5 pb-3 text-[18px] leading-relaxed text-white placeholder:text-faro-text-3 focus:outline-none md:text-[20px]"
              />
              <div className="flex items-center justify-between gap-3 px-3 pb-3 pl-5">
                <span className="hidden items-center gap-1.5 text-[12px] text-faro-text-3 sm:inline-flex">
                  <kbd className="rounded-md border border-white/20 px-1.5 py-0.5 font-sans text-[11px]">Ctrl</kbd>+<CornerDownLeft className="size-3" aria-hidden /> para estructurar
                </span>
                <button
                  type="submit"
                  data-testid="structure"
                  disabled={prompt.trim().length < 3}
                  className="ml-auto inline-flex h-11 items-center gap-2 rounded-[10px] bg-faro-accent px-5 text-[14.5px] font-semibold text-faro-accent-ink transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-faro-surface-3 disabled:text-faro-text-3"
                >
                  Estructurar perfil <ArrowRight className="size-4" aria-hidden />
                </button>
              </div>
            </form>

            {error && (
              <p role="alert" className="mt-3 flex items-start gap-2 rounded-[10px] border border-[var(--faro-danger)]/40 bg-[var(--faro-danger)]/10 px-4 py-3 text-[13.5px]">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--faro-danger)]" aria-hidden /> {error}
              </p>
            )}

            <div className="mt-7">
              <p className="mb-3 text-[13px] text-faro-text-3">O empieza con un ejemplo</p>
              <div className="flex flex-wrap gap-2.5">
                {ICP_EXAMPLES.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    data-testid={`example-${ex.id}`}
                    onClick={() => {
                      setPrompt(ex.prompt);
                      void structure(ex.prompt);
                    }}
                    className="group inline-flex h-11 items-center gap-2.5 rounded-full border border-white/[0.14] bg-faro-surface-1 px-4 text-[14px] text-white transition-colors hover:border-faro-accent hover:bg-faro-surface-2"
                  >
                    {ex.label}
                    <ArrowRight className="size-3.5 text-faro-text-3 transition-all group-hover:translate-x-0.5 group-hover:text-faro-accent" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {phase !== "idle" && (
          <section className="space-y-8" aria-label="Conversación">
            <div className="faro-rise flex items-start justify-end gap-3">
              <div className="max-w-[88%] rounded-[16px] rounded-tr-[6px] bg-faro-surface-2 px-5 py-3.5 text-[16px] leading-relaxed text-white">{submitted}</div>
              {phase === "ready" && (
                <button
                  type="button"
                  onClick={() => {
                    setPrompt(submitted);
                    setPhase("idle");
                  }}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1 text-[12.5px] text-faro-text-3 underline-offset-2 hover:text-white hover:underline"
                >
                  <Pencil className="size-3" aria-hidden /> Editar
                </button>
              )}
            </div>

            <div className="flex gap-4">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-white/[0.14] bg-faro-surface-1">
                <FaroMark className="size-5" />
              </span>
              <div className="min-w-0 flex-1" ref={resultRef}>
                {phase === "parsing" && <ThinkingSteps />}

                {(phase === "ready" || phase === "launching") && criteria && (
                  <div className="space-y-8">
                    <div className="faro-step-in">
                      <p className="text-[16px] leading-relaxed text-white/90">
                        Entendí esto. <span className="text-faro-text-2">Ajusta lo que quieras antes de lanzar: tocas un chip para editarlo.</span>
                      </p>
                      {aiMock && <p className="mt-1.5 text-[12px] text-faro-text-3">Interpretación hecha en modo demostración (sin llave de Claude): sirve para los ejemplos y frases con sector y ciudad claros.</p>}
                    </div>

                    <div className="space-y-5 rounded-[16px] border border-white/[0.08] bg-faro-surface-1 p-5">
                      <Group title="Sector">
                        <EditableChip value={criteria.sector} onChange={setSector} label="Sector" />
                      </Group>
                      <Group title="Ciudad">
                        <EditableChip value={criteria.city} onChange={setCity} label="Ciudad" />
                        <span className="text-[12.5px] text-faro-text-3">{criteria.country}</span>
                      </Group>
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
                      {(criteria.ciiu.length > 0 || criteria.osmTags.length > 0) && (
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-t border-white/[0.08] pt-4 text-[12.5px] leading-relaxed text-faro-text-3">
                          Lo buscaremos como{" "}
                          {[...criteria.ciiu.map((c) => `CIIU ${c}`), ...criteria.osmTags].map((t, i) => (
                            <code key={t} className="mr-1.5 rounded-md bg-faro-surface-3/50 px-1.5 py-0.5 font-mono text-[11.5px] text-faro-text-2">
                              {t}
                              {i < 0 && ","}
                            </code>
                          ))}
                        </p>
                      )}
                    </div>

                    <div className="faro-step-in">
                      <h2 className="mb-1 text-[18px] font-semibold">Dónde vamos a buscar</h2>
                      <p className="mb-4 text-[13.5px] text-faro-text-2">Fuentes públicas y gratuitas. Los números son estimados; verás los reales aparecer en el mapa.</p>
                      <ul className="grid gap-3 md:grid-cols-3" data-testid="source-cards">
                        {estimates.map((e) => {
                          const mode = modeOf(e.source);
                          return (
                            <li key={e.source} className={cn("flex flex-col rounded-[16px] border p-4", e.applicable ? "border-white/[0.14] bg-faro-surface-1" : "border-white/[0.06] bg-faro-surface-1/50 opacity-70")}>
                              <div className="flex items-center gap-2">
                                <span className="text-[14.5px] font-semibold">{SOURCE_LABEL[e.source]}</span>
                                <span
                                  className={cn(
                                    "ml-auto rounded-[5px] border px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase",
                                    !e.applicable ? "border-white/15 text-faro-text-3" : mode === "real" ? "border-faro-accent/50 text-faro-accent" : "border-dashed border-white/30 text-faro-text-2",
                                  )}
                                >
                                  {!e.applicable ? "No aplica" : mode === "real" ? "Real" : "Mock"}
                                </span>
                              </div>
                              <p className="mt-1.5 text-[12.5px] leading-snug text-faro-text-3">{e.applicable ? SOURCE_BLURB[e.source] : e.reason}</p>
                              <div className="mt-4 flex items-baseline gap-1.5">
                                {e.applicable && e.estimate != null ? (
                                  <>
                                    <span className="text-[30px] leading-none font-semibold tabular-nums" style={{ fontFamily: "var(--font-poppins)", letterSpacing: "-0.03em" }}>
                                      ~{fmtInt(e.estimate)}
                                    </span>
                                    <span className="text-[12px] text-faro-text-3">registros</span>
                                  </>
                                ) : (
                                  <span className="text-[14px] text-faro-text-3">{e.applicable ? "Sin referencia medida" : "—"}</span>
                                )}
                              </div>
                              {e.applicable && e.estimate != null && <p className="mt-1 text-[11px] text-faro-text-3">Estimado · {e.basis}</p>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {(phase === "ready" || phase === "launching") && criteria && (
        <div className="faro-sheet-in fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.14] bg-black/90 backdrop-blur-sm" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <div className="mx-auto flex max-w-[860px] flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 md:px-8">
            <div className="min-w-0 flex-1 basis-56">
              <p className="truncate text-[14.5px] font-medium">
                {applicable.length} {applicable.length === 1 ? "fuente" : "fuentes"} · {criteria.sector} en {criteria.city}
              </p>
              <p className="text-[12.5px] text-faro-text-3">{totalEstimate > 0 ? `~${fmtInt(totalEstimate)} registros por revisar, en lotes y en vivo` : "Se buscará en lotes y verás el avance en vivo"}</p>
            </div>
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
              className="inline-flex h-12 items-center gap-2 rounded-[10px] bg-faro-accent px-6 text-[15px] font-semibold text-faro-accent-ink transition-[filter,transform] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-faro-surface-3 disabled:text-faro-text-3"
            >
              {launching ? (
                <>
                  <span className="faro-live-dot !bg-faro-accent-ink" aria-hidden /> Creando la búsqueda…
                </>
              ) : (
                <>
                  Lanzar búsqueda <ArrowRight className="size-4" aria-hidden />
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
