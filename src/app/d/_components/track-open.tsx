"use client";

import { useEffect } from "react";

/** Fire-and-forget page-open event: never blocks or breaks rendering. Once per tab session. */
export function TrackOpen({ slug, tracking }: { slug: string; tracking: { c?: string; s?: string; utm?: Record<string, string> } }) {
  useEffect(() => {
    const key = `faro:open:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: still send once per mount */
    }
    fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug, ...tracking }),
      keepalive: true,
    }).catch(() => {});
  }, [slug, tracking]);
  return null;
}
