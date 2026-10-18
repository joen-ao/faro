"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ReplyDialog } from "./reply-dialog";

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

const DONE_STATUSES = new Set(["sent", "simulated", "delivered"]);
const CONTACTED_LEAD = new Set(["contacted", "responded", "qualified", "opted_out"]);
const isContacted = (r: RowView) => CONTACTED_LEAD.has(r.status) || (r.latest !== null && ["sending", "sent", "simulated", "delivered"].includes(r.latest.status));
const isBlocked = (r: RowView) => !isContacted(r) && blocking(r.assessment).length > 0;

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent";
const checkCls = "size-[18px] cursor-pointer accent-[var(--faro-accent)] disabled:cursor-not-allowed " + focusRing;
const inputCls =
  "w-full rounded-button border border-border bg-faro-surface-2 px-3 py-2 text-sm text-white placeholder:text-faro-text-3 focus-visible:border-faro-accent focus-visible:outline-none";
/** Fields drawn on the white "paper" of the email preview: dark text, dark focus ring (lime has no contrast on white). */
const paperInput =
  "mt-0.5 block w-full rounded-[6px] border border-transparent bg-transparent px-1.5 py-1 text-sm text-[#1a1a1c] hover:border-black/15 focus-visible:border-[#1a1a1c] focus-visible:outline-none";
const btn =
  "inline-flex h-10 items-center justify-center rounded-button px-4 text-sm font-semibold transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

