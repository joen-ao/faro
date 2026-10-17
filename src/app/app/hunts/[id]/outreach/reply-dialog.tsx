"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Channel = "email" | "web_form" | "whatsapp" | "dapta_widget";
const CHANNELS: { value: Channel; label: string }[] = [
  { value: "email", label: "Correo" },
  { value: "web_form", label: "Formulario web" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "dapta_widget", label: "Widget" },
];
const MAX = 280;

const field =
  "w-full rounded-button border border-border bg-faro-surface-2 px-3 py-2 text-sm text-white placeholder:text-faro-text-3 focus-visible:border-faro-accent focus-visible:outline-none";

/** Local `YYYY-MM-DDTHH:mm` for <input type="datetime-local">. */
function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function ReplyDialog(props: { leadId: string; companyName: string; onClose: () => void; onDone: (text: string) => void; initialChannel?: Channel }) {
  const [channel, setChannel] = useState<Channel>(props.initialChannel ?? "email");
  const [note, setNote] = useState("");
  const [at, setAt] = useState(localNow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const { onClose } = props;

  useEffect(() => {
    noteRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (note.trim().length < 3) {
      setError("La nota es obligatoria (mín. 3 caracteres).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${props.leadId}/reply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note: note.trim(), channel, at: new Date(at).toISOString() }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; status?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "No se pudo registrar la respuesta.");
        return;
      }
      props.onDone(`Respuesta registrada para ${props.companyName}.`);
    } catch {
      setError("Sin conexión. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reply-title"
        data-testid="reply-dialog"
        onSubmit={submit}
        className="flex max-h-dvh w-full flex-col gap-4 overflow-y-auto rounded-t-card border border-border bg-faro-surface-1 p-5 sm:max-w-md sm:rounded-card"
      >
        <div>
          <h2 id="reply-title" className="font-display text-xl font-bold">
            Marcar respondió
          </h2>
          <p className="mt-1 text-sm text-faro-text-2 [overflow-wrap:anywhere]">{props.companyName}. Queda un evento auditado en el historial del lead.</p>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          Canal de la respuesta
          <select className={cn(field, "h-10")} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          Fecha y hora
          <input type="datetime-local" className={cn(field, "h-10")} value={at} max={localNow()} onChange={(e) => setAt(e.target.value)} required />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          Nota (obligatoria)
          <textarea
            ref={noteRef}
            data-testid="reply-note"
            className={cn(field, "min-h-24 resize-y")}
            value={note}
            maxLength={MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Qué dijo la empresa, en una frase."
            required
          />
          <span className="flex justify-between text-xs text-faro-text-3">
            <span>Sin nombres de personas: escribe solo &quot;la empresa&quot; o el cargo genérico.</span>
            <span>
              {note.length}/{MAX}
            </span>
          </span>
        </label>

        {error && (
          <p role="alert" data-testid="reply-error" className="text-sm text-[var(--faro-danger)]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-button border border-border px-4 text-sm hover:border-white/40">
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="reply-submit"
            disabled={busy || note.trim().length < 3}
            className="inline-flex h-10 items-center rounded-button bg-faro-accent px-4 text-sm font-semibold text-[var(--faro-accent-ink)] disabled:pointer-events-none disabled:opacity-40"
          >
            {busy ? "Guardando…" : "Registrar respuesta"}
          </button>
        </div>
      </form>
    </div>
  );
}
