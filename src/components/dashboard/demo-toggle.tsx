"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

/** "Incluir datos de prueba" switch. State lives in the URL (?demo=1); off by default. */
export function DemoToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={() => start(() => router.replace(on ? path : `${path}?demo=1`, { scroll: false }))}
      className="inline-flex min-h-11 items-center gap-3 rounded-button border border-border px-3.5 text-sm text-faro-text-2 transition-colors hover:text-white aria-checked:border-faro-accent aria-checked:text-white"
    >
      <span className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-faro-accent" : "bg-faro-surface-3")} aria-hidden>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full transition-all", on ? "left-[18px] bg-[#1a1a1c]" : "left-0.5 bg-white")} />
      </span>
      Incluir datos de prueba
    </button>
  );
}
