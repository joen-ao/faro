"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { DailyOutreachSetting, DailyRunSummary } from "@/features/outreach/daily";

const SKIPPED: Record<string, string> = {
  disabled: "apagado",
  outside_window: "fuera de la ventana de envío",
  quota_reached: "cupo del día ya cubierto",
  no_candidates: "no quedan empresas con correo genérico sin contactar",
};
const fmt = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/** F25 · Daily email run: on/off, emails per day, hunts, run now, last run. */
export function DailyOutreachForm(props: {
  initial: DailyOutreachSetting;
  lastRun: DailyRunSummary | null;
  sentToday: number;
  hunts: { id: string; title: string; ready: number }[];
  sendEnabled: boolean;
  cronConfigured: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(props.initial.enabled);
  const [perDay, setPerDay] = useState(props.initial.emailsPerDay);
  const [all, setAll] = useState(!props.initial.huntIds?.length);
  const [huntIds, setHuntIds] = useState<string[]>(props.initial.huntIds ?? []);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [last, setLast] = useState(props.lastRun);

  const save = async (next?: Partial<{ enabled: boolean }>) => {
    const on = next?.enabled ?? enabled;
    if (on && !props.initial.enabled && props.sendEnabled && !window.confirm(`Encender el envío diario: cada día hábil saldrán hasta ${perDay} correos reales. ¿Continuar?`)) return false;
    setBusy("save");
    setMsg(null);
    const r = await fetch("/api/settings/daily-outreach", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: on, emailsPerDay: perDay, huntIds: all ? null : huntIds }),
    });
    setBusy(null);
    setMsg(r.ok ? "Guardado." : "No se pudo guardar.");
    router.refresh();
    return r.ok;
  };

  const runNow = async () => {
    if (!window.confirm(`${props.sendEnabled ? "Enviar ahora" : "Simular ahora"} el lote de hoy (hasta ${Math.max(0, perDay - props.sentToday)} correos)?`)) return;
    setBusy("run");
    setMsg(null);
    const r = await fetch("/api/settings/daily-outreach", { method: "POST" });
    const j = (await r.json().catch(() => ({}))) as { summary?: DailyRunSummary };
    setBusy(null);
    if (j.summary) setLast(j.summary);
    setMsg(r.ok ? null : "Error al ejecutar el lote.");
    router.refresh();
  };

  return (
    <section className="mt-12 flex flex-col gap-5" data-testid="daily-outreach">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-faro-text-3">Envío diario automático</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">Correos del día</h2>
        <p className="mt-1 text-sm text-faro-text-2">
          Cada día hábil a las 9:00 (Bogotá) Faro escribe a las empresas mejor puntuadas con correo genérico que aún no contactamos. Cada correo muestra lo que vimos en su
          presencia digital y el servicio que le ayuda. Un solo mensaje por empresa.
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-card border border-border bg-faro-surface-1 p-4">
        <span>
          <span className="block font-semibold">{enabled ? "Encendido" : "Apagado"}</span>
          <span className="block text-xs text-faro-text-2">{props.sendEnabled ? "Envío real (SEND_ENABLED=true)." : "SEND_ENABLED=false: se simula, no sale nada."}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          onChange={async (e) => {
            const v = e.target.checked;
            setEnabled(v);
            if (!(await save({ enabled: v }))) setEnabled(!v);
          }}
          className="h-5 w-9 accent-[var(--faro-accent)]"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-faro-text-2">Correos por día</span>
          <input type="number" min={1} max={100} value={perDay} onChange={(e) => setPerDay(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} className="h-10 w-full rounded-button border border-border bg-faro-surface-2 px-3" />
        </label>
        <div className="text-sm">
          <span className="mb-1 block text-xs text-faro-text-2">Hoy</span>
          <p className="flex h-10 items-center tabular-nums">
            {props.sentToday} / {perDay} correos
          </p>
        </div>
      </div>

      <fieldset className="rounded-card border border-border bg-faro-surface-1 p-4 text-sm">
        <legend className="px-1 text-xs text-faro-text-2">Búsquedas incluidas</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Todas las búsquedas reales
        </label>
        {!all && (
          <ul className="mt-3 max-h-56 space-y-1.5 overflow-auto">
            {props.hunts.map((h) => (
              <li key={h.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={huntIds.includes(h.id)} onChange={(e) => setHuntIds((xs) => (e.target.checked ? [...xs, h.id] : xs.filter((x) => x !== h.id)))} />
                  <span className="min-w-0 truncate">{h.title}</span>
                  <span className="ml-auto tabular-nums text-faro-text-3">{h.ready} listas</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void save()} disabled={busy !== null}>
          {busy === "save" ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="outline" onClick={runNow} disabled={busy !== null}>
          {busy === "run" ? "Ejecutando…" : props.sendEnabled ? "Enviar el lote de hoy ahora" : "Simular el lote de hoy"}
        </Button>
        {msg && <span role="status" className="self-center text-sm text-faro-text-2">{msg}</span>}
      </div>
      {!props.cronConfigured && <p className="text-xs text-[var(--faro-danger)]">Falta CRON_SECRET en el entorno: el cron de Vercel no podrá ejecutar el lote.</p>}

      {last && (
        <div role="status" data-testid="daily-last-run" className="rounded-card border border-border bg-card p-4 text-sm">
          <p className="font-semibold">
            Última corrida · {fmt(last.at)} · {last.trigger === "cron" ? "automática" : "manual"}
          </p>
          <p className="mt-1 text-faro-text-2">
            {last.skipped
              ? `No envió: ${SKIPPED[last.skipped] ?? last.skipped}${last.note ? ` (${last.note})` : ""}.`
              : `${last.enqueued} encolados · ${last.sent} enviados · ${last.simulated} simulados · ${last.blocked} bloqueados · ${last.failed} con error.`}
          </p>
        </div>
      )}
    </section>
  );
}
