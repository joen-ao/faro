import Link from "next/link";
import { cn } from "@/lib/utils";
import { InViewSection } from "./motion";

const num2 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num3 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const num0 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

/** Amount only (no currency), with enough precision for sub-dollar CPLs: 0,067 · 7,60 · 1.204. */
export function amount(v: number): string {
  const abs = Math.abs(v);
  return (abs >= 100 ? num0 : abs >= 1 || abs === 0 ? num2 : num3).format(v);
}

export const pct = (v: number) => `${Math.round(v * 100)} %`;

export const EMPTY = "Sin datos aún";

/** Big number with a small "USD" prefix; honest empty state when there is no CPL. */
export function Usd({ value, className, emptyClassName }: { value: number | null; className?: string; emptyClassName?: string }) {
  if (value === null) return <span className={cn("text-faro-text-3", emptyClassName)}>{EMPTY}</span>;
  return (
    <span className={className}>
      <span className="mr-[0.2em] align-[0.12em] text-[0.42em] font-semibold tracking-normal">USD</span>
      {amount(value)}
    </span>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-medium uppercase tracking-[0.24em] text-faro-accent">{children}</p>;
}

export function PrimaryLink({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Link
      href="/app/new"
      className={cn(
        "group inline-flex items-center justify-center gap-2.5 rounded-button bg-faro-accent font-bold text-[#1a1a1c] transition-colors hover:bg-[#d9f075] focus-visible:outline-offset-4",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={cn("size-[18px] transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none", className)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Full-screen section shell (sections 5-8): min-h-dvh, content centered vertically. */
export function ScreenSection({ id, labelledBy, className, children }: { id?: string; labelledBy: string; className?: string; children: React.ReactNode }) {
  return (
    <InViewSection id={id} labelledBy={labelledBy} className={className}>
      {children}
    </InViewSection>
  );
}
