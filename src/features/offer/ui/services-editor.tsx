"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { SERVICE_LIMITS, type Service } from "../schema";

/** Editable draft of one service (keywords as a comma-separated string). */
interface Draft {
  key: string;
  id?: string;
  name: string;
  description: string;
  outcome: string;
  entryOffer: string;
  price: string;
  proof: string;
  keywords: string;
}

const toDraft = (s: Service, i: number): Draft => ({
  key: `${s.id}-${i}`,
  id: s.id,
  name: s.name,
  description: s.description,
  outcome: s.outcome,
  entryOffer: s.entryOffer ?? "",
  price: s.price ?? "",
  proof: s.proof ?? "",
  keywords: (s.keywords ?? []).join(", "),
});
const emptyDraft = (): Draft => ({ key: `new-${Math.random().toString(36).slice(2, 8)}`, name: "", description: "", outcome: "", entryOffer: "", price: "", proof: "", keywords: "" });

const field =
  "w-full rounded-[12px] border border-white/14 bg-faro-surface-2 px-3.5 py-2.5 text-[15px] leading-normal text-white placeholder:text-faro-text-3 focus:border-faro-accent focus:outline-none";
const lbl = "mb-1.5 block text-[13px] text-white/75";
const btnGhost =
  "inline-flex h-10 items-center gap-2 rounded-[10px] border border-white/16 px-3.5 text-[14px] text-white/85 transition-colors hover:border-white/40 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent disabled:opacity-50";
const btnPrimary =
  "inline-flex h-11 items-center gap-2 rounded-[10px] bg-faro-accent px-5 text-[15px] font-bold text-faro-accent-ink transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent disabled:cursor-not-allowed disabled:bg-faro-surface-3 disabled:text-faro-text-3";

type Errors = Record<string, Partial<Record<"name" | "description" | "outcome", string>>>;

function validate(drafts: Draft[]): Errors {
  const errors: Errors = {};
  for (const d of drafts) {
    const e: Errors[string] = {};
    if (d.name.trim().length < 2) e.name = "Escribe el nombre del servicio";
    if (d.description.trim().length < 2) e.description = "Escribe la propuesta de valor";
    if (d.outcome.trim().length < 2) e.outcome = "Escribe el resultado para el cliente";
    if (Object.keys(e).length) errors[d.key] = e;
  }
  return errors;
}

const toPayload = (d: Draft) => ({
  ...(d.id ? { id: d.id } : {}),
  name: d.name,
  description: d.description,
  outcome: d.outcome,
  entryOffer: d.entryOffer || undefined,
  price: d.price || undefined,
  proof: d.proof || undefined,
  keywords: d.keywords
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean),
});

export interface ServicesEditorProps {
  initial: Service[];
  note?: string;
  /** Company that provides the services and signs the emails. */
  company?: string;
  origin: "panel" | "default" | "empty";
  /** Label of the initial catalog's source, e.g. "mokub.co". */
  defaultSource?: string;
  onSaved?: (services: Service[]) => void;
  /** Starts with the "Sugerir con Claude" box open (empty catalog). */
  suggestOpen?: boolean;
}

