"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Actualizar ahora": forces the snapshot refresh, then re-renders the page with the new copy. */
export function RefreshButton({ range }: { range: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const working = busy || pending;

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/refresh?range=${range}`, { method: "POST" });
      if (!res.ok) throw new Error(String(res.status));
      startTransition(() => router.refresh());
    } catch {
      setError("No se pudo actualizar. Reintenta en un momento.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={refresh}
        disabled={working}
        className="inline-flex min-h-10 items-center gap-2 rounded-button border border-border bg-faro-surface-2 px-3.5 text-sm font-medium text-white hover:border-faro-accent disabled:opacity-60"
      >
        <RefreshCw aria-hidden className={cn("size-4", working && "animate-spin")} />
        {working ? "Actualizando…" : "Actualizar ahora"}
      </button>
      <span role="status" aria-live="polite" className="text-xs text-destructive">
        {error}
      </span>
    </span>
  );
}