export function OutreachClient(props: {
  huntId: string;
  huntTitle: string;
  isDemoHunt: boolean;
  sendEnabled: boolean;
  whatsappEnabled: boolean;
  humanRate: number;
  nowIso: string;
  window: { allowed: boolean; reason: string; nextAllowedAt: string | null; policy?: "ley2300" | "extendida" | "custom"; label?: string };
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
  const [replyFor, setReplyFor] = useState<RowView | null>(null);
  const [view, setView] = useState<"all" | "blocked" | "contacted">("all");

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

  const visibleRows = view === "blocked" ? rows.filter(isBlocked) : view === "contacted" ? rows.filter(isContacted) : rows;
  const tabs = [
    { id: "all" as const, label: "Del perfil", n: rows.length },
    { id: "blocked" as const, label: "Bloqueados", n: rows.filter(isBlocked).length },
    { id: "contacted" as const, label: "Contactados", n: rows.filter(isContacted).length },
  ];
  const processed = queue.filter((q) => DONE_STATUSES.has(q.status)).length;
  const queueTotal = queue.filter((q) => q.status !== "blocked" && q.status !== "failed" && q.status !== "draft").length;
  const pct = queueTotal ? Math.round((processed / queueTotal) * 100) : 0;
  const cols = "md:grid-cols-[28px_minmax(0,1.5fr)_minmax(0,1.15fr)_52px_minmax(0,1.25fr)]";

  return (
    <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 pt-6 pb-16 sm:px-6 lg:pt-7 lg:pb-20">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <nav aria-label="Migas" className="text-sm text-faro-text-3">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/app/hunts" className={cn(focusRing, "rounded text-faro-text-3 underline-offset-2 hover:text-white hover:underline")}>
                  Búsquedas
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="min-w-0 [overflow-wrap:anywhere]">
                <Link href={`/app/hunts/${props.isDemoHunt ? "demo" : props.huntId}`} className={cn(focusRing, "rounded text-faro-text-3 underline-offset-2 hover:text-white hover:underline")}>
                  {props.huntTitle}
                </Link>
                {props.isDemoHunt && <span className="ml-2 rounded-full border border-dashed border-white/40 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white">DEMO</span>}
              </li>
            </ol>
          </nav>
          <h1 className="mt-1.5 font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Contacto</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            data-testid="window-state"
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-bold",
              props.window.allowed ? "bg-faro-accent/[0.12] text-faro-accent" : "bg-white/[0.08] text-white",
            )}
          >
            <span aria-hidden className={cn("size-2 rounded-full", props.window.allowed ? "bg-faro-accent" : "bg-white/60")} />
            {props.window.allowed ? "Ventana abierta" : `Ventana cerrada${props.window.nextAllowedAt ? ` · abre ${fmtTime(props.window.nextAllowedAt)}` : ""}`}
          </span>
          <Link href="/app/settings/envio" className={cn(focusRing, "rounded text-sm text-faro-accent underline-offset-2 hover:underline")}>
            Cambiar horario
          </Link>
        </div>
      </header>

      {sendEnabled ? (
        <div role="status" data-testid="send-banner" className="rounded-[12px] border border-faro-accent/35 bg-faro-accent/[0.06] px-4 py-3.5 text-sm leading-relaxed">
          <strong className="text-faro-accent">Envío real activo (SEND_ENABLED=true).</strong> Un mensaje por empresa, solo buzones genéricos, dentro de la ventana, sin suprimidos y con enlace de baja.
        </div>
      ) : (
        <div role="status" data-testid="send-banner" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[12px] border border-white/20 bg-white/[0.04] px-4 py-3.5 text-sm leading-relaxed">
          <code className="rounded bg-faro-surface-2 px-2 py-0.5 font-mono text-xs text-faro-accent">SEND_ENABLED=false</code>
          <span>Los envíos se simulan: el flujo corre completo, se registra, pero no sale ningún mensaje.</span>
        </div>
      )}

      {feedback && (
        <p role="status" data-testid="feedback" className={cn("rounded-[12px] border px-4 py-2.5 text-sm", feedback.tone === "ok" ? "border-faro-accent/40 text-white" : "border-[var(--faro-danger)]/50 text-[var(--faro-danger)]")}>
          {feedback.text}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section aria-label="Leads" className="min-w-0 overflow-hidden rounded-card border border-white/10 bg-faro-surface-1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-4 sm:px-5">
            <div role="group" aria-label="Filtrar leads" className="flex flex-wrap gap-1.5 text-sm">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={view === t.id}
                  onClick={() => setView(t.id)}
                  className={cn(
                    focusRing,
                    "h-[34px] rounded-[8px] border px-3 tabular-nums transition-colors",
                    view === t.id ? "border-faro-accent text-white" : "border-white/[0.14] text-faro-text-3 hover:text-white",
                  )}
                >
                  {t.label} · {t.n}
                </button>
              ))}
            </div>
            <button
              type="button"
              data-testid="send-selected"
              disabled={busy || selected.size === 0}
              onClick={sendSelected}
              className={cn(btn, focusRing, "bg-faro-accent font-bold text-[var(--faro-accent-ink)]")}
            >
              {busy ? "Procesando…" : `${sendEnabled ? "Encolar" : "Encolar y simular"} ${selected.size || ""} ${selected.size === 1 ? "seleccionado" : "seleccionados"}`.replace(/\s+/g, " ").trim()}
            </button>
          </div>

          {rows.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-display text-lg font-semibold">Aún no hay leads del perfil en esta búsqueda</p>
              <p className="mt-1 text-sm text-faro-text-2">Cuando la búsqueda termine y el scoring marque leads con encaje, aparecerán aquí para contactarlos.</p>
            </div>
          ) : (
            <>
              <div className={cn("grid grid-cols-[28px_minmax(0,1fr)] items-center gap-x-3 px-4 py-3 text-sm text-faro-text-3 sm:px-5", cols)}>
                <input
                  type="checkbox"
                  id="select-all"
                  className={checkCls}
                  checked={allEligibleSelected}
                  disabled={eligible.length === 0}
                  onChange={() => setSelected(allEligibleSelected ? new Set() : new Set(eligible.map((r) => r.leadId)))}
                />
                <label htmlFor="select-all" className="cursor-pointer">
                  <span className="md:sr-only">Seleccionar todos los aptos ({eligible.length})</span>
                  <span aria-hidden className="hidden md:inline">Empresa</span>
                </label>
                <span aria-hidden className="hidden md:block">Canal</span>
                <span aria-hidden className="hidden md:block">Puntaje</span>
                <span aria-hidden className="hidden md:block">Cumplimiento</span>
              </div>
              {visibleRows.length === 0 ? (
                <p className="border-t border-white/[0.06] px-5 py-10 text-center text-sm text-faro-text-2">{view === "blocked" ? "Ningún lead está bloqueado por cumplimiento." : "Aún no has contactado a ninguna empresa de esta búsqueda."}</p>
              ) : (
                <ul className="flex flex-col" data-testid="lead-list">
                  {visibleRows.map((r) => {
                    const ch = channelOf(r);
                    const isActive = r.leadId === activeId;
                    const canPick = selectable(r);
                    const hard = blocking(r.assessment);
                    return (
                      <li
                        key={r.leadId}
                        data-testid="lead-row"
                        className={cn(
                          "grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-white/[0.06] px-4 py-3.5 transition-colors sm:px-5",
                          cols,
                          isActive ? "bg-faro-accent/[0.07] shadow-[inset_3px_0_0_var(--faro-accent)]" : selected.has(r.leadId) ? "bg-faro-accent/[0.04]" : "hover:bg-white/[0.02]",
                        )}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar ${r.name}`}
                          className={cn(checkCls, "mt-0.5 disabled:opacity-30")}
                          disabled={!canPick}
                          checked={selected.has(r.leadId)}
                          onChange={() => toggle(r.leadId)}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <button type="button" onClick={() => open(r)} className={cn(focusRing, "rounded break-words text-left font-medium hover:text-faro-accent [overflow-wrap:anywhere]")}>
                              {r.name}
                            </button>
                            {r.isDemo && <Chip tone="mute">Demo</Chip>}
                            {r.assessment.unverifiedLegal && <Chip tone="mute">Jurídica por verificar</Chip>}
                          </div>
                          <p className="mt-0.5 text-xs text-faro-text-3">
                            {r.city ?? "—"} · {SOURCE_LABEL[r.source] ?? r.source}
                            <span className="md:hidden"> · encaje {r.fitScore ?? "—"}</span>
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <button type="button" onClick={() => open(r)} className={cn(focusRing, "rounded text-faro-accent underline-offset-2 hover:underline")}>
                              {ch === "web_form" ? "Modo asistido" : "Vista previa"}
                            </button>
                            {r.status === "responded" ? (
                              <Chip tone="ok">Respondió</Chip>
                            ) : (
                              r.status !== "opted_out" && (
                                <button type="button" data-testid="mark-reply" onClick={() => setReplyFor(r)} className={cn(focusRing, "rounded text-faro-text-2 underline-offset-2 hover:text-white hover:underline")}>
                                  Marcar respondió
                                </button>
                              )
                            )}
                          </div>
                        </div>
                        <div className="col-start-2 flex min-w-0 flex-col gap-1.5 md:col-start-auto">
                          <span className={cn("text-sm [overflow-wrap:anywhere]", r.recipient ? "text-white" : "text-faro-text-3")}>{r.recipient ?? "sin contacto"}</span>
                          <label className="sr-only" htmlFor={`ch-${r.leadId}`}>
                            Canal para {r.name}
                          </label>
                          <select
                            id={`ch-${r.leadId}`}
                            className={cn(focusRing, "h-8 w-full max-w-[13rem] rounded-[8px] border border-white/[0.14] bg-faro-surface-2 px-2 text-xs")}
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
                        </div>
                        <span className={cn("hidden font-display text-[15px] tabular-nums md:block", hard.length === 0 && (r.fitScore ?? 0) >= 60 ? "font-bold text-faro-accent" : "text-white")}>{r.fitScore ?? "—"}</span>
                        <div className="col-start-2 flex min-w-0 flex-col items-start gap-1.5 md:col-start-auto">
                          {r.latest ? <Chip tone={r.latest.status === "blocked" || r.latest.status === "failed" ? "bad" : r.latest.status === "queued" ? "wait" : "mute"}>{STATUS_LABEL[r.latest.status] ?? r.latest.status}</Chip> : verdict(r.assessment, sendEnabled)}
                          {hard.length > 0 && <p className="text-xs leading-snug text-[var(--faro-danger)]">{hard[0]!.message}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
          <section aria-label="Vista previa" aria-live="polite" className="rounded-card border border-white/10 bg-faro-surface-1 p-5" data-testid="preview-panel">
            {!active ? (
              <div className="py-6 text-center">
                <h2 className="font-display text-lg font-semibold">Vista previa</h2>
                <p className="mt-1 text-sm text-faro-text-2">Elige un lead: verás el mensaje que Faro redactó, podrás editarlo y los bloqueos de cumplimiento se actualizan al instante.</p>
              </div>
            ) : loadingPreview ? (
              <div aria-busy="true" className="flex flex-col gap-3">
                <div className="h-5 w-2/3 animate-pulse rounded bg-faro-surface-2" />
                <div className="h-40 animate-pulse rounded-[12px] bg-faro-surface-2" />
              </div>
            ) : !preview ? (
              <p className="text-sm text-[var(--faro-danger)]">No hay vista previa. Revisa el aviso de arriba e intenta de nuevo.</p>
            ) : (
              <div className="flex flex-col gap-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="font-display text-lg font-semibold [overflow-wrap:anywhere]">Vista previa · {active.name}</h2>
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
                    <li key={b.rule} className={cn("rounded-[10px] border px-3 py-2 text-sm", b.rule === "outside_window" ? "border-white/25" : "border-[var(--faro-danger)]/40")}>
                      <strong className={b.rule === "outside_window" ? "text-white" : "text-[var(--faro-danger)]"}>{RULE_LABEL[b.rule] ?? b.rule}.</strong>{" "}
                      <span className="text-faro-text-2">{b.message}</span>
                    </li>
                  ))}
                  {preview.assessment.unverifiedLegal && (
                    <li className="rounded-[10px] border border-white/[0.14] px-3 py-2 text-sm text-faro-text-2">
                      <strong className="text-white">Por verificar.</strong> La naturaleza jurídica sale de una heurística, no de RUES/REPS.
                    </li>
                  )}
                </ul>

                {preview.message && (
                  <>
                    {preview.isMockAi && <p className="text-xs text-faro-text-3">Redactado con IA en modo demo (mock).</p>}
                    <div className="rounded-[12px] bg-white p-4 text-[#1a1a1c] sm:p-[18px]">
                      {channel === "email" && (
                        <div className="mb-3">
                          <label htmlFor="subject" className="block text-xs text-[#5c5c62]">
                            Asunto
                          </label>
                          <input id="subject" className={cn(paperInput, "font-bold")} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />
                        </div>
                      )}
                      <label htmlFor="body" className="block text-xs text-[#5c5c62]">
                        Mensaje (editable; debe conservar el enlace de baja)
                      </label>
                      <textarea id="body" data-testid="body" rows={14} className={cn(paperInput, "min-h-56 max-h-[30rem] resize-y overflow-y-auto leading-[1.55] [field-sizing:content]")} value={body} onChange={(e) => setBody(e.target.value)} />
                    </div>

                    {isForm ? (
                      <div className="flex flex-col gap-3 rounded-[12px] border border-white/[0.14] bg-faro-surface-2 p-3.5" data-testid="assisted">
                        <p className="text-sm text-faro-text-2">Modo asistido: lo envías tú. Copia el texto, abre el formulario, pégalo y marca como enviado con el tiempo que te tomó.</p>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={copy} className={cn(btn, focusRing, "border border-white/[0.14] hover:border-faro-accent")}>
                            {copied ? "Copiado" : "Copiar texto"}
                          </button>
                          {safeFormUrl ? (
                            <a href={safeFormUrl} target="_blank" rel="noopener noreferrer" className={cn(btn, focusRing, "border border-white/[0.14] hover:border-faro-accent")}>
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
                          className={cn(btn, focusRing, "bg-faro-accent font-bold text-[var(--faro-accent-ink)]")}
                        >
                          Marcar enviado · US$ {(Number.isFinite(minutesNum) ? minutesNum * props.humanRate : 0).toFixed(2)} de tiempo
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={saveEdit} className={cn(btn, focusRing, "border border-white/[0.14] hover:border-faro-accent")}>
                          Guardar edición
                        </button>
                        <button
                          type="button"
                          data-testid="queue-one"
                          disabled={busy || blocking(preview.assessment).length > 0 || channel !== "email"}
                          onClick={queueActive}
                          className={cn(btn, focusRing, "bg-faro-accent font-bold text-[var(--faro-accent-ink)]")}
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

          <section aria-labelledby="queue-title" className="rounded-card border border-white/10 bg-faro-surface-1 p-5" data-testid="queue-panel">
            <div className="flex items-center justify-between gap-3">
              <h2 id="queue-title" className="font-display text-lg font-semibold">
                Cola de envío
              </h2>
              <button type="button" disabled={busy || queuedCount === 0} onClick={processNow} className={cn(btn, focusRing, "bg-faro-accent font-bold text-[var(--faro-accent-ink)]")}>
                Procesar ahora
              </button>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-faro-text-3">
              {queuedCount} en cola · lotes de 20 · {props.window.label ?? "Lun–vie 7:00–19:00 · sáb 8:00–15:00 (Bogotá) · nunca domingo ni festivos"}
              {props.window.allowed ? "" : ` · ${props.window.reason}.`}
            </p>
            <div
              className="mt-3.5 h-2 overflow-hidden rounded-full bg-faro-surface-2"
              role="progressbar"
              aria-label="Mensajes procesados de la cola"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-valuetext={`${processed} de ${queueTotal} procesados`}
            >
              <div className="h-full rounded-full bg-faro-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-faro-text-3 tabular-nums">
              {processed} de {queueTotal} procesados
            </p>
            {queue.length === 0 ? (
              <p className="py-6 text-center text-sm text-faro-text-2">La cola está vacía. Selecciona leads y encólalos.</p>
            ) : (
              <ul className="mt-3 flex max-h-72 flex-col gap-1.5 overflow-y-auto" data-testid="queue-list">
                {queue.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-2 rounded-[10px] bg-faro-surface-2 px-3 py-2.5 text-sm">
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
        </aside>
      </div>
    {replyFor && (
        <ReplyDialog
          leadId={replyFor.leadId}
          companyName={replyFor.name}
          initialChannel={(channelOf(replyFor) ?? "email") as Channel}
          onClose={() => setReplyFor(null)}
          onDone={(text) => {
            setReplyFor(null);
            setFeedback({ tone: "ok", text });
            router.refresh();
          }}
        />
      )}
    </main>
  );
}
