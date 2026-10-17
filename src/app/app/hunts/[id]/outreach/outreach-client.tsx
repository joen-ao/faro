"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Channel = "email" | "web_form" | "whatsapp" | "dapta_widget";
interface Block {
  rule: string;
  message: string;
}
interface Assessment {
  allowed: boolean;
  simulated: boolean;
  blocks: Block[];
  unverifiedLegal: boolean;
  deferrable: boolean;
  nextAllowedAt: string | null;
  note?: string;
}
interface Option {
  channel: Channel;
  value: string;
  usable: boolean;
  note?: string;
}
export interface RowView {
  leadId: string;
  name: string;
  city: string | null;
  isDemo: boolean;
  source: string;
  fitScore: number | null;
  status: string;
  options: Option[];
  suggested: Channel | null;
  recipient: string | null;
  assessment: Assessment;
  latest: { id: string; status: string; channel: string; blockedByRule: string | null; subject: string | null; recipient: string | null } | null;
  formUrl: string | null;
}
export interface QueueItem {
  id: string;
  status: string;
  channel: string;
  rule: string | null;
  subject: string | null;
  company: string;
  at: string;
}
interface Preview {
  leadId: string;
  channel: Channel | null;
  recipient: string | null;
  assessment: Assessment;
  message: { subject: string; text: string; diagnosticUrl: string; optOutUrl: string; sourceLabel: string; senderIdentified: boolean; replyTo: string | null } | null;
  isMockAi: boolean;
}

