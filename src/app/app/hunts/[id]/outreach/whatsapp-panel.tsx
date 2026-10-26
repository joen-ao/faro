"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface Summary {
  enabled: boolean;
  sendEnabled: boolean;
  window: { allowed: boolean; reason?: string; nextAllowedAt?: string | null };
  dailyUsed: number;
  dailyLimit: number;
  total: number;
  byTemplate: Record<string, number>;
  byPhone: Record<string, number>;
  skippedBy: Record<string, number>;
  sample: { leadId: string; company: string; phone: string; phoneKind: string; template: string; nombre: string }[];
}

const PHONE: Record<string, string> = { whatsapp: "WhatsApp publicado", empresa: "celular de la empresa", personal: "celular del registro público" };
const SKIP: Record<string, string> = {
  no_mobile: "sin celular (solo fijo o nada)",
  already_contacted: "ya contactados",
  suppressed: "pidieron la baja",
  no_template: "plantilla pendiente de aprobar",
};
const fmt = (n: number) => n.toLocaleString("es-CO");

/** F24 · Bulk WhatsApp through Dapta for the current tab: who receives it, why the rest do not, today's quota. */
export function WhatsappPanel({ huntId, segment }: { huntId: string; segment: "empresas" | "independientes" }) {
  const router = useRouter();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(20);
  const [result, setResult] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fetchSummary = useCallback(async (): Promise<Summary | null> => {
    const r = await fetch(`/api/whatsapp/send?huntId=${huntId}&segment=${segment}`);
    return r.ok ? ((await r.json()) as Summary) : null;
  }, [huntId, segment]);
  const load = useCallback(async () => {
    const d = await fetchSummary();
    setError(d ? null : "No se pudo calcular el envío por WhatsApp.");
    setData(d);
  }, [fetchSummary]);
  useEffect(() => {
    let alive = true;
    fetchSummary().then((d) => {
      if (!alive) return;
      setError(d ? null : "No se pudo calcular el envío por WhatsApp.");
      setData(d);
    });
    return () => {
      alive = false;
    };
  }, [fetchSummary]);

  const send = async () => {
    if (!data) return;
    const n = Math.min(limit, data.total);
    const verb = data.sendEnabled ? "Enviar de verdad" : "Simular";
    if (!window.confirm(`${verb} la plantilla de WhatsApp a ${n} ${n === 1 ? "lead" : "leads"}? Cada número recibe un solo mensaje y puede responder BAJA.`)) return;
    setBusy(true);
    setResult(null);
    const r = await fetch("/api/whatsapp/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ huntId, segment, limit: n }) });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; sent?: number; simulated?: number; failed?: number };
    setBusy(false);
    setResult(j.ok ? `Listo: ${j.sent ?? 0} enviados · ${j.simulated ?? 0} simulados · ${j.failed ?? 0} con error.` : j.error === "whatsapp_send_disabled" ? "El envío por WhatsApp está apagado (WHATSAPP_SEND_MODE)." : (j.error ?? "Error al enviar."));
    await load();
    router.refresh();
  };

  if (error) return <p className="text-sm text-[var(--faro-danger)]">{error}</p>;
  if (!data) return <div className="h-[74px] animate-pulse rounded-[12px] border border-white/10 bg-faro-surface-1" aria-hidden />;
  const quota = Math.max(0, data.dailyLimit - data.dailyUsed);
  const can = data.enabled && data.window.allowed && data.total > 0 && (!data.sendEnabled || quota > 0);
  const skipped = Object.entries(data.skippedBy).filter(([, n]) => n > 0);

  return (
    <section aria-label="WhatsApp" data-testid="whatsapp-panel" className="rounded-[12px] border border-[#25D366]/35 bg-[#25D366]/[0.05] px-4 py-3.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">
            WhatsApp por Dapta · <span className="tabular-nums">{fmt(data.total)}</span> con celular listo
            {!data.enabled && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-xs font-normal text-faro-text-2">apagado</span>}
          </p>
          <p className="mt-0.5 text-faro-text-3">
            {Object.entries(data.byPhone).map(([k, n]) => `${fmt(n)} ${PHONE[k] ?? k}`).join(" · ") || "Ningún lead con celular disponible"}
            {" · "}hoy {fmt(data.dailyUsed)}/{fmt(data.dailyLimit)}
            {!data.window.allowed && ` · fuera de ventana: ${data.window.reason ?? ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="wa-limit">Cuántos</label>
          <select id="wa-limit" value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="h-[38px] rounded-[8px] border border-white/15 bg-black px-2 text-white">
            {[5, 10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <button
            type="button"
            data-testid="whatsapp-send"
            disabled={!can || busy}
            onClick={send}
            className={cn("h-[38px] rounded-[8px] px-4 font-bold transition-opacity disabled:opacity-40", "bg-[#25D366] text-black")}
          >
            {busy ? "Enviando…" : data.sendEnabled ? `Enviar WhatsApp a ${fmt(Math.min(limit, data.total, quota))}` : `Simular ${fmt(Math.min(limit, data.total))}`}
          </button>
          <button type="button" onClick={() => setOpen((o) => !o)} className="h-[38px] rounded-[8px] border border-white/15 px-3 text-faro-text-2 hover:text-white" aria-expanded={open}>
            {open ? "Ocultar" : "Ver"}
          </button>
        </div>
      </div>
      {result && <p role="status" className="mt-2 text-white">{result}</p>}
      {open && (
        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
          <p className="text-faro-text-3">
            Plantillas: {Object.entries(data.byTemplate).map(([k, n]) => `${k} (${fmt(n)})`).join(" · ") || "—"}
            {skipped.length > 0 && <> · Fuera: {skipped.map(([k, n]) => `${fmt(n)} ${SKIP[k] ?? k}`).join(" · ")}</>}
          </p>
          <ul className="max-h-64 divide-y divide-white/[0.06] overflow-auto">
            {data.sample.map((s) => (
              <li key={s.leadId} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate text-white">{s.company}</span>
                <span className="tabular-nums text-faro-text-3">
                  {s.phone} · {PHONE[s.phoneKind] ?? s.phoneKind} · {s.template} · “Hola, {s.nombre}”
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
