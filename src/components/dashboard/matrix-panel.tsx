"use client";

import { useState } from "react";
import { LeadReceipt } from "@/components/lead-receipt";
import type { CellLead } from "@/features/dashboard/data";
import { contactLabel, fmtPct, fmtUsd, INSUFFICIENT, sourceLabel } from "@/features/dashboard/format";
import type { MetricsBucket, MetricsRow } from "@/features/metrics/channels";
import { cn } from "@/lib/utils";

type Metric = "cpl" | "rate" | "cplc";
const METRICS: { id: Metric; label: string }[] = [
  { id: "cpl", label: "CPL" },
  { id: "rate", label: "% calificado" },
  { id: "cplc", label: "CPLC" },
];
const CONTACTS = ["email", "web_form", "whatsapp", "dapta_widget"] as const;

/** Five discrete lime steps. Text flips to dark ink only on the brightest step (AA on both sides). */
const STEPS = [
  { bg: "rgba(203,232,80,0.10)", fg: "#fff" },
  { bg: "rgba(203,232,80,0.22)", fg: "#fff" },
  { bg: "rgba(203,232,80,0.34)", fg: "#fff" },
  { bg: "rgba(203,232,80,0.46)", fg: "#fff" },
  { bg: "rgba(203,232,80,0.88)", fg: "#1a1a1c" },
];

function value(r: MetricsRow, m: Metric): number | null {
  if (m === "cpl") return r.cpl;
  if (m === "cplc") return r.cplc;
  return r.fit > 0 ? r.qualified / r.fit : null;
}

interface Sel {
  source: string;
  contact: string | null;
}
type Detail = { state: "loading" } | { state: "error" } | { state: "ok"; total: number; leads: CellLead[] };

