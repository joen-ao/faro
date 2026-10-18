"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Full-screen landing section that flips `data-inview` once it enters the viewport; CSS in landing.css animates its parts. */
export function InViewSection({ id, labelledBy, className, children }: { id?: string; labelledBy: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    // Reduced motion or no observer: stay "pending", which CSS never hides.
    if (!el || reduced() || typeof IntersectionObserver === "undefined") return;
    // Server HTML is "pending" (visible without JS); hide only once the client can reveal it again.
    el.dataset.inview = "false";
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          el.dataset.inview = "true";
          io.disconnect();
        }
      },
      { threshold: 0.22 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={labelledBy}
      data-inview="pending"
      className={cn("faro-motion relative flex min-h-dvh max-sm:min-h-0 scroll-mt-0 items-center overflow-hidden border-t border-white/[0.08]", className)}
    >
      {children}
    </section>
  );
}

const nf = new Intl.NumberFormat("es-CO");

/** Counts up to `to` when its section enters the viewport. Server HTML and reduced motion show the final value. */
export function CountUp({ to, suffix = "", className }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(to);
  useEffect(() => {
    const el = ref.current;
    const section = el?.closest("[data-inview]");
    if (!el || !section || reduced() || to === 0) return;
    let raf = 0;
    const run = () => {
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / 1400);
        setShown(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    // Child effects run before the section's own effect: wait for it to hide ("false"), then count when it shows ("true").
    if (section.getAttribute("data-inview") === "true") return;
    const mo = new MutationObserver(() => {
      const state = section.getAttribute("data-inview");
      if (state === "false") setShown(0);
      if (state === "true") {
        mo.disconnect();
        run();
      }
    });
    mo.observe(section, { attributes: true, attributeFilter: ["data-inview"] });
    return () => {
      mo.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to]);
  return (
    <span ref={ref} className={className}>
      {nf.format(shown)}
      {suffix}
    </span>
  );
}
