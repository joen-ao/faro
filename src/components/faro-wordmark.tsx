import { cn } from "@/lib/utils";

/** Faro mark: a beam sweeping from a point. Text wordmark, no third-party branding. */
export function FaroMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden fill="none">
      <circle cx="12" cy="12" r="2.8" fill="#cbe850" />
      <path d="M7.2 7.2a6.8 6.8 0 0 0 0 9.6M16.8 7.2a6.8 6.8 0 0 1 0 9.6" stroke="#cbe850" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M4.2 4.2a11 11 0 0 0 0 15.6M19.8 4.2a11 11 0 0 1 0 15.6" stroke="#cbe850" strokeWidth="1.9" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function FaroWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-[18px] font-semibold text-white", className)} style={{ fontFamily: "var(--font-poppins)", letterSpacing: "-0.02em" }}>
      <FaroMark />
      Faro
    </span>
  );
}
