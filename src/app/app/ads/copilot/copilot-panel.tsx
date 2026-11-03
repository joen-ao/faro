"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowRight, Check, Lightbulb, Pencil, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FORMAT_HINTS, FORMAT_LABELS, type FormatHint } from "@/features/copilot/knowledge";
import { allowedPriceNumbers, lintAd, type LintIssue } from "@/features/copilot/lint";
import { cn } from "@/lib/utils";
import { MediaPicker, type Media } from "./media-picker";

/* F36 · Copilot: one job, create a campaign with Claude. 1 Describe (chat) · 2 Revisa (brief + ads as they will look) · 3 Crea en pausa. */

interface ServiceOpt {
  id: string;
  name: string;
  price: string | null;
}
type Cta = "LEARN_MORE" | "CONTACT_US" | "SIGN_UP" | "GET_QUOTE";
interface Draft {
  include: boolean;
  angle: string;
  format_hint: FormatHint;
  hook: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: Cta;
  hypothesis: string;
  imageUrl: string;
  media: Media | null;
}
type Msg = { kind: "ok" | "error"; text: string; lines?: string[] } | null;
type Turn = { role: "user" | "assistant"; text: string; lines?: string[] };
type BriefState = { serviceId: string; url: string; dailyBudget: string; geo: string; audience: string; notes: string; count: string };
type Created = { ads: number; mock: boolean; name: string };
const COPY_FIELDS = ["angle", "format_hint", "hook", "primaryText", "headline", "description", "cta", "hypothesis"] as const;

const field = "w-full rounded-button border border-border bg-faro-surface-2 px-3 text-sm text-foreground placeholder:text-faro-text-3";
const label = "mb-1 block text-xs text-faro-text-2";
const CTAS: { v: Cta; l: string }[] = [
  { v: "LEARN_MORE", l: "Más información" },
  { v: "CONTACT_US", l: "Contáctanos" },
  { v: "GET_QUOTE", l: "Solicitar cotización" },
  { v: "SIGN_UP", l: "Registrarte" },
];
const ctaLabel = (c: Cta) => CTAS.find((x) => x.v === c)?.l ?? c;
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function Tag({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", accent ? "border-[var(--faro-border-active)] text-faro-accent" : "border-border text-faro-text-3")}>
      {children}
    </span>
  );
}

