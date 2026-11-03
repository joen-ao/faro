"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, MessageSquare, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FORMAT_HINTS, FORMAT_LABELS, type FormatHint } from "@/features/copilot/knowledge";
import { allowedPriceNumbers, lintAd, type LintIssue } from "@/features/copilot/lint";
import type { AdPerformance } from "@/features/copilot/performance";
import { MediaPicker, type Media } from "./media-picker";

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
const COPY_FIELDS = ["angle", "format_hint", "hook", "primaryText", "headline", "description", "cta", "hypothesis"] as const;

const field = "w-full rounded-button border border-border bg-faro-surface-2 px-3 text-sm text-foreground placeholder:text-faro-text-3";
const label = "mb-1 block text-xs text-faro-text-2";
const CTAS: { v: Cta; l: string }[] = [
  { v: "LEARN_MORE", l: "Más información" },
  { v: "CONTACT_US", l: "Contáctanos" },
  { v: "GET_QUOTE", l: "Solicitar cotización" },
  { v: "SIGN_UP", l: "Registrarte" },
];
const cop = (n: number | null) => (n === null ? "—" : `COP ${Math.round(n).toLocaleString("es-CO")}`);
const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(2)} %`);

function Badge({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider ${accent ? "border-[var(--faro-border-active)] text-faro-accent" : "border-border text-faro-text-3"}`}>
      {children}
    </span>
  );
}

