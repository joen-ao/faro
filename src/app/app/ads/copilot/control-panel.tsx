"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Octagon, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface RecView {
  id: string;
  rule: string;
  action: string;
  title: string;
  evidence: Record<string, unknown>;
  requiresApproval: boolean;
  status: string;
  appliedBy: string | null;
  createdAt: string;
}
export interface ActionView {
  id: string;
  actor: string;
  action: string;
  entityId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  ok: boolean;
  error: string | null;
  revertOf: string | null;
  at: string;
}
export interface SettingsView {
  mode: "recommend" | "autopilot";
  cplCap: number | null;
  cpqlCap: number | null;
}
type Msg = { kind: "ok" | "error"; text: string } | null;

const field = "h-10 w-full rounded-button border border-border bg-faro-surface-2 px-3 text-sm text-foreground placeholder:text-faro-text-3";
const label = "mb-1 block text-xs text-faro-text-2";
const when = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
const ACTION_LABEL: Record<string, string> = {
  pause_ad: "Pausar anuncio",
  lower_budget: "Bajar presupuesto",
  raise_budget: "Subir presupuesto",
  activate_campaign: "Activar campaña",
  alert: "Alerta",
  pause_campaign: "Pausar campaña",
};
const STATUS_LABEL: Record<string, string> = { proposed: "Pendiente", applied: "Aplicada", dismissed: "Descartada", expired: "Vencida", failed: "Falló" };
const REVERTIBLE = new Set(["pause_ad", "lower_budget", "raise_budget", "activate_campaign", "pause_campaign"]);

function fmtEvidence(e: Record<string, unknown>): string {
  return Object.entries(e)
    .map(([k, v]) => `${k}: ${typeof v === "number" ? (Math.abs(v) < 1 ? (v * 100).toFixed(2) + " %" : Math.round(v).toLocaleString("es-CO")) : String(v)}`)
    .join(" · ");
}

