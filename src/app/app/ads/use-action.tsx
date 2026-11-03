"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type Msg = { kind: "ok" | "error"; text: string; lines?: string[] } | null;
type Data = Record<string, unknown>;

/** One POST with busy/flash state; refreshes the server page on success. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  async function call(key: string, url: string, body?: unknown, ok?: (d: Data) => string): Promise<boolean> {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Data;
      if (!res.ok || data.ok === false) {
        setMsg({ kind: "error", text: (data.message as string) ?? (res.status === 401 ? "Sin acceso: falta la clave de la app." : "No se pudo completar."), lines: data.issues as string[] | undefined });
        return false;
      }
      setMsg({ kind: "ok", text: ok ? ok(data) : "Listo." });
      router.refresh();
      return true;
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
      return false;
    } finally {
      setBusy(null);
    }
  }

  return { busy, msg, setMsg, call };
}

export function Flash({ msg, className = "" }: { msg: Msg; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={className}>
      {msg && (
        <div className={`rounded-button border px-3 py-2.5 text-sm ${msg.kind === "ok" ? "border-[var(--faro-border-active)]" : "border-[var(--faro-danger)]"}`}>
          <p className={`break-words ${msg.kind === "ok" ? "text-faro-accent" : "text-[var(--faro-danger)]"}`}>{msg.text}</p>
          {msg.lines?.length ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-faro-text-2">
              {msg.lines.map((l) => <li key={l}>{l}</li>)}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}

export const fieldCls = "h-10 w-full rounded-button border border-border bg-faro-surface-2 px-3 text-sm text-foreground placeholder:text-faro-text-3";
export const labelCls = "mb-1 block text-xs text-faro-text-2";
