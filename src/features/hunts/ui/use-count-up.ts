"use client";

import { useEffect, useRef, useState } from "react";

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Animates a number toward `target` (ease-out). Snaps when the user prefers reduced motion. */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const raf = useRef(0);
  const current = useRef(target);
  const reduced = prefersReducedMotion();
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (reduced || durationMs <= 0) {
      current.current = target;
      return;
    }
    from.current = current.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 4);
      const v = from.current + (target - from.current) * eased;
      current.current = v;
      setValue(v);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, durationMs, reduced]);
  return reduced || durationMs <= 0 ? target : Math.round(value);
}
