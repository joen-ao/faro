"use client";

import { useMemo, useState } from "react";
import type { BreakdownDim, BreakdownRow } from "@/features/dashboard/prospecting";
import { fmtInt, fmtPct, fmtUsd } from "@/features/dashboard/format";
import { cn } from "@/lib/utils";

/* F43 · Which segment to scale: the contacted cohort split by one dimension, sortable by any column. */

const TABS: { v: BreakdownDim; label: string }[] = [
  { v: "segment", label: "Segmento" },
  { v: "source", label: "Fuente" },
  { v: "hunt", label: "Búsqueda" },
  { v: "city", label: "Ciudad" },
];

type Col = { key: keyof BreakdownRow; label: string; fmt: (r: BreakdownRow) => string; num: true } | { key: "label"; label: string; num: false };
const COLS: Col[] = [
  { key: "label", label: "", num: false },
  { key: "contacted", label: "Contactados", fmt: (r) => fmtInt(r.contacted), num: true },
  { key: "deliveryRate", label: "Entrega", fmt: (r) => fmtPct(r.deliveryRate), num: true },
  { key: "openRate", label: "Abrieron", fmt: (r) => fmtPct(r.openRate), num: true },
  { key: "replyRate", label: "Respondieron", fmt: (r) => fmtPct(r.replyRate), num: true },
  { key: "meetings", label: "Reuniones", fmt: (r) => fmtInt(r.meetings), num: true },
  { key: "qualified", label: "Calificados", fmt: (r) => fmtInt(r.qualified), num: true },
  { key: "costUsd", label: "Costo", fmt: (r) => fmtUsd(r.costUsd), num: true },
];

export function BreakdownTable({ data }: { data: Record<BreakdownDim, BreakdownRow[]> }) {
  const [dim, setDim] = useState<BreakdownDim>("segment");
  const [sort, setSort] = useState<{ key: keyof BreakdownRow; desc: boolean }>({ key: "contacted", desc: true });
  const rows = useMemo(() => {
    const list = [...data[dim]];
    list.sort((a, b) => {
      const x = a[sort.key];
      const y = b[sort.key];
      const d = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "es") : ((x as number | null) ?? -1) - ((y as number | null) ?? -1);
      return sort.desc ? -d : d;
    });
    return list;
  }, [data, dim, sort]);
  const label = TABS.find((t) => t.v === dim)!.label;

  return (
    <section aria-labelledby="bd-h" className="rounded-card border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="bd-h" className="font-display text-xl font-semibold">
            Desglose
          </h2>
          <p className="mt-1 text-sm text-faro-text-2">El mismo grupo del embudo, partido para ver qué conviene escalar.</p>
        </div>
        <div role="tablist" aria-label="Dimensión" className="inline-flex rounded-button border border-border bg-faro-surface-1 p-1">
          {TABS.map((t) => (
            <button
              key={t.v}
              role="tab"
              type="button"
              aria-selected={dim === t.v}
              onClick={() => setDim(t.v)}
              className={cn("inline-flex min-h-8 items-center rounded-[7px] px-3 text-sm transition-colors", dim === t.v ? "bg-white/[0.1] font-semibold text-white" : "text-faro-text-2 hover:text-white")}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-5 text-sm text-faro-text-3">Sin contactados con estos filtros.</p>
      ) : (
        <div className="mt-4 overflow-x-auto" role="tabpanel">
          <table className="w-full min-w-[720px] text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border text-left text-xs text-faro-text-3">
                {COLS.map((c) => {
                  const on = sort.key === c.key;
                  return (
                    <th key={c.key} scope="col" aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"} className={cn("py-2 font-medium", c.num && "text-right")}>
                      <button
                        type="button"
                        onClick={() => setSort({ key: c.key, desc: on ? !sort.desc : c.num })}
                        className={cn("inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-white", on && "text-white")}
                      >
                        {c.key === "label" ? label : c.label}
                        <span aria-hidden className={cn("text-[10px]", !on && "opacity-0")}>
                          {sort.desc ? "▼" : "▲"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {rows.map((r) => (
                <tr key={r.key} className={cn(r.lowSample && "text-faro-text-2")}>
                  <th scope="row" className="max-w-[16rem] py-2.5 pr-3 text-left font-medium text-white">
                    <span className="block truncate">{r.label}</span>
                    {r.lowSample && <span className="text-[11px] font-normal text-[var(--faro-warn)]">pocos datos</span>}
                  </th>
                  {COLS.slice(1).map((c) => (
                    <td key={c.key} className="py-2.5 text-right">
                      {c.num ? c.fmt(r) : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