export function CopilotPanel({
  services,
  prices,
  allowedHosts,
  maxBudget,
  aiMock,
  metaMock,
  performance,
}: {
  services: ServiceOpt[];
  prices: string[];
  allowedHosts: string[];
  maxBudget: number;
  aiMock: boolean;
  metaMock: boolean;
  performance: AdPerformance[];
}) {
  const router = useRouter();
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
  const [name, setName] = useState("");
  const [proposedMock, setProposedMock] = useState(false);

  const lints: LintIssue[][] = drafts.map((d) => lintAd(d, allowed));
  const included = drafts.filter((d) => d.include);
  const blocked = drafts.some((d, i) => d.include && lints[i]!.length > 0);
  const mediaPending = included.some((d) => d.media?.state === "uploading" || d.media?.state === "processing");

  function propose(e: FormEvent) {
    e.preventDefault();
    void runPropose(brief);
  }

  async function runPropose(b: BriefState) {
    setBusy("propose");
    setMsg(null);
    setChanged(new Set());
    try {
      const res = await fetch("/api/ads/copilot/propose", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ brief: b }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) setMsg({ kind: "error", text: data.message ?? "Revisa el brief.", lines: data.issues });
      else {
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
        const svc = services.find((s) => s.id === b.serviceId);
        setName((n) => n || `Mokub · ${svc?.name ?? "campaña"} · ${b.geo === "bogota" ? "Bogotá" : "CO"}`.slice(0, 100));
      }
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
    } finally {
      setBusy(null);
    }
  }

  /** F33 · one box: without variants it builds the brief (a statement), otherwise it chats. */
  function ask(e: FormEvent) {
    e.preventDefault();
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
        setTurns((t) => [...t, { role: "assistant", text: data.message ?? "No pude leer la descripción. Llena el formulario de abajo." }]);
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
        setTurns((t) => [...t, { role: "assistant", text: data.question ?? "Revisa esto antes de proponer:", lines: warnings }]);
        return;
      }
      setTurns((t) => [...t, { role: "assistant", text: "Listo, armé el brief (puedes editarlo abajo). Estoy escribiendo las variantes…" }]);
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
        setMsg({ kind: "ok", text: `Campaña creada EN PAUSA con ${data.created.ads.length} anuncios${data.mock ? " (modo de prueba: no se creó nada en Meta)" : ""}. Revísala y actívala desde Pauta cuando esté lista.` });
        setDrafts([]);
        router.refresh();
      }
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
    } finally {
      setBusy(null);
    }
  }

  const set = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-wrap gap-2">
        <Badge accent={!aiMock}>{aiMock ? "IA EN MODO DE PRUEBA" : "IA REAL"}</Badge>
        <Badge accent={!metaMock}>{metaMock ? "META EN MODO DE PRUEBA" : "META CONECTADO"}</Badge>
      </div>

      <section aria-labelledby="perf-h" className="rounded-card border border-border bg-card p-5">
        <h2 id="perf-h" className="text-lg font-semibold">Rendimiento por anuncio · últimos 30 días</h2>
        <p className="mt-1 text-sm text-faro-text-2">
          CPQL = gasto ÷ leads calificados por el agente. Un número sin datos suficientes se marca y no se debe usar para decidir.
        </p>
        {performance.length === 0 ? (
          <p className="mt-4 rounded-button border border-dashed border-border p-4 text-sm text-faro-text-2">
            Aún no hay anuncios con datos. Crea una campaña abajo; cuando se active, el cron de las 6:00 traerá sus métricas por anuncio.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {performance.map((p) => (
              <li key={p.adId} className="rounded-button border border-border bg-faro-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-medium">{p.angle ?? p.adName ?? `Anuncio ${p.adId}`}</span>
                  {p.formatHint && <Badge>{FORMAT_LABELS[p.formatHint as FormatHint]?.split(" (")[0] ?? p.formatHint}</Badge>}
                </div>
                {p.hypothesis && <p className="mt-1 text-xs text-faro-text-3">Hipótesis: {p.hypothesis}</p>}
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4 lg:grid-cols-7">
                  <div><dt className="text-faro-text-3">Gasto</dt><dd className="tabular-nums">{cop(p.spendLocal)}</dd></div>
                  <div><dt className="text-faro-text-3">Impresiones</dt><dd className="tabular-nums">{p.impressions.toLocaleString("es-CO")}</dd></div>
                  <div>
                    <dt className="text-faro-text-3">CTR de enlace</dt>
                    <dd className="tabular-nums">{pct(p.ctr)} {!p.ctrReady && <span className="text-faro-text-3">· pocos datos</span>}</dd>
                  </div>
                  <div><dt className="text-faro-text-3">Leads</dt><dd className="tabular-nums">{p.leads}</dd></div>
                  <div><dt className="text-faro-text-3">Calificados</dt><dd className="tabular-nums">{p.qualified}</dd></div>
                  <div><dt className="text-faro-text-3">CPL</dt><dd className="tabular-nums">{cop(p.cpl)}</dd></div>
                  <div>
                    <dt className="text-faro-text-3">CPQL</dt>
                    <dd className="tabular-nums text-faro-accent">{cop(p.cpql)} {!p.qualityReady && <span className="text-faro-text-3">· pocos datos</span>}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="chat-h" className="rounded-card border border-[var(--faro-border-active)] bg-card p-5">
        <h2 id="chat-h" className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquare className="size-4 text-faro-accent" /> Habla con el copiloto
        </h2>
        <p className="mt-1 text-sm text-faro-text-2">
          {drafts.length
            ? "Pide cambios («haz la 2 más corta», «quita los emojis») o pregunta por el rendimiento. Crear y activar siguen en los botones."
            : "Describe la campaña en una frase y Claude arma el brief y los anuncios. También puedes preguntar por el rendimiento (termina con «?»)."}
        </p>
        {turns.length > 0 && (
          <ol className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1" aria-live="polite">
            {turns.map((t, k) => (
              <li key={k} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-card px-3 py-2 text-sm ${t.role === "user" ? "bg-faro-surface-2 text-foreground" : "border border-border text-faro-text-2"}`}>
                  <p className="whitespace-pre-wrap break-words">{t.text}</p>
                  {t.lines?.length ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                      {t.lines.map((l) => <li key={l}>{l}</li>)}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
            {(busy === "brief" || chatBusy) && <li className="text-xs text-faro-text-3">Claude está pensando…</li>}
          </ol>
        )}
        <form onSubmit={ask} className="mt-4 flex items-end gap-2">
          <label htmlFor="chat-in" className="sr-only">Mensaje para el copiloto</label>
          <textarea
            id="chat-in"
            rows={2}
            maxLength={1000}
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={drafts.length ? "Ej.: haz la 2 más corta y con un tono más directo" : "Ej.: diagnóstico de agentes de IA para clínicas en Bogotá, 40 mil al día, a web.mokub.co"}
            className={`${field} min-h-11 flex-1 resize-none py-2`}
          />
          <Button type="submit" disabled={!chatText.trim() || busy !== null || chatBusy} aria-label="Enviar" className="h-11 shrink-0">
            {drafts.length ? <Send className="size-4" /> : <Wand2 className="size-4" />}
          </Button>
        </form>
      </section>

      <form onSubmit={propose} aria-labelledby="brief-h" className="rounded-card border border-border bg-card p-5">
        <h2 id="brief-h" className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-4 text-faro-accent" /> Brief de la campaña
        </h2>
        <p className="mt-1 text-sm text-faro-text-2">Se llena desde el chat; también puedes editarlo aquí. Claude propone anuncios de conceptos distintos (no reescrituras del mismo).</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="b-service">Servicio (de Tu oferta)</label>
            <select id="b-service" className={`${field} h-10`} value={brief.serviceId} onChange={(e) => setBrief({ ...brief, serviceId: e.target.value })}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.price ? ` · ${s.price}` : ""}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="b-url">Destino (https · {allowedHosts.join(", ")})</label>
            <input id="b-url" type="url" required className={`${field} h-10`} value={brief.url} onChange={(e) => setBrief({ ...brief, url: e.target.value })} />
          </div>
          <div>
            <label className={label} htmlFor="b-budget">Presupuesto diario (COP, máx. {maxBudget.toLocaleString("es-CO")})</label>
            <input id="b-budget" inputMode="numeric" pattern="\d+" required className={`${field} h-10`} value={brief.dailyBudget} onChange={(e) => setBrief({ ...brief, dailyBudget: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="b-geo">Ubicación</label>
              <select id="b-geo" className={`${field} h-10`} value={brief.geo} onChange={(e) => setBrief({ ...brief, geo: e.target.value })}>
                <option value="bogota">Bogotá (25 km)</option>
                <option value="co">Todo Colombia</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="b-count">Variantes</label>
              <select id="b-count" className={`${field} h-10`} value={brief.count} onChange={(e) => setBrief({ ...brief, count: e.target.value })}>
                {[3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="b-aud">Público, en palabras</label>
            <textarea id="b-aud" required minLength={3} maxLength={300} rows={2} className={`${field} py-2`} placeholder="Dueños y gerentes de pymes de servicios en Bogotá que atienden clientes por WhatsApp" value={brief.audience} onChange={(e) => setBrief({ ...brief, audience: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="b-notes">Notas (opcional)</label>
            <input id="b-notes" maxLength={500} className={`${field} h-10`} placeholder="Tono, algo que destacar o evitar" value={brief.notes} onChange={(e) => setBrief({ ...brief, notes: e.target.value })} />
          </div>
        </div>
        <Button type="submit" disabled={busy !== null || !services.length} className="mt-4 w-full">
          {busy === "propose" ? "Claude está escribiendo…" : drafts.length ? "Proponer de nuevo" : "Proponer anuncios"}
        </Button>
      </form>

      {drafts.length > 0 && (
        <section aria-labelledby="drafts-h" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="drafts-h" className="text-lg font-semibold">Variantes propuestas</h2>
            {proposedMock && <Badge>DEMO · generadas en modo de prueba</Badge>}
          </div>
          <p className="text-sm text-faro-text-2">Edita lo que quieras. Faro revisa cada texto con reglas de políticas de Meta; un anuncio con avisos no se puede crear.</p>
          {drafts.map((d, i) => (
            <article key={i} className={`rounded-card border bg-card p-5 ${d.include ? "border-border" : "border-dashed border-border opacity-60"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" className="size-4 accent-[#cbe850]" checked={d.include} onChange={(e) => set(i, { include: e.target.checked })} />
                  Anuncio {i + 1}
                  {changed.has(i) && <Badge accent>EDITADO POR CLAUDE</Badge>}
                </label>
                <button type="button" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-xs text-faro-text-3 hover:text-foreground" aria-label={`Quitar anuncio ${i + 1}`}>
                  <Trash2 className="size-3.5" /> Quitar
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label} htmlFor={`a-${i}`}>Ángulo</label>
                  <input id={`a-${i}`} maxLength={60} className={`${field} h-10`} value={d.angle} onChange={(e) => set(i, { angle: e.target.value })} />
                </div>
                <div>
                  <label className={label} htmlFor={`f-${i}`}>Formato</label>
                  <select id={`f-${i}`} className={`${field} h-10`} value={d.format_hint} onChange={(e) => set(i, { format_hint: e.target.value as FormatHint })}>
                    {FORMAT_HINTS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={label} htmlFor={`h-${i}`}>Hook (primeros 2–3 s / primera línea)</label>
                  <input id={`h-${i}`} maxLength={120} className={`${field} h-10`} value={d.hook} onChange={(e) => set(i, { hook: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label} htmlFor={`t-${i}`}>Texto principal ({d.primaryText.length}/500)</label>
                  <textarea id={`t-${i}`} rows={4} className={`${field} py-2`} value={d.primaryText} onChange={(e) => set(i, { primaryText: e.target.value })} />
                </div>
                <div>
                  <label className={label} htmlFor={`hl-${i}`}>Título ({d.headline.length}/80)</label>
                  <input id={`hl-${i}`} className={`${field} h-10`} value={d.headline} onChange={(e) => set(i, { headline: e.target.value })} />
                </div>
                <div>
                  <label className={label} htmlFor={`d-${i}`}>Descripción (opcional)</label>
                  <input id={`d-${i}`} className={`${field} h-10`} value={d.description} onChange={(e) => set(i, { description: e.target.value })} />
                </div>
                <div>
                  <label className={label} htmlFor={`c-${i}`}>Botón</label>
                  <select id={`c-${i}`} className={`${field} h-10`} value={d.cta} onChange={(e) => set(i, { cta: e.target.value as Cta })}>
                    {CTAS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={label} htmlFor={`m-${i}`}>Imagen o video (se sube directo a tu cuenta de Meta)</label>
                  <MediaPicker id={`m-${i}`} media={d.media} onChange={(media) => set(i, { media })} />
                  {!d.media && (
                    <input id={`img-${i}`} type="url" aria-label={`URL de imagen del anuncio ${i + 1}`} placeholder="o pega una URL https de imagen (opcional)" className={`${field} mt-2 h-9 text-xs`} value={d.imageUrl} onChange={(e) => set(i, { imageUrl: e.target.value })} />
                  )}
                </div>
                <p className="text-xs text-faro-text-3 sm:col-span-2">Hipótesis: {d.hypothesis}</p>
              </div>
              {d.include && lints[i]!.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-button border border-[var(--faro-danger)] p-3 text-xs text-[var(--faro-danger)]">
                  {lints[i]!.map((x, k) => (
                    <li key={k} className="flex gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {x.message}</li>
                  ))}
                </ul>
              )}
            </article>
          ))}
          <div className="rounded-card border border-border bg-card p-5">
            <label className={label} htmlFor="c-name">Nombre de la campaña</label>
            <input id="c-name" maxLength={100} className={`${field} h-10`} value={name} onChange={(e) => setName(e.target.value)} />
            <p className="mt-2 text-xs text-faro-text-2">
              Se crea 1 campaña con 1 conjunto y {included.length} anuncios, todo EN PAUSA. Cada clic lleva el ID del anuncio para medir su CPQL.
            </p>
            <Button type="button" onClick={create} disabled={busy !== null || !included.length || blocked || mediaPending || name.trim().length < 3} className="mt-4 w-full">
              {busy === "create" ? "Creando en Meta…" : blocked ? "Corrige los avisos para continuar" : mediaPending ? "Esperando a que terminen las subidas…" : "Crear campaña en pausa"}
            </Button>
          </div>
        </section>
      )}

      <div role="status" aria-live="polite">
        {msg && (
          <div className={`rounded-card border p-4 text-sm ${msg.kind === "ok" ? "border-[var(--faro-border-active)]" : "border-[var(--faro-danger)]"}`}>
            <p className={`break-words ${msg.kind === "ok" ? "text-faro-accent" : "text-[var(--faro-danger)]"}`}>{msg.text}</p>
            {msg.lines?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-faro-text-2">
                {msg.lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
