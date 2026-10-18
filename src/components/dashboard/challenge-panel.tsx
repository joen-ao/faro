import { CircleCheck, CircleX, Contrast } from "lucide-react";
import type { ChallengeItem, ChallengeStatus } from "@/features/dashboard/challenge";
import { cn } from "@/lib/utils";

const STATUS: Record<ChallengeStatus, { label: string; Icon: typeof CircleCheck; tone: string }> = {
  done: { label: "Cumplido", Icon: CircleCheck, tone: "text-faro-accent" },
  progress: { label: "En curso", Icon: Contrast, tone: "text-faro-warn" },
  pending: { label: "Pendiente", Icon: CircleX, tone: "text-faro-text-2" },
};

function Row({ item }: { item: ChallengeItem }) {
  const s = STATUS[item.status];
  return (
    <li data-testid={`challenge-${item.id}`} data-status={item.status} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 py-4 sm:grid-cols-[auto_minmax(0,1.1fr)_minmax(0,1fr)] sm:gap-x-5">
      <span className={cn("row-span-2 mt-0.5 flex items-start sm:row-span-1", s.tone)}>
        <s.Icon aria-hidden className="size-5" strokeWidth={2.25} />
        <span className="sr-only">{s.label}</span>
      </span>
      <p className="text-pretty text-sm leading-snug text-white sm:text-[15px]">
        {item.requirement}
        <span className={cn("ml-2 whitespace-nowrap text-xs font-semibold", s.tone)} aria-hidden>
          {s.label}
        </span>
      </p>
      <div className="min-w-0 sm:text-right">
        <p className="font-display text-base font-semibold tabular-nums text-white">
          {item.href ? (
            <a href={item.href} className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
              {item.value}
            </a>
          ) : (
            item.value
          )}
        </p>
        <p className="text-pretty text-xs leading-relaxed text-faro-text-2">{item.detail}</p>
      </div>
    </li>
  );
}

/** "Reto Dapta: cumplimiento en vivo": every brief requirement with its live, real-only number. */
export function ChallengePanel({ items }: { items: ChallengeItem[] }) {
  const required = items.filter((i) => i.group === "required");
  const desired = items.filter((i) => i.group === "desired");
  const count = (list: ChallengeItem[], st: ChallengeStatus) => list.filter((i) => i.status === st).length;
  const doneReq = count(required, "done");
  return (
    <section aria-labelledby="reto-dapta" data-testid="challenge-panel" className="rounded-card border border-faro-accent/40 bg-faro-surface-1 p-5 sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="reto-dapta" className="font-display text-2xl font-bold leading-tight sm:text-3xl">Reto Dapta: cumplimiento en vivo</h2>
          <p className="mt-1 max-w-xl text-sm text-faro-text-2">Cada requisito del brief con su número real de la base de datos. Los datos de prueba no cuentan.</p>
        </div>
        <p data-testid="challenge-summary" className="flex flex-wrap items-baseline gap-x-3 text-sm text-faro-text-2">
          <span>
            <span className="font-display text-3xl font-bold tabular-nums text-white">{doneReq}</span>
            <span className="text-faro-text-2"> de {required.length} obligatorios</span>
          </span>
          <span className="text-faro-text-3">·</span>
          <span>
            <span className="font-semibold text-white">{count(desired, "done")}</span> de {desired.length} deseables
          </span>
        </p>
      </div>
      <div className="mt-6 grid gap-x-10 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div>
          <h3 className="border-b border-border pb-2 text-xs font-semibold text-faro-text-3">Obligatorio</h3>
          <ul className="divide-y divide-border">
            {required.map((i) => (
              <Row key={i.id} item={i} />
            ))}
          </ul>
        </div>
        <div className="mt-6 xl:mt-0">
          <h3 className="border-b border-border pb-2 text-xs font-semibold text-faro-text-3">Deseable</h3>
          <ul className="divide-y divide-border">
            {desired.map((i) => (
              <Row key={i.id} item={i} />
            ))}
          </ul>
        </div>
      </div>
      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-4 text-xs text-faro-text-2" aria-label="Leyenda">
        {(Object.keys(STATUS) as ChallengeStatus[]).map((k) => {
          const s = STATUS[k];
          return (
            <li key={k} className="flex items-center gap-1.5">
              <s.Icon aria-hidden className={cn("size-3.5", s.tone)} strokeWidth={2.25} />
              {s.label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