const STEPS = ["Describe", "Revisa", "Crea en pausa"] as const;

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Pasos" className="flex items-center gap-x-1.5 text-[13px] sm:gap-x-2 sm:text-sm">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={s} aria-current={current ? "step" : undefined} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className={cn("h-px w-3 sm:w-10", done || current ? "bg-faro-accent/60" : "bg-border")} />}
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums",
                current ? "bg-faro-accent text-faro-accent-ink" : done ? "bg-faro-accent/15 text-faro-accent" : "border border-border text-faro-text-3",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
            </span>
            <span className={cn("whitespace-nowrap", current ? "font-semibold text-white" : done ? "text-faro-text-2" : "text-faro-text-3")}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function CopilotPanel({
  services,
  prices,
  allowedHosts,
  maxBudget,
  aiMock,
  metaMock,
  hints,
}: {
  services: ServiceOpt[];
  prices: string[];
  allowedHosts: string[];
  maxBudget: number;
  aiMock: boolean;
  metaMock: boolean;
  /** Up to 3 learnings, one line each, so the team writes better briefs. */
  hints: string[];
}) {
  const allowed = useMemo(() => allowedPriceNumbers(prices), [prices]);
  const [busy, setBusy] = useState<"brief" | "propose" | "create" | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [brief, setBrief] = useState<BriefState>({ serviceId: services[0]?.id ?? "", url: "https://www.mokub.co/", dailyBudget: "40000", geo: "bogota", audience: "", notes: "", count: "4" });
  /** Brief text gathered so far while Faro is asking for missing data. */
  const [pendingBrief, setPendingBrief] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chatText, setChatText] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [changed, setChanged] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Set<number>>(new Set());
  const [briefOpen, setBriefOpen] = useState(false);
  const [briefDirty, setBriefDirty] = useState(false);
  const [name, setName] = useState("");
  const [proposedMock, setProposedMock] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  const lints: LintIssue[][] = drafts.map((d) => lintAd(d, allowed));
  const included = drafts.filter((d) => d.include);
  const blocked = drafts.some((d, i) => d.include && lints[i]!.length > 0);
  const mediaPending = included.some((d) => d.media?.state === "uploading" || d.media?.state === "processing");
  const step: 1 | 2 | 3 = created ? 3 : drafts.length ? 2 : 1;
  const thinking = busy === "brief" || busy === "propose" || chatBusy;
  const examples = useMemo(() => {
    const [a, b, c] = [services[0]?.name, services[1]?.name ?? services[0]?.name, services[2]?.name ?? services[0]?.name];
    return [
      a && `${a} para dueños de pymes de servicios en Bogotá, 40 mil al día`,
      b && `${b} para clínicas y consultorios en Colombia, 60 mil al día, a web.mokub.co`,
      c && `${c} para restaurantes en Bogotá que atienden por WhatsApp, 30 mil al día`,
    ].filter((x): x is string => !!x);
  }, [services]);

  function editBrief(patch: Partial<BriefState>) {
    setBrief((b) => ({ ...b, ...patch }));
    setBriefDirty(true);
  }

  function propose(e: FormEvent) {
    e.preventDefault();
    void runPropose(brief);
  }

  async function runPropose(b: BriefState) {
    setBusy("propose");
    setMsg(null);
    setChanged(new Set());
    setEditing(new Set());
    try {
      const res = await fetch("/api/ads/copilot/propose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief: b }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setMsg({ kind: "error", text: data.message ?? "Revisa el brief.", lines: data.issues });
        setBriefOpen(true);
      } else {
        setProposedMock(!!data.mock);
        setDrafts(
          (data.variants as (Omit<Draft, "include" | "description" | "imageUrl"> & { description?: string; imageUrl?: string })[]).map((v) => ({
            ...v,
            include: true,
            description: v.description ?? "",
            imageUrl: v.imageUrl ?? "",
            media: null,
          })),
        );
        setBriefOpen(false);
        setBriefDirty(false);
        const svc = services.find((s) => s.id === b.serviceId);
        setName((n) => n || `Mokub · ${svc?.name ?? "campaña"} · ${b.geo === "bogota" ? "Bogotá" : "CO"}`.slice(0, 100));
      }
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
    } finally {
      setBusy(null);
    }
  }

  /** F33 · one box: without variants a statement builds the brief, otherwise (or with «?») it chats. */
  function ask(e?: FormEvent) {
    e?.preventDefault();
    const text = chatText.trim();
    if (!text || busy !== null || chatBusy) return;
    setChatText("");
    if (drafts.length === 0 && !/\?\s*$/.test(text)) void fromText(text);
    else void sendChat(text);
  }

  /** One sentence -> brief; proposes right away when nothing is missing. */
  async function fromText(answer: string) {
    const text = pendingBrief ? `${pendingBrief}. ${answer}` : answer;
    setBusy("brief");
    setMsg(null);
    setTurns((t) => [...t, { role: "user", text: answer }]);
    try {
      const res = await fetch("/api/ads/copilot/brief", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setTurns((t) => [...t, { role: "assistant", text: data.message ?? "No pude leer la descripción. Prueba con otra frase o llena el brief a mano." }]);
        return;
      }
      const b = data.brief as { serviceId: string | null; url: string; dailyBudget: number | null; geo: string; audience: string | null; notes: string | null; count: number };
      const next: BriefState = {
        serviceId: b.serviceId ?? brief.serviceId,
        url: b.url,
        dailyBudget: b.dailyBudget ? String(b.dailyBudget) : brief.dailyBudget,
        geo: b.geo,
        audience: b.audience ?? brief.audience,
        notes: b.notes ?? brief.notes,
        count: String(b.count),
      };
      setBrief(next);
      const warnings = (data.warnings as string[]) ?? [];
      setPendingBrief(data.question ? text.slice(0, 900) : "");
      if (data.question || warnings.length) {
        setTurns((t) => [...t, { role: "assistant", text: data.question ?? "Revisa esto antes de seguir:", lines: warnings }]);
        return;
      }
      setTurns((t) => [...t, { role: "assistant", text: "Listo, armé el brief. Estoy escribiendo los anuncios…" }]);
      setBusy(null);
      await runPropose(next);
    } catch {
      setTurns((t) => [...t, { role: "assistant", text: "No hay conexión con el servidor." }]);
    } finally {
      setBusy(null);
    }
  }

  /** F33 · chat: edits copy (re-linted server-side) or answers questions; never acts on Meta. */
  async function sendChat(message: string) {
    setChatBusy(true);
    const history = turns.map(({ role, text }) => ({ role, text: text.slice(0, 1000) }));
    setTurns((t) => [...t, { role: "user", text: message }]);
    try {
      const variants = drafts.map((d) => Object.fromEntries(COPY_FIELDS.map((k) => [k, d[k]])));
      const res = await fetch("/api/ads/copilot/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history, brief: drafts.length ? brief : null, variants }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setTurns((t) => [...t, { role: "assistant", text: data.message ?? "Revisa los anuncios: hay un campo que no cumple el formato.", lines: data.issues }]);
        return;
      }
      const updated = data.variants as Record<(typeof COPY_FIELDS)[number], string | undefined>[];
      const idx = new Set<number>(data.changed as number[]);
      setDrafts((ds) => ds.map((d, i) => (idx.has(i) ? { ...d, ...Object.fromEntries(COPY_FIELDS.map((k) => [k, updated[i]?.[k] ?? (k === "description" ? "" : d[k])])) } : d)));
      setChanged(idx);
      setTurns((t) => [...t, { role: "assistant", text: data.reply, lines: data.rejected?.length ? data.rejected : undefined }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", text: "No hay conexión con el servidor." }]);
    } finally {
      setChatBusy(false);
    }
  }

  async function create() {
    setBusy("create");
    setMsg(null);
    try {
      const res = await fetch("/api/ads/copilot/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          brief,
          variants: included.map((d) => {
            const ready = d.media?.state === "ready" ? d.media : null;
            return { ...d, include: undefined, media: undefined, imageUrl: ready ? "" : d.imageUrl, imageHash: ready?.imageHash, videoId: ready?.videoId };
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const lines = data.issues ?? (data.lint as { index: number; issues: LintIssue[] }[] | undefined)?.flatMap((l) => l.issues.map((i) => `Anuncio ${l.index + 1} · ${i.message}`));
        setMsg({ kind: "error", text: data.message ?? "No se pudo crear la campaña.", lines });
      } else {
        setCreated({ ads: data.created.ads.length, mock: !!data.mock, name });
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
    } finally {
      setBusy(null);
    }
  }

  function restart() {
    setCreated(null);
    setDrafts([]);
    setTurns([]);
    setPendingBrief("");
    setName("");
    setChanged(new Set());
    setMsg(null);
  }

  const set = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const toggleEdit = (i: number) => setEditing((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])));

  /* ---------- shared pieces ---------- */

  const thread = turns.length > 0 && (
    <ol className="space-y-3" aria-live="polite">
      {turns.map((t, k) => (
        <li key={k} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
          <div className={cn("max-w-[88%] rounded-[14px] px-3.5 py-2.5 text-sm", t.role === "user" ? "rounded-br-[4px] bg-faro-surface-3 text-foreground" : "rounded-bl-[4px] bg-faro-surface-2 text-faro-text-2")}>
            <p className="whitespace-pre-wrap break-words">{t.text}</p>
            {t.lines?.length ? (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs">
                {t.lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            ) : null}
          </div>
        </li>
      ))}
      {thinking && (
        <li className="flex items-center gap-2 text-xs text-faro-text-3">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-faro-accent" /> {busy === "propose" ? "Claude está escribiendo los anuncios…" : "Claude está pensando…"}
        </li>
      )}
    </ol>
  );

  const composer = (big: boolean) => (
    <form onSubmit={ask} className={cn("flex gap-2", big ? "flex-col" : "items-end")}>
      <label htmlFor="chat-in" className="sr-only">
        {drafts.length ? "Mensaje para el copiloto" : "¿Qué quieres promocionar?"}
      </label>
      <textarea
        id="chat-in"
        rows={big ? 3 : 2}
        maxLength={1000}
        value={chatText}
        onChange={(e) => setChatText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={
          drafts.length
            ? "Pide un cambio («haz la 2 más corta») o pregunta"
            : pendingBrief
              ? "Responde aquí…"
              : "Ej.: diagnóstico de agentes de IA para clínicas en Bogotá, 40 mil al día, a web.mokub.co"
        }
        className={cn(field, "min-h-11 flex-1 resize-none py-2.5", big && "min-h-[104px] text-base")}
      />
      {big ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-faro-text-3">Enter envía · Shift + Enter, nueva línea</p>
          <Button type="submit" disabled={!chatText.trim() || busy !== null || chatBusy} className="h-11 px-5 font-semibold">
            <Wand2 className="size-4" /> {pendingBrief ? "Responder" : "Escribir anuncios"}
          </Button>
        </div>
      ) : (
        <Button type="submit" disabled={!chatText.trim() || busy !== null || chatBusy} aria-label="Enviar" className="size-11 shrink-0 p-0">
          <Send className="size-4" />
        </Button>
      )}
    </form>
  );

  const briefForm = (
    <form onSubmit={propose} aria-label="Brief de la campaña" className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className={label} htmlFor="b-service">Servicio (de Tu oferta)</label>
        <select id="b-service" className={`${field} h-10`} value={brief.serviceId} onChange={(e) => editBrief({ serviceId: e.target.value })}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.price ? ` · ${s.price}` : ""}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label} htmlFor="b-url">Destino ({allowedHosts.join(", ")})</label>
        <input id="b-url" type="url" required className={`${field} h-10`} value={brief.url} onChange={(e) => editBrief({ url: e.target.value })} />
      </div>
      <div>
        <label className={label} htmlFor="b-budget">Presupuesto diario (COP, máx. {maxBudget.toLocaleString("es-CO")})</label>
        <input id="b-budget" inputMode="numeric" pattern="\d+" required className={`${field} h-10`} value={brief.dailyBudget} onChange={(e) => editBrief({ dailyBudget: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={label} htmlFor="b-geo">Ubicación</label>
          <select id="b-geo" className={`${field} h-10`} value={brief.geo} onChange={(e) => editBrief({ geo: e.target.value })}>
            <option value="bogota">Bogotá (25 km)</option>
            <option value="co">Todo Colombia</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="b-count">Anuncios</label>
          <select id="b-count" className={`${field} h-10`} value={brief.count} onChange={(e) => editBrief({ count: e.target.value })}>
            {[3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor="b-aud">Público, en palabras</label>
        <textarea id="b-aud" required minLength={3} maxLength={300} rows={2} className={`${field} py-2`} placeholder="Dueños y gerentes de pymes de servicios en Bogotá que atienden clientes por WhatsApp" value={brief.audience} onChange={(e) => editBrief({ audience: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <label className={label} htmlFor="b-notes">Notas (opcional)</label>
        <input id="b-notes" maxLength={500} className={`${field} h-10`} placeholder="Tono, algo que destacar o evitar" value={brief.notes} onChange={(e) => editBrief({ notes: e.target.value })} />
      </div>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy !== null || !services.length}>
          <Sparkles className="size-4" /> {busy === "propose" ? "Claude está escribiendo…" : drafts.length ? "Proponer de nuevo" : "Proponer anuncios"}
        </Button>
        {drafts.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => setBriefOpen(false)}>
            Cerrar
          </Button>
        )}
      </div>
    </form>
  );

  const flash = msg && (
    <div role="alert" className={cn("rounded-button border p-3 text-sm", msg.kind === "ok" ? "border-[var(--faro-border-active)]" : "border-[var(--faro-danger)]")}>
      <p className={cn("break-words", msg.kind === "ok" ? "text-faro-accent" : "text-[var(--faro-danger)]")}>{msg.text}</p>
      {msg.lines?.length ? (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-faro-text-2">
          {msg.lines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      ) : null}
    </div>
  );

  const modes = (
    <div className="flex flex-wrap gap-2">
      {aiMock && <Tag>IA en modo de prueba</Tag>}
      {metaMock && <Tag>Meta en modo de prueba</Tag>}
    </div>
  );

  /* ---------- step 3: created ---------- */

  if (created) {
    return (
      <div className="mt-7 space-y-6">
        <Stepper step={3} />
        <section className="mx-auto max-w-xl rounded-card border border-[var(--faro-border-active)] bg-card p-6 text-center sm:p-8" aria-labelledby="done-h">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-faro-accent/15 text-faro-accent">
            <Check className="size-6" strokeWidth={2.6} />
          </span>
          <h2 id="done-h" className="mt-4 text-2xl font-bold tracking-tight">Campaña creada en pausa</h2>
          <p className="mt-2 text-sm text-faro-text-2">
            {created.mock
              ? `Modo de prueba: «${created.name}» con ${created.ads} anuncios se simuló; no se creó nada en Meta.`
              : `«${created.name}» quedó en Meta con ${created.ads} anuncios, sin gastar nada todavía. Revísala y actívala desde Pauta cuando esté lista.`}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button asChild className="font-semibold">
              <Link href="/app/ads" prefetch={false}>
                Ver en Pauta <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button type="button" variant="outline" onClick={restart}>Crear otra</Button>
          </div>
        </section>
      </div>
    );
  }

  /* ---------- step 1: describe ---------- */

  if (step === 1) {
    return (
      <div className="mt-7 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Stepper step={1} />
          {modes}
        </div>
        <div className="mx-auto max-w-2xl space-y-5">
          <section aria-labelledby="describe-h" className="rounded-card border border-border bg-card p-5 sm:p-6">
            <h2 id="describe-h" className="text-xl font-semibold tracking-tight">¿Qué quieres promocionar?</h2>
            <p className="mt-1 text-sm text-faro-text-2">Una frase con el servicio, a quién y cuánto al día. Si falta algo, Claude te pregunta.</p>
            {thread && <div className="mt-5 max-h-[45vh] overflow-y-auto pr-1">{thread}</div>}
            <div className="mt-5">{composer(true)}</div>
            {turns.length === 0 && examples.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-faro-text-3">Prueba con un ejemplo:</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {examples.map((x) => (
                    <li key={x}>
                      <button
                        type="button"
                        onClick={() => setChatText(x)}
                        className="w-full rounded-button border border-border px-3 py-2.5 text-left text-sm text-faro-text-2 transition-colors hover:border-faro-accent/60 hover:text-white"
                      >
                        {x}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {flash && <div className="mt-4">{flash}</div>}
          </section>

          {hints.length > 0 && (
            <section aria-labelledby="hints-h" className="px-1">
              <h2 id="hints-h" className="flex items-center gap-2 text-sm font-semibold">
                <Lightbulb className="size-4 text-faro-accent" /> Lo que ya sabemos
              </h2>
              <ul className="mt-2 space-y-1.5 text-sm text-faro-text-2">
                {hints.map((h) => <li key={h} className="break-words">{h}</li>)}
              </ul>
            </section>
          )}

          <details className="px-1" open={briefOpen} onToggle={(e) => setBriefOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer text-sm text-faro-text-3 hover:text-white">Prefiero llenar el brief a mano</summary>
            <div className="mt-4 rounded-card border border-border bg-card p-5">{briefForm}</div>
          </details>
        </div>
      </div>
    );
  }

  /* ---------- step 2: review ---------- */

  const svc = services.find((s) => s.id === brief.serviceId);
  const budget = Number(brief.dailyBudget);
  const domain = host(brief.url);

  return (
    <div className="mt-7 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Stepper step={2} />
        {modes}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        <aside aria-labelledby="chat-h" className="flex flex-col rounded-card border border-border bg-card p-4 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]">
          <h2 id="chat-h" className="text-base font-semibold">Conversación</h2>
          <p className="mt-0.5 text-xs text-faro-text-3">Pide cambios o pregunta. Crear y activar siguen en los botones.</p>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 max-lg:max-h-72">{thread || <p className="text-sm text-faro-text-3">Ej.: «haz la 2 más corta», «quita los emojis», «¿cuál probarías primero?»</p>}</div>
          <div className="mt-4">{composer(false)}</div>
        </aside>

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="brief-h" className="rounded-card border border-border bg-card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="brief-h" className="text-base font-semibold">Brief</h2>
              {!briefOpen && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setBriefOpen(true)} className="text-faro-text-2">
                  <Pencil className="size-3.5" /> Editar
                </Button>
              )}
            </div>
            {briefOpen ? (
              <div className="mt-4">{briefForm}</div>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {[
                  svc?.name ?? "Sin servicio",
                  Number.isFinite(budget) ? `COP ${budget.toLocaleString("es-CO")}/día` : "Sin presupuesto",
                  brief.geo === "bogota" ? "Bogotá" : "Todo Colombia",
                  domain,
                  `${drafts.length} anuncios`,
                ].map((x) => (
                  <li key={x} className="rounded-full bg-faro-surface-2 px-3 py-1 text-faro-text-2">{x}</li>
                ))}
                {brief.audience && <li className="w-full break-words pt-1 text-faro-text-3">Público: {brief.audience}</li>}
              </ul>
            )}
            {budget > maxBudget && <p className="mt-2 text-xs text-[var(--faro-danger)]">El presupuesto supera el tope de COP {maxBudget.toLocaleString("es-CO")} al día.</p>}
            {briefDirty && !briefOpen && (
              <Button type="button" size="sm" className="mt-3" disabled={busy !== null} onClick={() => runPropose(brief)}>
                <Sparkles className="size-3.5" /> Proponer de nuevo con este brief
              </Button>
            )}
          </section>

          <section aria-labelledby="drafts-h" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="drafts-h" className="text-lg font-semibold">Anuncios</h2>
              <span className="text-sm text-faro-text-3">así se verán en Meta</span>
              {proposedMock && <Tag>DEMO · modo de prueba</Tag>}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {drafts.map((d, i) => (
                <AdCard
                  key={i}
                  i={i}
                  d={d}
                  domain={domain}
                  lint={lints[i]!}
                  changed={changed.has(i)}
                  editing={editing.has(i)}
                  onToggleEdit={() => toggleEdit(i)}
                  onChange={(patch) => set(i, patch)}
                  onRemove={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          </section>

          <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-black/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-card sm:border sm:px-4">
            {flash && <div className="mb-3">{flash}</div>}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className={label} htmlFor="c-name">Nombre de la campaña</label>
                <input id="c-name" maxLength={100} className={`${field} h-10`} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1 sm:items-end">
                <Button type="button" onClick={create} disabled={busy !== null || !included.length || blocked || mediaPending || name.trim().length < 3} className="h-10 px-5 font-semibold">
                  {busy === "create" ? "Creando en Meta…" : "Crear campaña en pausa"}
                </Button>
                <p className="text-xs text-faro-text-3">
                  {blocked
                    ? "Corrige los avisos en rojo para continuar"
                    : mediaPending
                      ? "Esperando a que terminen las subidas…"
                      : !included.length
                        ? "Incluye al menos un anuncio"
                        : name.trim().length < 3
                          ? "Ponle un nombre a la campaña"
                          : `${included.length} anuncios · todo en pausa · no gasta hasta que la actives`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- ad card: a Meta-like preview with inline editing ---------- */

function AdCard({
  i,
  d,
  domain,
  lint,
  changed,
  editing,
  onToggleEdit,
  onChange,
  onRemove,
}: {
  i: number;
  d: Draft;
  domain: string;
  lint: LintIssue[];
  changed: boolean;
  editing: boolean;
  onToggleEdit: () => void;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const n = i + 1;
  const preview = d.media?.state !== "error" ? d.media?.preview : null;
  return (
    <article aria-labelledby={`ad-${i}-h`} className={cn("flex flex-col rounded-card border bg-card p-4", d.include ? "border-border" : "border-dashed border-border opacity-60", d.include && lint.length > 0 && "border-[var(--faro-danger)]")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`ad-${i}-h`} className="font-sans text-sm font-semibold">Anuncio {n}</h3>
            {changed && <Tag accent>Editado por Claude</Tag>}
          </div>
          <p className="mt-0.5 break-words text-xs text-faro-text-3">
            {d.angle} · {FORMAT_LABELS[d.format_hint]?.split(" (")[0] ?? d.format_hint}
          </p>
        </div>
        <label className="flex min-h-9 shrink-0 cursor-pointer items-center gap-2 text-xs text-faro-text-2">
          <input type="checkbox" className="size-4 accent-[#cbe850]" checked={d.include} onChange={(e) => onChange({ include: e.target.checked })} />
          Incluir
        </label>
      </div>

      {/* The preview mirrors Meta's feed layout: page, text, media, link bar. */}
      <div className="mt-3 overflow-hidden rounded-[12px] border border-white/10 bg-faro-surface-1">
        <div className="flex items-center gap-2.5 px-3 pt-3">
          <span aria-hidden className="grid size-8 place-items-center rounded-full bg-faro-accent text-xs font-bold text-faro-accent-ink">M</span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Mokub</span>
            <span className="block text-[11px] text-faro-text-3">Publicidad</span>
          </span>
        </div>
        <p className="whitespace-pre-line break-words px-3 pb-3 pt-2 text-sm leading-relaxed">{d.primaryText}</p>
        {preview ? (
          d.media?.kind === "video" ? (
            <video src={preview} className="aspect-square w-full bg-black object-cover" muted playsInline controls />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt={`Imagen del anuncio ${n}`} className="aspect-square w-full object-cover" />
          )
        ) : d.imageUrl && !d.media ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.imageUrl} alt={`Imagen del anuncio ${n}`} className="aspect-square w-full object-cover" />
        ) : (
          <div className="grid aspect-[16/9] place-items-center border-y border-dashed border-white/10 bg-faro-surface-2 px-6 text-center text-xs text-faro-text-3">Sube la imagen o el video abajo</div>
        )}
        <div className="flex items-center gap-3 bg-faro-surface-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] uppercase text-faro-text-3">{domain}</p>
            <p className="break-words text-sm font-semibold leading-snug">{d.headline}</p>
            {d.description && <p className="break-words text-xs text-faro-text-2">{d.description}</p>}
          </div>
          <span className="shrink-0 rounded-[6px] bg-faro-surface-3 px-3 py-1.5 text-xs font-semibold">{ctaLabel(d.cta)}</span>
        </div>
      </div>

      <div className="mt-3">
        <MediaPicker id={`m-${i}`} media={d.media} onChange={(media) => onChange({ media })} hidePreview />
      </div>

      {d.include && lint.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-button border border-[var(--faro-danger)] p-3 text-xs text-[var(--faro-danger)]">
          {lint.map((x, k) => (
            <li key={k} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {x.message}</li>
          ))}
        </ul>
      )}

      <p className="mt-3 break-words text-xs text-faro-text-3">Hipótesis: {d.hypothesis}</p>

      {editing && (
        <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor={`a-${i}`}>Ángulo</label>
            <input id={`a-${i}`} maxLength={60} className={`${field} h-10`} value={d.angle} onChange={(e) => onChange({ angle: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor={`f-${i}`}>Formato</label>
            <select id={`f-${i}`} className={`${field} h-10`} value={d.format_hint} onChange={(e) => onChange({ format_hint: e.target.value as FormatHint })}>
              {FORMAT_HINTS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor={`h-${i}`}>Hook (primeros 2–3 s / primera línea)</label>
            <input id={`h-${i}`} maxLength={120} className={`${field} h-10`} value={d.hook} onChange={(e) => onChange({ hook: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor={`t-${i}`}>Texto principal ({d.primaryText.length}/500)</label>
            <textarea id={`t-${i}`} rows={4} className={`${field} py-2`} value={d.primaryText} onChange={(e) => onChange({ primaryText: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor={`hl-${i}`}>Título ({d.headline.length}/80)</label>
            <input id={`hl-${i}`} className={`${field} h-10`} value={d.headline} onChange={(e) => onChange({ headline: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor={`d-${i}`}>Descripción (opcional)</label>
            <input id={`d-${i}`} className={`${field} h-10`} value={d.description} onChange={(e) => onChange({ description: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor={`c-${i}`}>Botón</label>
            <select id={`c-${i}`} className={`${field} h-10`} value={d.cta} onChange={(e) => onChange({ cta: e.target.value as Cta })}>
              {CTAS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
            </select>
          </div>
          {!d.media && (
            <div>
              <label className={label} htmlFor={`img-${i}`}>o URL de imagen (https)</label>
              <input id={`img-${i}`} type="url" className={`${field} h-10`} value={d.imageUrl} onChange={(e) => onChange({ imageUrl: e.target.value })} />
            </div>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <Button type="button" size="sm" variant="outline" onClick={onToggleEdit} aria-expanded={editing}>
          <Pencil className="size-3.5" /> {editing ? "Listo" : "Editar texto"}
        </Button>
        <button type="button" onClick={onRemove} className="inline-flex min-h-9 items-center gap-1 px-1 text-xs text-faro-text-3 hover:text-foreground" aria-label={`Quitar anuncio ${n}`}>
          <Trash2 className="size-3.5" /> Quitar
        </button>
      </div>
    </article>
  );
}