export function ServicesEditor({ initial, note: initialNote, company: initialCompany, origin, defaultSource, onSaved, suggestOpen }: ServicesEditorProps) {
  const [drafts, setDrafts] = useState<Draft[]>(() => (initial.length ? initial.map(toDraft) : [emptyDraft()]));
  const [note, setNote] = useState(initialNote ?? "");
  const [company, setCompany] = useState(initialCompany ?? "");
  const [about, setAbout] = useState("");
  const [showSuggest, setShowSuggest] = useState(!!suggestOpen);
  const [busy, setBusy] = useState<"suggest" | "save" | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [state, setState] = useState(origin);

  const patch = (key: string, p: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)));

  async function suggest() {
    setBusy("suggest");
    setMsg(null);
    try {
      const res = await fetch("/api/settings/services/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: about }) });
      const json = (await res.json().catch(() => ({}))) as { services?: Service[]; is_mock?: boolean; error?: string; issues?: { message: string }[] };
      if (!res.ok || !json.services) throw new Error(json.issues?.[0]?.message ?? json.error ?? `HTTP ${res.status}`);
      setDrafts(json.services.map(toDraft));
      setErrors({});
      setMsg({ kind: "info", text: `${json.is_mock ? "Propuesta de demostración (sin llave de Claude)" : "Propuesta de Claude"}: revisa y edita cada servicio antes de guardar.` });
    } catch (e) {
      setMsg({ kind: "error", text: `No pudimos sugerir servicios (${(e as Error).message}).` });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const errs = validate(drafts);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setMsg({ kind: "error", text: "Completa los campos marcados." });
      return;
    }
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch("/api/settings/services", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ services: drafts.map(toPayload), note: note || undefined, company: company || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; services?: Service[]; issues?: string[]; error?: string };
      if (!res.ok || !json.ok || !json.services) throw new Error(json.issues?.join(" · ") ?? json.error ?? `HTTP ${res.status}`);
      setDrafts(json.services.map(toDraft));
      setState("panel");
      setMsg({ kind: "ok", text: "Servicios guardados. Faro ya los usa en correos, diagnósticos y Dapta." });
      onSaved?.(json.services);
    } catch (e) {
      setMsg({ kind: "error", text: `No se pudo guardar: ${(e as Error).message}` });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div data-testid="services-editor" className="flex flex-col gap-5">
      {state === "default" && (
        <p data-testid="default-catalog" className="rounded-[12px] border border-faro-accent/30 bg-faro-accent/8 px-4 py-3 text-[13.5px] text-white/85">
          Catálogo inicial (de {defaultSource ?? "la configuración"}). Edítalo y guárdalo para que sea tuyo.
        </p>
      )}

      <div className="rounded-[14px] border border-white/10 bg-faro-surface-2/60 p-4">
        {!showSuggest ? (
          <button type="button" onClick={() => setShowSuggest(true)} className={btnGhost} data-testid="open-suggest">
            <Sparkles className="size-4 text-faro-accent" aria-hidden /> Sugerir con Claude
          </button>
        ) : (
          <div className="flex flex-col gap-3">
            <label htmlFor="about" className={lbl}>
              Cuéntale a Claude qué hace tu negocio y te propone el catálogo
            </label>
            <textarea
              id="about"
              data-testid="suggest-input"
              rows={3}
              maxLength={1500}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder="Somos una agencia que hace agentes de WhatsApp con IA y sitios web para clínicas…"
              className={`${field} resize-none`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" data-testid="suggest-services" onClick={suggest} disabled={busy !== null || about.trim().length < 10} className={btnGhost}>
                <Sparkles className="size-4 text-faro-accent" aria-hidden /> {busy === "suggest" ? "Pensando…" : "Sugerir con Claude"}
              </button>
              <span className="text-[12.5px] text-faro-text-3">Reemplaza la lista de abajo; nada se guarda hasta que pulses Guardar.</span>
            </div>
          </div>
        )}
      </div>

      <ol className="flex flex-col gap-4">
        {drafts.map((d, i) => {
          const e = errors[d.key] ?? {};
          const id = (f: string) => `${d.key}-${f}`;
          return (
            <li key={d.key} data-testid="service-card" className="rounded-[16px] border border-white/12 bg-faro-surface-1 p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[12px] uppercase tracking-[0.16em] text-faro-text-3">Servicio {i + 1}</p>
                {drafts.length > 1 && (
                  <button type="button" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))} aria-label={`Quitar servicio ${i + 1}`} className="grid size-9 place-items-center rounded-[8px] text-faro-text-3 hover:bg-white/10 hover:text-white">
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>
              <div className="grid gap-3.5 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label htmlFor={id("name")} className={lbl}>Nombre</label>
                  <input id={id("name")} data-testid="service-name" value={d.name} maxLength={SERVICE_LIMITS.name} onChange={(ev) => patch(d.key, { name: ev.target.value })} aria-invalid={!!e.name} className={field} />
                  {e.name && <p role="alert" className="mt-1 text-[12.5px] text-[var(--faro-danger)]">{e.name}</p>}
                </div>
                <div>
                  <label htmlFor={id("desc")} className={lbl}>Propuesta de valor</label>
                  <textarea id={id("desc")} data-testid="service-description" rows={3} value={d.description} maxLength={SERVICE_LIMITS.description} onChange={(ev) => patch(d.key, { description: ev.target.value })} aria-invalid={!!e.description} className={`${field} resize-none`} />
                  {e.description && <p role="alert" className="mt-1 text-[12.5px] text-[var(--faro-danger)]">{e.description}</p>}
                </div>
                <div>
                  <label htmlFor={id("outcome")} className={lbl}>Resultado para el cliente</label>
                  <textarea id={id("outcome")} data-testid="service-outcome" rows={3} value={d.outcome} maxLength={SERVICE_LIMITS.outcome} onChange={(ev) => patch(d.key, { outcome: ev.target.value })} aria-invalid={!!e.outcome} className={`${field} resize-none`} />
                  {e.outcome && <p role="alert" className="mt-1 text-[12.5px] text-[var(--faro-danger)]">{e.outcome}</p>}
                </div>
                <div>
                  <label htmlFor={id("entry")} className={lbl}>
                    Oferta de entrada <span className="text-faro-text-3">(opcional)</span>
                  </label>
                  <input id={id("entry")} value={d.entryOffer} maxLength={SERVICE_LIMITS.entryOffer} onChange={(ev) => patch(d.key, { entryOffer: ev.target.value })} placeholder="Ej.: Demo gratis de 15 minutos" className={field} />
                </div>
                <div>
                  <label htmlFor={id("price")} className={lbl}>
                    Precio de referencia <span className="text-faro-text-3">(opcional)</span>
                  </label>
                  <input id={id("price")} value={d.price} maxLength={SERVICE_LIMITS.price} onChange={(ev) => patch(d.key, { price: ev.target.value })} placeholder="Ej.: Desde USD 450" className={field} />
                </div>
                <div>
                  <label htmlFor={id("proof")} className={lbl}>
                    Prueba o caso <span className="text-faro-text-3">(opcional, sin nombres de personas)</span>
                  </label>
                  <input id={id("proof")} value={d.proof} maxLength={SERVICE_LIMITS.proof} onChange={(ev) => patch(d.key, { proof: ev.target.value })} placeholder="Ej.: [Cliente] pasó de [X] a [Y]" className={field} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={id("kw")} className={lbl}>
                    Palabras clave <span className="text-faro-text-3">(separadas por coma; conectan el servicio con los hallazgos)</span>
                  </label>
                  <input id={id("kw")} value={d.keywords} onChange={(ev) => patch(d.key, { keywords: ev.target.value })} placeholder="whatsapp, agenda, sin sitio web" className={field} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setDrafts((ds) => [...ds, emptyDraft()])} disabled={drafts.length >= SERVICE_LIMITS.max} className={btnGhost}>
          <Plus className="size-4" aria-hidden /> Agregar servicio
        </button>
        <span className="text-[12.5px] text-faro-text-3">
          {drafts.length} de {SERVICE_LIMITS.max}
        </span>
      </div>

      <div>
        <label htmlFor="catalog-company" className={lbl}>
          Tu empresa <span className="text-faro-text-3">(firma los correos; Faro es la herramienta de envío)</span>
        </label>
        <input id="catalog-company" value={company} maxLength={SERVICE_LIMITS.company} onChange={(e) => setCompany(e.target.value)} placeholder="Ej.: Mokub" className={field} />
      </div>

      <div>
        <label htmlFor="catalog-note" className={lbl}>
          Nota del catálogo <span className="text-faro-text-3">(opcional)</span>
        </label>
        <input id="catalog-note" value={note} maxLength={SERVICE_LIMITS.note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: Mantenimiento mensual disponible" className={field} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" data-testid="save-services" onClick={save} disabled={busy !== null} className={btnPrimary}>
          {busy === "save" ? "Guardando…" : "Guardar servicios"}
        </button>
        {msg && (
          <p role="status" className={`text-[13.5px] ${msg.kind === "ok" ? "text-faro-accent" : msg.kind === "error" ? "text-[var(--faro-danger)]" : "text-white/80"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