export function ControlPanel({ settings, recs, actions, spendEnabled, skipped }: { settings: SettingsView; recs: RecView[]; actions: ActionView[]; spendEnabled: boolean; skipped: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [form, setForm] = useState({ mode: settings.mode, cplCap: settings.cplCap?.toString() ?? "", cpqlCap: settings.cpqlCap?.toString() ?? "" });
  const [confirmPanic, setConfirmPanic] = useState(false);
  const open = recs.filter((r) => r.status === "proposed");
  const history = recs.filter((r) => r.status !== "proposed").slice(0, 20);
  const reverted = new Set(actions.filter((a) => a.revertOf && a.ok).map((a) => a.revertOf));

  async function call(key: string, url: string, body?: unknown, ok?: (d: Record<string, unknown>) => string) {
    setBusy(key);
    setMsg(null);
    try {
      const res = await fetch(url, { method: "POST", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || data.ok === false) setMsg({ kind: "error", text: (data.message as string) ?? (res.status === 401 ? "Sin acceso: falta la clave de la app." : "No se pudo completar.") });
      else {
        setMsg({ kind: "ok", text: ok ? ok(data) : "Listo." });
        router.refresh();
      }
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section aria-labelledby="cfg-h" className="rounded-card border border-border bg-card p-5">
        <h2 id="cfg-h" className="text-lg font-semibold">Cómo trabaja el copiloto</h2>
        <p className="mt-1 text-sm text-faro-text-2">
          Evalúa a diario (6:00, después de traer las métricas). En piloto automático solo ejecuta lo que <strong className="text-foreground">baja gasto</strong>: pausar anuncios
          perdedores y recortar presupuesto. Subir gasto, activar o escalar siempre espera tu aprobación.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="cfg-mode">Modo</label>
            <select id="cfg-mode" className={field} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as SettingsView["mode"] })}>
              <option value="recommend">Solo recomendar</option>
              <option value="autopilot">Piloto automático (solo baja gasto)</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="cfg-cpl">CPL objetivo (COP)</label>
            <input id="cfg-cpl" inputMode="numeric" pattern="\d*" className={field} placeholder="p. ej. 25000" value={form.cplCap} onChange={(e) => setForm({ ...form, cplCap: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="cfg-cpql">CPQL objetivo (COP)</label>
            <input id="cfg-cpql" inputMode="numeric" pattern="\d*" className={field} placeholder="p. ej. 120000" value={form.cpqlCap} onChange={(e) => setForm({ ...form, cpqlCap: e.target.value })} />
          </div>
        </div>
        <p className="mt-2 text-xs text-faro-text-3">No hay benchmarks confiables de B2B en Colombia: define los objetivos según lo que vale una llamada para tu ticket y recalíbralos tras las primeras 2 semanas.</p>
        {skipped.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-faro-text-2">
            {skipped.map((x) => <li key={x}>{x}</li>)}
          </ul>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button type="button" disabled={busy !== null} onClick={() => call("cfg", "/api/ads/copilot/settings", { mode: form.mode, cplCap: form.cplCap, cpqlCap: form.cpqlCap }, () => "Configuración guardada.")}>
            Guardar
          </Button>
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => call("eval", "/api/ads/copilot/evaluate", undefined, (d) => {
            const s = d.summary as { proposed: number; autoApplied: number };
            return `${s.proposed} recomendaciones${s.autoApplied ? `, ${s.autoApplied} aplicadas por el piloto` : ""}.`;
          })}>
            <RefreshCw className={`size-4 ${busy === "eval" ? "animate-spin" : ""}`} /> Evaluar ahora
          </Button>
        </div>
      </section>

      <section aria-labelledby="recs-h" className="rounded-card border border-border bg-card p-5">
        <h2 id="recs-h" className="text-lg font-semibold">Recomendaciones pendientes</h2>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-faro-text-2">Nada pendiente. Con poco volumen lo normal es esperar: el copiloto no recomienda nada sin datos suficientes.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {open.map((r) => (
              <li key={r.id} className="rounded-button border border-border bg-faro-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider ${r.requiresApproval ? "border-[var(--faro-border-active)] text-faro-accent" : "border-border text-faro-text-3"}`}>
                    {r.requiresApproval ? "REQUIERE APROBACIÓN" : r.action === "alert" ? "ALERTA" : "BAJA GASTO"}
                  </span>
                  <span className="text-xs text-faro-text-3">{r.rule}</span>
                </div>
                <p className="mt-2 break-words text-sm font-medium">{r.title}</p>
                <p className="mt-1 break-words text-xs text-faro-text-3">{fmtEvidence(r.evidence)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.action !== "alert" && (
                    <Button type="button" size="sm" disabled={busy !== null || ((r.action === "raise_budget" || r.action === "activate_campaign") && !spendEnabled)} title={(r.action === "raise_budget" || r.action === "activate_campaign") && !spendEnabled ? "Bloqueado: ADS_SPEND_ENABLED=false" : undefined} onClick={() => call(r.id, `/api/ads/copilot/recommendations/${r.id}`, { decision: "apply" }, () => "Aplicado y registrado.")}>
                      Aplicar
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => call(r.id, `/api/ads/copilot/recommendations/${r.id}`, { decision: r.action === "alert" ? "apply" : "dismiss" }, () => (r.action === "alert" ? "Alerta marcada como vista." : "Descartada."))}>
                    {r.action === "alert" ? "Entendido" : "Descartar"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {history.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-faro-text-2">Historial ({history.length})</summary>
            <ul className="mt-2 space-y-1 text-xs text-faro-text-2">
              {history.map((r) => (
                <li key={r.id} className="break-words">{when(r.createdAt)} · {STATUS_LABEL[r.status] ?? r.status}{r.appliedBy ? ` (${r.appliedBy === "autopilot" ? "piloto" : "humano"})` : ""} · {r.title}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="log-h" className="rounded-card border border-border bg-card p-5">
        <h2 id="log-h" className="text-lg font-semibold">Registro de cambios en Meta</h2>
        {actions.length === 0 ? (
          <p className="mt-3 text-sm text-faro-text-2">Todavía no hay cambios. Cada acción del piloto o tuya queda aquí con el antes y el después.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {actions.map((a) => (
              <li key={a.id} className="flex flex-col gap-2 rounded-button border border-border bg-faro-surface-2 p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {ACTION_LABEL[a.action.replace(/^revert_/, "")] ?? a.action}
                    {a.action.startsWith("revert_") ? " (revertido)" : ""} · {a.actor === "autopilot" ? "piloto" : "humano"}
                    {!a.ok && <span className="text-[var(--faro-danger)]"> · falló</span>}
                  </p>
                  <p className="mt-0.5 break-words text-faro-text-3">{when(a.at)} · {a.entityId} · {JSON.stringify(a.before)} → {JSON.stringify(a.after)}{a.error ? ` · ${a.error}` : ""}</p>
                </div>
                {a.ok && !a.revertOf && REVERTIBLE.has(a.action) && !reverted.has(a.id) && (
                  <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => call(a.id, `/api/ads/copilot/actions/${a.id}/revert`, undefined, () => "Revertido.")} className="shrink-0">
                    <RotateCcw className="size-4" /> Revertir
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="panic-h" className="rounded-card border border-[var(--faro-danger)] bg-card p-5">
        <h2 id="panic-h" className="flex items-center gap-2 text-lg font-semibold"><Octagon className="size-4 text-[var(--faro-danger)]" /> Pausar todo</h2>
        <p className="mt-1 text-sm text-faro-text-2">Pausa de inmediato todas las campañas que creó el copiloto. Siempre está disponible.</p>
        {confirmPanic ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="border-[var(--faro-danger)] text-[var(--faro-danger)] hover:border-[var(--faro-danger)] hover:text-[var(--faro-danger)]" disabled={busy !== null} onClick={() => call("panic", "/api/ads/copilot/panic", undefined, (d) => `${d.paused} campañas pausadas.`).then(() => setConfirmPanic(false))}>
              Sí, pausar todas
            </Button>
            <Button type="button" variant="outline" onClick={() => setConfirmPanic(false)}>Cancelar</Button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="mt-3" onClick={() => setConfirmPanic(true)}>Pausar todas las campañas del copiloto</Button>
        )}
      </section>

      <div role="status" aria-live="polite">
        {msg && (
          <div className={`rounded-card border p-4 text-sm ${msg.kind === "ok" ? "border-[var(--faro-border-active)]" : "border-[var(--faro-danger)]"}`}>
            <p className={`break-words ${msg.kind === "ok" ? "text-faro-accent" : "text-[var(--faro-danger)]"}`}>{msg.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
