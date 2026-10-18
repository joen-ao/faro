"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import type { SendWindowSetting } from "@/features/compliance/windows";

type Policy = "ley2300" | "extendida" | "custom";
interface NowState {
  allowed: boolean;
  reason: string;
  nextAllowedAt: string | null;
}

const DAYS = [
  { d: 1, l: "Lun" },
  { d: 2, l: "Mar" },
  { d: 3, l: "Mié" },
  { d: 4, l: "Jue" },
  { d: 5, l: "Vie" },
  { d: 6, l: "Sáb" },
  { d: 0, l: "Dom" },
];
const HOURS = Array.from({ length: 25 }, (_, h) => h);
const field = "h-10 w-full rounded-button border border-border bg-faro-surface-2 px-3 text-sm text-foreground";
const label = "mb-1 block text-xs text-faro-text-2";
const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const OPTIONS: { value: Policy; title: string; body: string }[] = [
  { value: "ley2300", title: "Ley 2300", body: "Lun–vie 7:00–19:00 · sáb 8:00–15:00 · nunca domingo ni festivos." },
  { value: "extendida", title: "Extendida", body: "Todos los días 8:00–20:00, festivos incluidos." },
  { value: "custom", title: "Personalizada", body: "Tú eliges horas y días." },
];

export function SendWindowForm({ initial, origin, now }: { initial: SendWindowSetting; origin: "panel" | "env"; now: NowState }) {
  const router = useRouter();
  const custom = initial.policy === "custom" ? initial : null;
  const [policy, setPolicy] = useState<Policy>(initial.policy);
  const [start, setStart] = useState(custom?.startHour ?? 8);
  const [end, setEnd] = useState(custom?.endHour ?? 22);
  const [days, setDays] = useState<number[]>(custom?.days ?? [0, 1, 2, 3, 4, 5, 6]);
  const [state, setState] = useState<NowState>(now);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const body = policy === "custom" ? { policy, startHour: start, endHour: end, days } : { policy };
    try {
      const res = await fetch("/api/settings/send-window", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.issues?.join(" · ") ?? json.error ?? `HTTP ${res.status}`);
      setState(json.now);
      setMsg({ kind: "ok", text: "Horario guardado. La cola ya usa esta ventana." });
      router.refresh();
    } catch (err) {
      setMsg({ kind: "error", text: `No se pudo guardar: ${(err as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  const invalid = policy === "custom" && (end <= start || days.length === 0);

  return (
    <form onSubmit={save} className="mt-8 flex flex-col gap-6" data-testid="send-window-form">
      <div role="status" data-testid="send-window-now" className="rounded-card border border-border bg-card p-4 text-sm" style={state.allowed ? { borderColor: "var(--faro-border-active)" } : undefined}>
        <p className={`font-semibold ${state.allowed ? "text-faro-accent" : "text-foreground"}`}>
          {state.allowed ? "Ventana abierta ahora" : `Ventana cerrada${state.nextAllowedAt ? ` · abre ${fmtTime(state.nextAllowedAt)}` : ""}`}
        </p>
        <p className="mt-1 text-faro-text-2">{state.reason}.</p>
        {origin === "env" && <p className="mt-1 text-xs text-faro-text-3">Aún no se ha guardado un horario en el panel: se usa SEND_WINDOW_POLICY del entorno.</p>}
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Política</legend>
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="cursor-pointer rounded-card border border-border bg-faro-surface-1 p-4 text-sm has-[:checked]:border-faro-accent"
          >
            <input type="radio" name="policy" value={o.value} checked={policy === o.value} onChange={() => setPolicy(o.value)} className="sr-only" />
            <span className="block font-semibold">{o.title}</span>
            <span className="mt-1 block text-xs text-faro-text-2">{o.body}</span>
          </label>
        ))}
      </fieldset>

      {policy === "custom" && (
        <div className="flex flex-col gap-4 rounded-card border border-border bg-faro-surface-1 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="start" className={label}>Desde (hora Colombia)</label>
              <select id="start" value={start} onChange={(e) => setStart(Number(e.target.value))} className={field}>
                {HOURS.slice(0, 24).map((h) => (
                  <option key={h} value={h}>{`${h}:00`}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="end" className={label}>Hasta</label>
              <select id="end" value={end} onChange={(e) => setEnd(Number(e.target.value))} className={field}>
                {HOURS.slice(1).map((h) => (
                  <option key={h} value={h}>{h === 24 ? "24:00 (medianoche)" : `${h}:00`}</option>
                ))}
              </select>
            </div>
          </div>
          <fieldset>
            <legend className={label}>Días</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map(({ d, l }) => {
                const on = days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])}
                    className={`h-9 min-w-12 rounded-button border px-3 text-sm ${on ? "border-faro-accent bg-faro-accent text-black" : "border-border text-faro-text-2"}`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {invalid && <p className="text-xs text-[var(--faro-danger)]">Elige al menos un día y una hora de fin mayor que la de inicio.</p>}
          <p className="text-xs text-faro-text-3">Fuera de la Ley 2300 (que el equipo adopta de forma voluntaria). Se mantiene: un solo mensaje por empresa, baja en un clic y solo buzones genéricos.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || invalid}>
          {busy ? "Guardando…" : "Guardar horario"}
        </Button>
        <a href="/app/dashboard" className="text-sm text-faro-text-2 underline-offset-2 hover:underline">
          Ir al tablero
        </a>
      </div>
      {msg && (
        <p role="status" className={`text-sm ${msg.kind === "ok" ? "text-faro-accent" : "text-[var(--faro-danger)]"}`}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
