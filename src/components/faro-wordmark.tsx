import { cn } from "@/lib/utils";

/** Faro mark: a beam sweeping from a point. Text wordmark, no third-party branding. */
export function FaroMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden fill="none">
      <path d="M12 12 3.5 5.2a14 14 0 0 1 17 0L12 12Z" fill="#cbe850" opacity="0.95" />
      <circle cx="12" cy="13.2" r="2.6" fill="#cbe850" />
      <path d="M8 21h8M12 15.8V21" stroke="#cbe850" strokeWidth="1.8" strokeLinecap="round" />
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