const CHANNEL_LABEL: Record<Channel, string> = { email: "Correo", web_form: "Formulario (asistido)", whatsapp: "WhatsApp", dapta_widget: "Widget" };
const SOURCE_LABEL: Record<string, string> = { osm: "OSM", rues: "RUES", reps: "REPS", google_places: "Places", website: "Web", meta_ads: "Pauta", sample: "Demo" };
const RULE_LABEL: Record<string, string> = {
  natural_person: "Persona natural",
  personal_email: "Correo personal",
  suppressed: "Suprimido",
  outside_window: "Fuera de ventana",
  already_contacted: "Ya contactada",
  channel_not_allowed: "Canal no permitido",
  sender_missing: "Falta remitente",
  sender_address_missing: "Falta dirección",
  legal_unverified: "Jurídica por verificar",
  missing_unsubscribe: "Falta enlace de baja",
  no_channel: "Sin canal",
  sender_incomplete: "Remitente incompleto",
  channel_unavailable: "Canal desactivado",
};
const STATUS_LABEL: Record<string, string> = { sending: "Enviando / revisar", queued: "En cola", simulated: "Simulado", sent: "Enviado", blocked: "Bloqueado", failed: "Falló", delivered: "Entregado", draft: "Borrador" };

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function Chip({ tone, children }: { tone: "ok" | "bad" | "wait" | "mute"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        tone === "ok" && "border-faro-accent/50 text-faro-accent",
        tone === "bad" && "border-[var(--faro-danger)]/50 text-[var(--faro-danger)]",
        tone === "wait" && "border-white/25 text-white",
        tone === "mute" && "border-border text-faro-text-3",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function blocking(a: Assessment) {
  return a.blocks.filter((b) => b.rule !== "outside_window");
}

function verdict(a: Assessment, sendEnabled: boolean) {
  const hard = blocking(a);
  if (hard.length) return <Chip tone="bad">{RULE_LABEL[hard[0]!.rule] ?? hard[0]!.rule}{hard.length > 1 ? ` +${hard.length - 1}` : ""}</Chip>;
  if (a.deferrable) return <Chip tone="wait">Espera ventana</Chip>;
  return <Chip tone="ok">{sendEnabled ? "Listo para enviar" : "Listo (se simula)"}</Chip>;
}

const inputCls =
  "w-full rounded-button border border-border bg-faro-surface-2 px-3 py-2 text-sm text-white placeholder:text-faro-text-3 focus-visible:border-faro-accent focus-visible:outline-none";
const btn =
  "inline-flex h-10 items-center justify-center rounded-button px-4 text-sm font-semibold transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

export function OutreachClient(props: {
  huntId: string;
  isDemoHunt: boolean;
  sendEnabled: boolean;
  whatsappEnabled: boolean;
  humanRate: number;
  nowIso: string;
  window: { allowed: boolean; reason: string; nextAllowedAt: string | null };
  rows: RowView[];
  queue: QueueItem[];
}) {
  const router = useRouter();
  const { rows, queue, sendEnabled } = props;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [override, setOverride] = useState<Record<string, Channel>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [edited, setEdited] = useState<Record<string, { subject: string; body: string }>>({});
  const [minutes, setMinutes] = useState("5");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const active = rows.find((r) => r.leadId === activeId) ?? null;
  const channelOf = (r: RowView): Channel | null => override[r.leadId] ?? r.suggested;
  const selectable = (r: RowView) => !override[r.leadId] || override[r.leadId] === "email" ? r.suggested === "email" && blocking(r.assessment).length === 0 && !r.latest?.status.match(/queued|sending|sent|delivered/) : false;
  const eligible = useMemo(() => rows.filter(selectable), [rows, override]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadPreview = useCallback(async (leadId: string, channel: Channel | null) => {
    setLoadingPreview(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/outreach/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId, ...(channel ? { channel } : {}), ...(props.isDemoHunt ? { asOf: props.nowIso } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo generar la vista previa");
      setPreview(json as Preview);
      setSubject(json.message?.subject ?? "");
      setBody(json.message?.text ?? "");
    } catch (e) {
      setPreview(null);
      setFeedback({ tone: "bad", text: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setLoadingPreview(false);
    }
  }, [props.isDemoHunt, props.nowIso]);

  const open = (r: RowView, channel?: Channel) => {
    setActiveId(r.leadId);
    void loadPreview(r.leadId, channel ?? channelOf(r));
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const post = async (url: string, payload: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  };

  const sendSelected = async () => {
    setBusy(true);
    setFeedback(null);
    const items = [...selected].map((leadId) => ({ leadId, channel: "email" as const, ...(edited[leadId] ?? {}) }));
    const { ok, json } = await post("/api/outreach/send", { items, huntId: props.huntId });
    setBusy(false);
    if (!ok) return setFeedback({ tone: "bad", text: json.error ?? "No se pudo procesar el lote" });
    const enq = json.enqueued as { status: string }[];
    const q = json.queue as { sent: number; simulated: number; deferred: number; blocked: number; failed: number } | null;
    setSelected(new Set());
    setFeedback({
      tone: "ok",
      text: `${enq.filter((e) => e.status === "queued").length} en cola, ${enq.filter((e) => e.status === "blocked").length} bloqueados al encolar${q ? ` · cola: ${q.sent} enviados, ${q.simulated} simulados, ${q.deferred} esperan ventana, ${q.blocked} bloqueados, ${q.failed} con error` : ""}.`,
    });
    router.refresh();
  };

  const processNow = async () => {
    setBusy(true);
    const { ok, json } = await post("/api/outreach/send", { items: [], huntId: props.huntId });
    setBusy(false);
    setFeedback(ok ? { tone: "ok", text: `Cola procesada: ${json.queue.sent} enviados, ${json.queue.simulated} simulados, ${json.queue.deferred} esperan ventana.` } : { tone: "bad", text: json.error ?? "Error" });
    router.refresh();
  };

  const queueActive = async () => {
    if (!active) return;
    setBusy(true);
    const { ok, json } = await post("/api/outreach/send", {
      items: [{ leadId: active.leadId, channel: "email", subject, body }],
      huntId: props.huntId,
    });
    setBusy(false);
    if (!ok) return setFeedback({ tone: "bad", text: json.error ?? "Error" });
    const e = json.enqueued[0] as { status: string; blocks: Block[] };
    setFeedback(
      e.status === "blocked"
        ? { tone: "bad", text: `Bloqueado: ${e.blocks.map((b) => b.message).join(" ")}` }
        : { tone: "ok", text: sendEnabled ? "Mensaje procesado." : "Mensaje simulado: no salió nada." },
    );
    router.refresh();
  };

  const markSent = async () => {
    if (!active) return;
    setBusy(true);
    const { ok, json } = await post("/api/outreach/assisted", { leadId: active.leadId, subject, body, minutes: Number(minutes.replace(",", ".")), ...(note ? { note } : {}) });
    setBusy(false);
    if (!ok) return setFeedback({ tone: "bad", text: json.error ?? json.blocks?.map((b: Block) => b.message).join(" ") ?? "No se pudo registrar" });
    setFeedback({ tone: "ok", text: `Registrado${json.status === "simulated" ? " como práctica (SEND_ENABLED=false)" : ""}. Costo humano: US$ ${Number(json.costUsd).toFixed(2)}.` });
    router.refresh();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setFeedback({ tone: "bad", text: "No se pudo copiar; selecciona el texto manualmente." });
    }
  };

  const saveEdit = () => {
    if (active) setEdited((m) => ({ ...m, [active.leadId]: { subject, body } }));
    setFeedback({ tone: "ok", text: "Edición guardada para el envío por lote." });
  };

  const channel = preview?.channel ?? null;
  const isForm = channel === "web_form";
  const safeFormUrl = active?.formUrl && /^https?:\/\//i.test(active.formUrl) ? active.formUrl : null;
  const minutesNum = Number(minutes.replace(",", "."));
  const allEligibleSelected = eligible.length > 0 && eligible.every((r) => selected.has(r.leadId));
  const queuedCount = queue.filter((q) => q.status === "queued").length;

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-2 text-sm text-faro-text-3">
            <span aria-hidden className="size-2.5 rounded-full bg-faro-accent" />
            <span className="font-display font-semibold text-white">Faro</span> · Búsqueda {props.isDemoHunt ? "de demostración" : props.huntId.slice(0, 8)}
          </p>
          <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Contacto</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {props.isDemoHunt && <Chip tone="wait">Datos demo</Chip>}
          <span data-testid="window-state">
            <Chip tone={props.window.allowed ? "ok" : "wait"}>
              {props.window.allowed ? "Ventana abierta" : `Ventana cerrada${props.window.nextAllowedAt ? ` · abre ${fmtTime(props.window.nextAllowedAt)}` : ""}`}
            </Chip>
          </span>
        </div>
      </header>

      {sendEnabled ? (
        <div role="status" data-testid="send-banner" className="rounded-card border border-[var(--faro-danger)]/60 bg-faro-surface-1 px-4 py-3 text-sm">
          <strong className="text-[var(--faro-danger)]">SEND_ENABLED=true:</strong> los envíos por correo salen de verdad, solo dentro de la ventana y sin suprimidos.
        </div>
      ) : (
        <div role="status" data-testid="send-banner" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-faro-accent/40 bg-faro-surface-1 px-4 py-3 text-sm">
          <code className="rounded bg-faro-surface-2 px-2 py-0.5 font-mono text-xs text-faro-accent">SEND_ENABLED=false</code>
          <span>Los envíos se simulan: el flujo corre completo, se registra, pero no sale ningún mensaje.</span>
        </div>
      )}

      {feedback && (
        <p role="status" data-testid="feedback" className={cn("rounded-card border px-4 py-2.5 text-sm", feedback.tone === "ok" ? "border-faro-accent/40 text-white" : "border-[var(--faro-danger)]/50 text-[var(--faro-danger)]")}>
          {feedback.text}
        </p>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <section aria-label="Leads" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--faro-accent)]"
                checked={allEligibleSelected}
                disabled={eligible.length === 0}
                onChange={() => setSelected(allEligibleSelected ? new Set() : new Set(eligible.map((r) => r.leadId)))}
              />
              Seleccionar todos los aptos ({eligible.length})
            </label>
            <button
              type="button"
              data-testid="send-selected"
              disabled={busy || selected.size === 0}
              onClick={sendSelected}
              className={cn(btn, "bg-faro-accent text-[var(--faro-accent-ink)]")}
            >
              {busy ? "Procesando…" : `${sendEnabled ? "Encolar y enviar" : "Encolar y simular"} ${selected.size || ""}`.trim()}
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-card border border-dashed border-border p-8 text-center">
              <p className="font-display text-lg font-semibold">Aún no hay leads del perfil en esta búsqueda</p>
              <p className="mt-1 text-sm text-faro-text-2">Cuando la búsqueda termine y el scoring marque leads con encaje, aparecerán aquí para contactarlos.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="lead-list">
              {rows.map((r) => {
                const ch = channelOf(r);
                const isActive = r.leadId === activeId;
                const canPick = selectable(r);
                return (
                  <li
                    key={r.leadId}
                    data-testid="lead-row"
                    className={cn("rounded-card border bg-faro-surface-1 p-3 transition-colors", isActive ? "border-faro-accent" : "border-border hover:border-white/30")}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${r.name}`}
                        className="mt-1 size-4 accent-[var(--faro-accent)] disabled:opacity-30"
                        disabled={!canPick}
                        checked={selected.has(r.leadId)}
                        onChange={() => toggle(r.leadId)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <button type="button" onClick={() => open(r)} className="break-words text-left font-medium hover:text-faro-accent focus-visible:text-faro-accent [overflow-wrap:anywhere]">
                            {r.name}
                          </button>
                          {r.isDemo && <Chip tone="mute">Demo</Chip>}
                          {r.assessment.unverifiedLegal && <Chip tone="mute">Jurídica por verificar</Chip>}
                        </div>
                        <p className="mt-0.5 text-xs text-faro-text-3">
                          {r.city ?? "—"} · {SOURCE_LABEL[r.source] ?? r.source} · encaje {r.fitScore ?? "—"}
                          {r.recipient ? ` · ${r.recipient}` : " · sin contacto"}
                        </p>
                        {blocking(r.assessment).length > 0 && (
                          <p className="mt-1.5 text-xs text-[var(--faro-danger)]">{blocking(r.assessment)[0]!.message}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {r.latest ? <Chip tone={r.latest.status === "blocked" || r.latest.status === "failed" ? "bad" : "mute"}>{STATUS_LABEL[r.latest.status] ?? r.latest.status}</Chip> : verdict(r.assessment, sendEnabled)}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 pl-7">
                      <label className="sr-only" htmlFor={`ch-${r.leadId}`}>
                        Canal para {r.name}
                      </label>
                      <select
                        id={`ch-${r.leadId}`}
                        className="h-8 rounded-button border border-border bg-faro-surface-2 px-2 text-xs"
                        value={ch ?? ""}
                        disabled={r.options.length === 0}
                        onChange={(e) => {
                          const v = e.target.value as Channel;
                          setOverride((o) => ({ ...o, [r.leadId]: v }));
                          if (isActive) void loadPreview(r.leadId, v);
                        }}
                      >
                        {r.options.length === 0 && <option value="">Sin canal</option>}
                        {r.options.map((o) => (
                          <option key={o.channel} value={o.channel}>
                            {CHANNEL_LABEL[o.channel]}
                            {o.usable ? "" : " (no apto)"}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => open(r)} className="h-8 rounded-button border border-border px-3 text-xs hover:border-faro-accent hover:text-faro-accent">
                        {ch === "web_form" ? "Modo asistido" : "Vista previa"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-4">
          <section aria-label="Vista previa" aria-live="polite" className="rounded-card border border-border bg-faro-surface-1 p-4" data-testid="preview-panel">
            {!active ? (
              <div className="py-8 text-center">
                <p className="font-display text-lg font-semibold">Elige un lead</p>
                <p className="mt-1 text-sm text-faro-text-2">Verás el mensaje que Faro redactó, podrás editarlo y los bloqueos de cumplimiento se actualizan al instante.</p>
              </div>
            ) : loadingPreview ? (
              <div aria-busy="true" className="flex flex-col gap-3">
                <div className="h-5 w-2/3 animate-pulse rounded bg-faro-surface-2" />
                <div className="h-40 animate-pulse rounded-card bg-faro-surface-2" />
              </div>
            ) : !preview ? (
              <p className="text-sm text-[var(--faro-danger)]">No hay vista previa. Revisa el aviso de arriba e intenta de nuevo.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold [overflow-wrap:anywhere]">{active.name}</h2>
                    <p className="text-xs text-faro-text-3">
                      {channel ? CHANNEL_LABEL[channel] : "Sin canal"} · {preview.recipient ?? "sin destinatario"}
                    </p>
                  </div>
                  {verdict(preview.assessment, sendEnabled)}
                </div>

                <ul data-testid="blocks" className="flex flex-col gap-1.5">
                  {preview.assessment.blocks.length === 0 && (
                    <li className="text-sm text-faro-text-2">Sin bloqueos de cumplimiento. {preview.assessment.note ?? ""}</li>
                  )}
                  {preview.assessment.blocks.map((b) => (
                    <li key={b.rule} className={cn("rounded-button border px-3 py-2 text-sm", b.rule === "outside_window" ? "border-white/25" : "border-[var(--faro-danger)]/40")}>
                      <strong className={b.rule === "outside_window" ? "text-white" : "text-[var(--faro-danger)]"}>{RULE_LABEL[b.rule] ?? b.rule}.</strong>{" "}
                      <span className="text-faro-text-2">{b.message}</span>
                    </li>
                  ))}
                  {preview.assessment.unverifiedLegal && (
                    <li className="rounded-button border border-border px-3 py-2 text-sm text-faro-text-2">
                      <strong className="text-white">Por verificar.</strong> La naturaleza jurídica sale de una heurística, no de RUES/REPS.
                    </li>
                  )}
                </ul>

                {preview.message && (
                  <>
                    {preview.isMockAi && <p className="text-xs text-faro-text-3">Redactado con IA en modo demo (mock).</p>}
                    {channel === "email" && (
                      <div>
                        <label htmlFor="subject" className="mb-1 block text-xs text-faro-text-3">
                          Asunto
                        </label>
                        <input id="subject" className={inputCls} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
                      </div>
                    )}
                    <div>
                      <label htmlFor="body" className="mb-1 block text-xs text-faro-text-3">
                        Mensaje (editable; debe conservar el enlace de baja)
                      </label>
                      <textarea id="body" data-testid="body" rows={14} className={cn(inputCls, "min-h-56 max-h-[32rem] overflow-y-auto font-mono text-xs leading-relaxed [field-sizing:content]")} value={body} onChange={(e) => setBody(e.target.value)} />
                    </div>

                    {isForm ? (
                      <div className="flex flex-col gap-3 rounded-card border border-border bg-faro-surface-2 p-3" data-testid="assisted">
                        <p className="text-sm text-faro-text-2">Modo asistido: lo envías tú. Copia el texto, abre el formulario, pégalo y marca como enviado con el tiempo que te tomó.</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={copy} className={cn(btn, "border border-border hover:border-faro-accent")}>
                            {copied ? "Copiado" : "Copiar texto"}
                          </button>
                          {safeFormUrl ? (
                            <a href={safeFormUrl} target="_blank" rel="noopener noreferrer" className={cn(btn, "border border-border hover:border-faro-accent")}>
                              Abrir formulario
                            </a>
                          ) : (
                            <span className="self-center text-xs text-faro-text-3">Sin formulario válido</span>
                          )}
                        </div>
                        <div className="grid grid-cols-[7rem_1fr] items-end gap-3">
                          <div>
                            <label htmlFor="minutes" className="mb-1 block text-xs text-faro-text-3">
                              Minutos
                            </label>
                            <input id="minutes" inputMode="decimal" className={inputCls} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
                          </div>
                          <div>
                            <label htmlFor="note" className="mb-1 block text-xs text-faro-text-3">
                              Nota (opcional)
                            </label>
                            <input id="note" className={inputCls} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                          </div>
                        </div>
                        <button
                          type="button"
                          data-testid="mark-sent"
                          disabled={busy || !preview.assessment.allowed || !(minutesNum >= 0.5)}
                          onClick={markSent}
                          className={cn(btn, "bg-faro-accent text-[var(--faro-accent-ink)]")}
                        >
                          Marcar enviado · US$ {(Number.isFinite(minutesNum) ? minutesNum * props.humanRate : 0).toFixed(2)} de tiempo
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={saveEdit} className={cn(btn, "border border-border hover:border-faro-accent")}>
                          Guardar edición
                        </button>
                        <button
                          type="button"
                          data-testid="queue-one"
                          disabled={busy || blocking(preview.assessment).length > 0 || channel !== "email"}
                          onClick={queueActive}
                          className={cn(btn, "bg-faro-accent text-[var(--faro-accent-ink)]")}
                        >
                          {sendEnabled ? "Encolar y enviar" : "Encolar y simular"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          <section aria-label="Cola de envío" className="rounded-card border border-border bg-faro-surface-1 p-4" data-testid="queue-panel">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Cola de envío</h2>
              <button type="button" disabled={busy || queuedCount === 0} onClick={processNow} className={cn(btn, "h-8 border border-border px-3 text-xs hover:border-faro-accent")}>
                Procesar ahora
              </button>
            </div>
            <p className="mt-1 text-xs text-faro-text-3">
              Lun–vie 7:00–19:00 · sáb 8:00–15:00 (Bogotá) · nunca domingo ni festivos · lotes de 20. {props.window.allowed ? "" : props.window.reason + "."}
            </p>
            {queue.length === 0 ? (
              <p className="py-6 text-center text-sm text-faro-text-2">La cola está vacía. Selecciona leads y encólalos.</p>
            ) : (
              <ul className="mt-3 flex max-h-72 flex-col gap-1.5 overflow-y-auto" data-testid="queue-list">
                {queue.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 rounded-button bg-faro-surface-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate">{q.company}</span>
                      <span className="block text-xs text-faro-text-3">
                        {CHANNEL_LABEL[q.channel as Channel] ?? q.channel}
                        {q.rule ? ` · ${RULE_LABEL[q.rule.split(",")[0]!] ?? q.rule}` : ""}
                      </span>
                    </span>
                    <Chip tone={q.status === "blocked" || q.status === "failed" ? "bad" : q.status === "queued" ? "wait" : q.status === "sent" ? "ok" : "mute"}>{STATUS_LABEL[q.status] ?? q.status}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