export function MatrixPanel({ bucket, demo }: { bucket: MetricsBucket; demo: boolean }) {
  const [metric, setMetric] = useState<Metric>("cplc");
  const [sel, setSel] = useState<Sel | null>(null);
  const [detail, setDetail] = useState<Detail>({ state: "loading" });
  const [open, setOpen] = useState<string | null>(null);

  const sources = bucket.bySource.map((r) => r.source as string);
  const cell = (src: string, ch: string) => bucket.cells.find((c) => c.source === src && c.contact === ch);
  const vals = bucket.cells.map((c) => value(c, metric)).filter((v): v is number => v !== null);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const step = (v: number) => (hi === lo ? 2 : Math.min(4, Math.floor(((v - lo) / (hi - lo)) * 5)));

  async function pick(s: Sel) {
    setSel(s);
    setOpen(null);
    setDetail({ state: "loading" });
    try {
      const qs = new URLSearchParams({ source: s.source, demo: demo ? "1" : "0" });
      if (s.contact) qs.set("contact", s.contact);
      const res = await fetch(`/api/dashboard/cell?${qs}`);
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { total: number; leads: CellLead[] };
      setDetail({ state: "ok", ...j });
    } catch {
      setDetail({ state: "error" });
    }
  }

  const opened = detail.state === "ok" ? detail.leads.find((l) => l.leadId === open) : undefined;

  return (
    <div>
      <div role="group" aria-label="Métrica de la matriz" className="mb-4 inline-flex rounded-button border border-border p-0.5">
        {METRICS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={metric === m.id}
            onClick={() => setMetric(m.id)}
            className={cn(
              "min-h-9 rounded-[8px] px-3.5 text-sm font-medium transition-colors",
              metric === m.id ? "bg-faro-accent text-[#1a1a1c]" : "text-faro-text-2 hover:text-white",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto" tabIndex={0} aria-label="Matriz fuente por canal de contacto">
        <table className="w-full min-w-[560px] border-separate border-spacing-1.5 text-sm">
          <thead>
            <tr>
              <th className="w-36 text-left text-xs font-normal text-faro-text-3">Fuente ↓ · Canal →</th>
              {CONTACTS.map((c) => (
                <th key={c} scope="col" className="px-1 pb-1 text-center text-xs font-medium text-faro-text-2">
                  {contactLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map((src) => (
              <tr key={src}>
                <th scope="row" className="text-left">
                  <button
                    type="button"
                    onClick={() => pick({ source: src, contact: null })}
                    className="rounded-md py-2 text-left text-sm font-medium hover:text-faro-accent"
                    title="Ver todos los leads de esta fuente"
                  >
                    {sourceLabel(src)}
                  </button>
                </th>
                {CONTACTS.map((ch) => {
                  const c = cell(src, ch);
                  const v = c ? value(c, metric) : null;
                  const active = sel?.source === src && sel.contact === ch;
                  if (!c) return <td key={ch} className="h-14 rounded-button border border-dashed border-border text-center text-faro-text-3" aria-label="Sin leads">·</td>;
                  const st = v === null ? null : STEPS[step(v)];
                  const text = v === null ? "n/d" : metric === "rate" ? fmtPct(v) : fmtUsd(v);
                  return (
                    <td key={ch} className="p-0">
                      <button
                        type="button"
                        onClick={() => pick({ source: src, contact: ch })}
                        aria-label={`${sourceLabel(src)} por ${contactLabel(ch)}: ${v === null ? INSUFFICIENT : text}. ${c.fit} leads del perfil. Abrir detalle`}
                        className={cn(
                          "flex h-14 w-full flex-col items-center justify-center rounded-button border transition-transform hover:-translate-y-px",
                          active ? "border-faro-accent" : "border-transparent",
                          !st && "bg-faro-surface-2 text-faro-text-2",
                        )}
                        style={st ? { background: st.bg, color: st.fg } : undefined}
                      >
                        <span className="font-semibold tabular-nums">{text}</span>
                        <span className="text-[11px] opacity-80">{c.fit} del perfil</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center gap-2 text-xs text-faro-text-3" aria-hidden>
        <span>menor</span>
        {STEPS.map((s, i) => (
          <span key={i} className="h-3 w-7 rounded-sm" style={{ background: s.bg }} />
        ))}
        <span>mayor</span>
        <span className="ml-2">· n/d = datos insuficientes</span>
      </div>

      {sel && (
        <section aria-label="Detalle de la celda" className="mt-6 rounded-card border border-faro-accent/40 bg-faro-surface-2 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <h4 className="font-display text-base font-semibold">
              {sourceLabel(sel.source)} · {sel.contact ? contactLabel(sel.contact) : "todos los canales"}
              {demo && <span className="ml-2 rounded border border-destructive px-1.5 py-0.5 align-middle text-[10px] font-bold tracking-widest text-destructive">DEMO</span>}
            </h4>
            <button type="button" onClick={() => setSel(null)} className="min-h-9 rounded-button px-2 text-sm text-faro-text-2 hover:text-white">
              Cerrar
            </button>
          </div>
          {detail.state === "loading" && <p className="mt-3 animate-pulse text-sm text-faro-text-2">Cargando leads…</p>}
          {detail.state === "error" && <p role="alert" className="mt-3 text-sm text-destructive">No se pudo cargar el detalle. Reintenta en un momento.</p>}
          {detail.state === "ok" && (
            <>
              <p className="mt-1 text-xs text-faro-text-3">
                {detail.total} leads{detail.total > detail.leads.length ? ` (primeros ${detail.leads.length})` : ""} · abre uno para ver su recibo y sus registros de costo
              </p>
              <ul className="mt-3 divide-y divide-border">
                {detail.leads.map((l) => (
                  <li key={l.leadId}>
                    <button
                      type="button"
                      aria-expanded={open === l.leadId}
                      onClick={() => setOpen(open === l.leadId ? null : l.leadId)}
                      className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-sm hover:text-faro-accent"
                    >
                      <span className="min-w-0 truncate">{l.name}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-faro-text-2">
                        {l.qualified && <span className="rounded-full bg-faro-accent px-2 py-0.5 font-semibold text-[#1a1a1c]">calificado</span>}
                        {!l.fit && <span>fuera del perfil</span>}
                        <span className="tabular-nums text-white">{fmtUsd(l.costUsd)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {opened?.receipt && (
                <div className="mt-5">
                  <LeadReceipt receipt={opened.receipt} />
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
