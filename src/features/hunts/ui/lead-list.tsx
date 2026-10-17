"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { MapPinOff } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { hasLocation } from "../geojson";
import type { StreamPoint } from "../types";
import { SOURCE_SHORT, STATUS_COLOR, STATUS_LABEL } from "./format";

export const ROW_H = 58;

export function StatusDot({ status, className }: { status: StreamPoint["status"]; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("relative inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{
        background: STATUS_COLOR[status],
        boxShadow: status === "contacted" ? "0 0 0 3px rgba(255,255,255,0.18)" : status === "qualified" ? "0 0 0 3px rgba(203,232,80,0.28)" : undefined,
        opacity: status === "found" ? 0.75 : 1,
      }}
    />
  );
}

/** Windowed list: only ~15 rows exist in the DOM however many leads there are. */
export function LeadList({ rows, selectedId, onSelect, scrollKey }: { rows: readonly StreamPoint[]; selectedId: string | null; onSelect: (p: StreamPoint) => void; scrollKey: string }) {
  const parent = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => ROW_H, overscan: 8, getItemKey: (i) => rows[i]?.id ?? i });

  return (
    <div ref={parent} key={scrollKey} className="faro-scroll min-h-0 flex-1 overflow-y-auto" data-testid="lead-list" role="list" aria-label={`Empresas encontradas, ${rows.length}`}>
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((item) => {
          const p = rows[item.index];
          const active = p.id === selectedId;
          return (
            <div key={item.key} role="listitem" className="absolute inset-x-0 top-0 px-2" style={{ height: item.size, transform: `translateY(${item.start}px)` }}>
              <button
                type="button"
                onClick={() => onSelect(p)}
                aria-current={active ? "true" : undefined}
                aria-label={`${p.name}, ${STATUS_LABEL[p.status]}${p.score != null ? `, encaje ${p.score} de 100` : ""}`}
                className={cn(
                  "group flex h-[52px] w-full items-center gap-3 rounded-[10px] border px-3 text-left transition-colors",
                  active ? "border-faro-accent bg-faro-surface-2" : "border-transparent hover:bg-faro-surface-2",
                )}
              >
                <StatusDot status={p.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-white">{p.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-faro-text-3">
                    <span className="rounded-[5px] bg-faro-surface-3/60 px-1.5 py-px font-medium text-faro-text-2">{SOURCE_SHORT[p.source] ?? p.source}</span>
                    <span>{STATUS_LABEL[p.status]}</span>
                    {!hasLocation(p) && (
                      <span className="inline-flex items-center gap-1" title="Esta fuente no publica coordenadas">
                        <MapPinOff className="size-3" aria-hidden /> sin ubicación
                      </span>
                    )}
                  </span>
                </span>
                {p.score != null && (
                  <span className={cn("w-8 shrink-0 text-right text-[15px] font-semibold tabular-nums", p.status === "found" ? "text-faro-text-3" : "text-faro-accent")} style={{ fontFamily: "var(--font-poppins)" }}>
                    {p.score}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
