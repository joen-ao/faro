import type { ChallengeItem, ChallengeStatus } from "@/features/dashboard/challenge";
import { cn } from "@/lib/utils";

const STATUS: Record<ChallengeStatus, { label: string; glyph: string; badge: string }> = {
  done: { label: "Cumplido", glyph: "✓", badge: "bg-faro-accent text-faro-accent-ink text-[13px] font-bold" },
  progress: { label: "En curso", glyph: "◐", badge: "border-2 border-faro-warn text-faro-warn text-xs font-bold" },
  pending: { label: "Pendiente", glyph: "×", badge: "border-2 border-faro-text-3 text-faro-text-3 text-sm" },
};

const LINK_LABEL: Record<string, string> = { dashboard: "Ver CPL por canal", "public-data": "Ver panel de cumplimiento" };

function StatusBadge({ status, className }: { status: ChallengeStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <span aria-hidden className={cn("grid size-[22px] flex-none place-items-center rounded-full leading-none", s.badge, className)}>
      {s.glyph}
    </span>
  );
}

function Card({ item }: { item: ChallengeItem }) {
  const s = STATUS[item.status];
  const desired = item.group === "desired";
  return (
    <li
      data-testid={`challenge-${item.id}`}
      data-status={item.status}
      className={cn("flex gap-3 rounded-xl p-4", desired ? "border border-dashed border-white/20" : "bg-faro-surface-2")}
    >
      <StatusBadge status={item.status} className="mt-px" />
      <div className="min-w-0">
        <p className="font-medium leading-snug text-white">
          {desired && <span className="text-faro-text-2">Deseable · </span>}
          {item.title}
          <span className="sr-only"> ({s.label})</span>
        </p>
        <p className="mt-1 font-display text-xl font-semibold tabular-nums text-white">{item.value}</p>
        <p className="mt-0.5 text-pretty text-[13px] leading-relaxed text-faro-text-3">{item.detail}</p>
        {item.href && (
          <a href={item.href} className="mt-1 inline-block rounded-sm text-[13px] text-faro-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent">
            {LINK_LABEL[item.id] ?? "Ver detalle"}
          </a>
        )}
      </div>
    </li>
  );
}

function Counter({ done, total, label, accent }: { done: number; total: number; label: string; accent?: boolean }) {
  return (
    <span className="rounded-xl bg-faro-surface-2 px-4 py-2.5 text-center">
      <span aria-hidden className={cn("block font-display text-[26px] font-bold leading-tight tabular-nums", accent ? "text-faro-accent" : "text-white")}>
        {done}/{total}
      </span>
      <span aria-hidden className="block text-xs text-faro-text-3">
        {label}
      </span>
      <span className="sr-only">
        {done} de {total} {label}
      </span>
    </span>
  );
}

/** "Reto Dapta: cumplimiento en vivo": every brief requirement with its live, real-only number. */
export function ChallengePanel({ items }: { items: ChallengeItem[] }) {
  const required = items.filter((i) => i.group === "required");
  const desired = items.filter((i) => i.group === "desired");
  const done = (list: ChallengeItem[]) => list.filter((i) => i.status === "done").length;
  return (
    <section
      aria-labelledby="reto-dapta"
      data-testid="challenge-panel"
      className="rounded-[20px] border border-faro-accent/35 p-5 sm:p-7"
      style={{ background: "linear-gradient(90deg, rgba(203,232,80,0.08) 0%, rgba(0,0,0,0) 60%), var(--faro-surface-1)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="reto-dapta" className="font-display text-2xl font-bold leading-tight sm:text-[26px]">
            Reto Dapta: cumplimiento en vivo
          </h2>
          <p className="mt-1.5 text-sm text-faro-text-3">Cada requisito del brief con su número real. Los datos de prueba no cuentan.</p>
        </div>
        <p data-testid="challenge-summary" className="flex gap-2.5">
          <Counter done={done(required)} total={required.length} label="obligatorios" accent />
          <Counter done={done(desired)} total={desired.length} label="deseables" />
        </p>
      </div>
      <ul className="mt-5 grid gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]" aria-label="Requisitos">
        {[...required, ...desired].map((i) => (
          <Card key={i.id} item={i} />
        ))}
      </ul>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-faro-text-3" aria-label="Leyenda">
        {(Object.keys(STATUS) as ChallengeStatus[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <StatusBadge status={k} className="size-4 text-[10px]" />
            {STATUS[k].label}
          </li>
        ))}
      </ul>
    </section>
  );
}
