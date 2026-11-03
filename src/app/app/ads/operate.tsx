"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, Octagon, Pause, Play, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FORMAT_LABELS, type FormatHint } from "@/features/copilot/knowledge";
import { cn } from "@/lib/utils";
import { money } from "./format";
import { fieldCls, Flash, labelCls, useAction } from "./use-action";

/* F35 · Pauta: operate and measure. Creating lives in the Copilot; these components only read, decide and pause/activate. */

export interface StatusView {
  mock: boolean;
  configured: boolean;
  accountName: string | null;
  currency: string;
  spendEnabled: boolean;
  maxDailyBudget: number;
  allowedHosts: string[];
  error: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}
export interface AdRow {
  adId: string;
  name: string;
  formatHint: string | null;
  spend: number;
  ctr: number | null;
  ctrReady: boolean;
  leads: number;
  qualified: number;
  cpql: number | null;
  qualityReady: boolean;
}
export interface CampaignRow {
  id: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  spend: number;
  leads: number;
  qualified: number;
  cpql: number | null;
  ads: AdRow[];
}
export interface RecView {
  id: string;
  rule: string;
  action: string;
  title: string;
  evidence: Record<string, unknown>;
  requiresApproval: boolean;
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

const pct = (n: number | null) => (n === null ? "—" : `${(n * 100).toFixed(2)} %`);
const when = (iso: string) => new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" });
const SPEND_UP = new Set(["raise_budget", "activate_campaign"]);
const ACTION_LABEL: Record<string, string> = {
  pause_ad: "Pausar anuncio",
  lower_budget: "Bajar presupuesto",
  raise_budget: "Subir presupuesto",
  activate_campaign: "Activar campaña",
  alert: "Alerta",
  pause_campaign: "Pausar campaña",
};
const REVERTIBLE = new Set(["pause_ad", "lower_budget", "raise_budget", "activate_campaign", "pause_campaign"]);

function fmtEvidence(e: Record<string, unknown>): string {
  return Object.entries(e)
    .map(([k, v]) => `${k}: ${typeof v === "number" ? (Math.abs(v) < 1 ? (v * 100).toFixed(2) + " %" : Math.round(v).toLocaleString("es-CO")) : String(v)}`)
    .join(" · ");
}

function Pill({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "accent" && "border-[var(--faro-border-active)] text-faro-accent",
        tone === "danger" && "border-[var(--faro-danger)] text-[var(--faro-danger)]",
        tone === "muted" && "border-border text-faro-text-3",
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- status line ---------------- */

export function SyncLine({ status, ago }: { status: StatusView; ago: string | null }) {
  const { busy, msg, call } = useAction();
  const text = status.mock
    ? status.configured
      ? "Meta en modo de prueba · credenciales listas (META_ADS_MODE=real para la cuenta real)"
      : "Meta en modo de prueba · los datos son de ejemplo y no entran a los totales"
    : `Meta conectado · ${status.accountName ?? "Cuenta"} · ${ago ? `sincronizado ${ago}` : "sin sincronizar aún"}`;
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-faro-text-2">
        <span className="min-w-0">
          <span aria-hidden className={cn("mr-2 inline-block size-2 rounded-full align-middle", status.mock ? "bg-faro-text-3" : "bg-faro-accent")} />
          {text}
        </span>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() =>
            call("sync", "/api/ads/meta/sync?days=7", undefined, (d) => {
              const s = d.summary as { mode: string; rows: number; saved: number; since: string; until: string };
              return s.mode === "mock" ? `Modo de prueba: ${s.rows} filas de ejemplo, no se guardó nada.` : `Sincronizado: ${s.saved} filas (${s.since} a ${s.until}).`;
            })
          }
          className="inline-flex min-h-9 items-center gap-1.5 rounded-button px-2 text-faro-text-3 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", busy === "sync" && "animate-spin")} /> Sincronizar
        </button>
      </div>
      {(status.error || status.lastSyncError) && <p className="mt-1 text-sm text-[var(--faro-danger)]">{status.error ?? status.lastSyncError}</p>}
      <Flash msg={msg} className="mt-2 max-w-xl empty:hidden" />
    </div>
  );
}

/* ---------------- decisions ---------------- */

export function Decisions({ recs, spendEnabled }: { recs: RecView[]; spendEnabled: boolean }) {
  const { busy, msg, call } = useAction();
  if (recs.length === 0) return null;
  return (
    <section aria-labelledby="dec-h" className="rounded-card border border-[var(--faro-border-active)] bg-card p-5 sm:p-6">
      <h2 id="dec-h" className="text-lg font-semibold">
        Para decidir hoy <span className="ml-1 text-faro-accent tabular-nums">{recs.length}</span>
      </h2>
      <p className="mt-1 text-sm text-faro-text-2">El copiloto revisa las métricas cada mañana. Nada que suba el gasto se aplica sin ti.</p>
      <ul className="mt-4 divide-y divide-border">
        {recs.map((r) => {
          const locked = SPEND_UP.has(r.action) && !spendEnabled;
          return (
            <li key={r.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={r.requiresApproval ? "accent" : "muted"}>{r.requiresApproval ? "Requiere tu aprobación" : r.action === "alert" ? "Alerta" : "Baja gasto"}</Pill>
                  <span className="text-xs text-faro-text-3">{ACTION_LABEL[r.action] ?? r.action}</span>
                </div>
                <p className="mt-2 break-words font-medium">{r.title}</p>
                <p className="mt-1 break-words text-xs text-faro-text-3">{fmtEvidence(r.evidence)}</p>
                {locked && <p className="mt-1 text-xs text-faro-warn">Bloqueado: activar gasto está apagado (ADS_SPEND_ENABLED=false).</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                {r.action !== "alert" && (
                  <Button type="button" size="sm" disabled={busy !== null || locked} onClick={() => call(r.id, `/api/ads/copilot/recommendations/${r.id}`, { decision: "apply" }, () => "Aplicado y registrado.")}>
                    Aplicar
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => call(r.id, `/api/ads/copilot/recommendations/${r.id}`, { decision: r.action === "alert" ? "apply" : "dismiss" }, () => (r.action === "alert" ? "Alerta marcada como vista." : "Descartada."))}
                >
                  {r.action === "alert" ? "Entendido" : "Descartar"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <Flash msg={msg} className="mt-4 empty:hidden" />
    </section>
  );
}

/* ---------------- campaigns ---------------- */

const COLS = "xl:grid xl:grid-cols-[minmax(0,2.2fr)_repeat(5,minmax(0,1fr))_232px] xl:items-center xl:gap-4";

function AdsTable({ ads, cur }: { ads: AdRow[]; cur: string }) {
  if (ads.length === 0) return <p className="text-sm text-faro-text-2">Esta campaña aún no tiene anuncios con datos. Las métricas por anuncio llegan con la sincronización de las 6:00.</p>;
  return (
    <ul className="space-y-2">
      {ads.map((a) => (
        <li key={a.adId} className="rounded-button bg-faro-surface-1 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words text-sm font-medium">{a.name}</span>
            {a.formatHint && <Pill>{FORMAT_LABELS[a.formatHint as FormatHint]?.split(" (")[0] ?? a.formatHint}</Pill>}
          </div>
          <dl className="mt-2 grid grid-cols-3 gap-x-4 gap-y-2 text-xs sm:grid-cols-6">
            <div><dt className="text-faro-text-3">Gasto</dt><dd className="tabular-nums">{money(a.spend, cur)}</dd></div>
            <div><dt className="text-faro-text-3">CTR</dt><dd className="tabular-nums">{pct(a.ctr)}{!a.ctrReady && <span className="block text-faro-text-3">pocos datos</span>}</dd></div>
            <div><dt className="text-faro-text-3">Leads</dt><dd className="tabular-nums">{a.leads}</dd></div>
            <div><dt className="text-faro-text-3">Calificados</dt><dd className="tabular-nums">{a.qualified}</dd></div>
            <div className="col-span-2">
              <dt className="text-faro-text-3">CPQL</dt>
              <dd className="tabular-nums text-faro-accent">{money(a.cpql, cur)}{!a.qualityReady && <span className="ml-1 text-faro-text-3">· pocos datos</span>}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

export function Campaigns({ campaigns, status }: { campaigns: CampaignRow[]; status: StatusView }) {
  const { busy, msg, call } = useAction();
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [panic, setPanic] = useState(false);
  const cur = status.currency;

  const setStatus = async (c: CampaignRow, next: "ACTIVE" | "PAUSED") => {
    const done = await call(c.id, `/api/ads/meta/campaigns/${c.id}/status`, { status: next, confirmName: next === "ACTIVE" ? confirmName : "" }, () =>
      next === "ACTIVE" ? `"${c.name}" quedó activa: empieza a gastar según su presupuesto.` : `"${c.name}" quedó en pausa.`,
    );
    if (done) {
      setConfirming(null);
      setConfirmName("");
    }
  };

  return (
    <section aria-labelledby="camp-h" className="rounded-card border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="camp-h" className="text-lg font-semibold">Campañas</h2>
        <p className="text-xs text-faro-text-3">
          {status.spendEnabled ? `Activar pide escribir el nombre · tope ${money(status.maxDailyBudget)}/día` : "Activar está apagado (ADS_SPEND_ENABLED=false); pausar siempre funciona"}
        </p>
      </div>

      {campaigns.length === 0 ? (
        <div className="mt-5 rounded-button border border-dashed border-border p-6 text-center">
          <p className="font-medium">Todavía no hay campañas</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-faro-text-2">Describe lo que quieres promocionar y el copiloto escribe los anuncios. Se crean en pausa.</p>
          <Button asChild className="mt-4">
            <a href="/app/ads/copilot">Crear la primera campaña</a>
          </Button>
        </div>
      ) : (
        <>
          <div className={cn("mt-5 hidden border-b border-border pb-2 text-xs text-faro-text-3", COLS)} aria-hidden>
            <span>Campaña</span>
            <span className="text-right">Presupuesto/día</span>
            <span className="text-right">Gasto 30 d</span>
            <span className="text-right">Leads</span>
            <span className="text-right">Calificados</span>
            <span className="text-right">CPQL</span>
            <span />
          </div>
          <ul className="mt-3 divide-y divide-border xl:mt-0">
            {campaigns.map((c) => {
              const active = c.status === "ACTIVE";
              const expanded = open === c.id;
              return (
                <li key={c.id} className="py-4">
                  <div className={cn("flex flex-col gap-3", COLS)}>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 break-words font-medium">{c.name}</span>
                        <Pill tone={active ? "accent" : "muted"}>{active ? "Activa" : "En pausa"}</Pill>
                      </div>
                      <p className="mt-0.5 text-xs text-faro-text-3">ID {c.id}</p>
                    </div>
                    <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-sm sm:grid-cols-5 xl:contents">
                      <div className="xl:text-right"><dt className="text-xs text-faro-text-3 xl:sr-only">Presupuesto/día</dt><dd className="tabular-nums">{money(c.dailyBudget, cur)}</dd></div>
                      <div className="xl:text-right"><dt className="text-xs text-faro-text-3 xl:sr-only">Gasto 30 d</dt><dd className="tabular-nums">{money(c.spend, cur)}</dd></div>
                      <div className="xl:text-right"><dt className="text-xs text-faro-text-3 xl:sr-only">Leads</dt><dd className="tabular-nums">{c.leads}</dd></div>
                      <div className="xl:text-right"><dt className="text-xs text-faro-text-3 xl:sr-only">Calificados</dt><dd className="tabular-nums">{c.qualified}</dd></div>
                      <div className="xl:text-right"><dt className="text-xs text-faro-text-3 xl:sr-only">CPQL</dt><dd className="tabular-nums text-faro-accent">{money(c.cpql, cur)}</dd></div>
                    </dl>
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Button type="button" size="sm" variant="ghost" aria-expanded={expanded} aria-controls={`ads-${c.id}`} onClick={() => setOpen(expanded ? null : c.id)} className="text-faro-text-2">
                        Anuncios <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
                      </Button>
                      {active ? (
                        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => setStatus(c, "PAUSED")}>
                          <Pause className="size-4" /> Pausar
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy !== null || !status.spendEnabled}
                          title={status.spendEnabled ? undefined : "Bloqueado: ADS_SPEND_ENABLED=false"}
                          onClick={() => {
                            setConfirming(confirming === c.id ? null : c.id);
                            setConfirmName("");
                          }}
                        >
                          <Play className="size-4" /> Activar
                        </Button>
                      )}
                    </div>
                  </div>
                  {confirming === c.id && (
                    <div className="mt-3 rounded-button border border-[var(--faro-border-active)] p-3">
                      <label className={labelCls} htmlFor={`confirm-${c.id}`}>
                        Activar empieza a gastar hasta {c.dailyBudget !== null ? money(c.dailyBudget, cur) : "su presupuesto"} por día. Escribe el nombre exacto para confirmar:
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input id={`confirm-${c.id}`} className={fieldCls} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={c.name} autoComplete="off" />
                        <Button type="button" disabled={busy !== null || confirmName.trim() !== c.name} onClick={() => setStatus(c, "ACTIVE")} className="shrink-0">
                          Confirmar y activar
                        </Button>
                      </div>
                    </div>
                  )}
                  {expanded && (
                    <div id={`ads-${c.id}`} className="mt-3 rounded-button bg-faro-surface-2 p-3">
                      <AdsTable ads={c.ads} cur={cur} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Flash msg={msg} className="mt-3 empty:hidden" />

      <div className="mt-4 border-t border-border pt-4">
        {panic ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-sm text-faro-text-2">¿Pausar ya todas las campañas que creó el copiloto?</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-[var(--faro-danger)] text-[var(--faro-danger)] hover:border-[var(--faro-danger)] hover:text-[var(--faro-danger)]"
                disabled={busy !== null}
                onClick={() => call("panic", "/api/ads/copilot/panic", undefined, (d) => `${d.paused} campañas pausadas.`).then(() => setPanic(false))}
              >
                Sí, pausar todas
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setPanic(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setPanic(true)} className="inline-flex min-h-9 items-center gap-1.5 text-sm text-[var(--faro-danger)] hover:underline">
            <Octagon className="size-4" /> Pausar todo
          </button>
        )}
      </div>
    </section>
  );
}

/* ---------------- advanced ---------------- */

export function PilotSettings({ settings, skipped }: { settings: SettingsView; skipped: string[] }) {
  const { busy, msg, call } = useAction();
  const [form, setForm] = useState({ mode: settings.mode, cplCap: settings.cplCap?.toString() ?? "", cpqlCap: settings.cpqlCap?.toString() ?? "" });
  return (
    <div>
      <h3 className="font-semibold">Piloto automático</h3>
      <p className="mt-1 max-w-2xl text-sm text-faro-text-2">
        Evalúa a diario a las 6:00. En piloto automático solo ejecuta lo que <strong className="text-foreground">baja gasto</strong> (pausar anuncios perdedores, recortar presupuesto). Subir gasto siempre espera tu aprobación.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="cfg-mode">Modo</label>
          <select id="cfg-mode" className={fieldCls} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as SettingsView["mode"] })}>
            <option value="recommend">Solo recomendar</option>
            <option value="autopilot">Piloto automático (solo baja gasto)</option>
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="cfg-cpl">CPL objetivo (COP)</label>
          <input id="cfg-cpl" inputMode="numeric" pattern="\d*" className={fieldCls} placeholder="p. ej. 25000" value={form.cplCap} onChange={(e) => setForm({ ...form, cplCap: e.target.value })} />
        </div>
        <div>
          <label className={labelCls} htmlFor="cfg-cpql">CPQL objetivo (COP)</label>
          <input id="cfg-cpql" inputMode="numeric" pattern="\d*" className={fieldCls} placeholder="p. ej. 120000" value={form.cpqlCap} onChange={(e) => setForm({ ...form, cpqlCap: e.target.value })} />
        </div>
      </div>
      {skipped.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-faro-text-2">
          {skipped.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Button type="button" disabled={busy !== null} onClick={() => call("cfg", "/api/ads/copilot/settings", { mode: form.mode, cplCap: form.cplCap, cpqlCap: form.cpqlCap }, () => "Configuración guardada.")}>
          Guardar
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            call("eval", "/api/ads/copilot/evaluate", undefined, (d) => {
              const s = d.summary as { proposed: number; autoApplied: number };
              return `${s.proposed} recomendaciones${s.autoApplied ? `, ${s.autoApplied} aplicadas por el piloto` : ""}.`;
            })
          }
        >
          <RefreshCw className={cn("size-4", busy === "eval" && "animate-spin")} /> Evaluar ahora
        </Button>
      </div>
      <Flash msg={msg} className="mt-3 empty:hidden" />
    </div>
  );
}

export function ChangeLog({ actions }: { actions: ActionView[] }) {
  const { busy, msg, call } = useAction();
  const reverted = new Set(actions.filter((a) => a.revertOf && a.ok).map((a) => a.revertOf));
  return (
    <div>
      <h3 className="font-semibold">Registro de cambios en Meta</h3>
      {actions.length === 0 ? (
        <p className="mt-1 text-sm text-faro-text-2">Todavía no hay cambios. Cada acción del piloto o tuya queda aquí con el antes y el después.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {actions.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-foreground">
                  {ACTION_LABEL[a.action.replace(/^revert_/, "")] ?? a.action}
                  {a.action.startsWith("revert_") ? " (revertido)" : ""} · {a.actor === "autopilot" ? "piloto" : "humano"}
                  {!a.ok && <span className="text-[var(--faro-danger)]"> · falló</span>}
                </p>
                <p className="mt-0.5 break-words text-faro-text-3">
                  {when(a.at)} · {a.entityId} · {JSON.stringify(a.before)} → {JSON.stringify(a.after)}
                  {a.error ? ` · ${a.error}` : ""}
                </p>
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
      <Flash msg={msg} className="mt-3 empty:hidden" />
    </div>
  );
}

/** F28 manual form, kept for rare cases; the Copilot is the normal way to create. */
export function ManualCampaign({ status }: { status: StatusView }) {
  const { busy, msg, call } = useAction();
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form).entries());
    const done = await call("create", "/api/ads/meta/campaigns", body, (d) => `Campaña creada EN PAUSA${d.mock ? " (modo de prueba)" : ""}. Destino: ${(d.created as { link: string }).link}`);
    if (done) form.reset();
  }
  return (
    <form onSubmit={create} aria-labelledby="new-h">
      <h3 id="new-h" className="font-semibold">Crear campaña a mano</h3>
      <p className="mt-1 text-sm text-faro-text-2">Un anuncio, sin Claude. Se crea en pausa. Dominios permitidos: {status.allowedHosts.join(", ")}.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="mc-name">Nombre de la campaña</label>
          <input id="mc-name" name="name" required minLength={3} maxLength={100} placeholder="Mokub · Agentes de IA · Bogotá" className={fieldCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="mc-url">URL de destino (https)</label>
          <input id="mc-url" name="url" type="url" required defaultValue="https://www.mokub.co/" className={fieldCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mc-budget">Presupuesto diario (COP, máx. {status.maxDailyBudget.toLocaleString("es-CO")})</label>
          <input id="mc-budget" name="dailyBudget" required inputMode="numeric" pattern="\d+" defaultValue="20000" className={fieldCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mc-cta">Botón</label>
          <select id="mc-cta" name="cta" defaultValue="LEARN_MORE" className={fieldCls}>
            <option value="LEARN_MORE">Más información</option>
            <option value="CONTACT_US">Contáctanos</option>
            <option value="GET_QUOTE">Solicitar cotización</option>
            <option value="SIGN_UP">Registrarte</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="mc-text">Texto principal</label>
          <textarea id="mc-text" name="primaryText" required maxLength={500} rows={3} className={`${fieldCls} h-auto py-2`} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mc-headline">Título (máx. 80)</label>
          <input id="mc-headline" name="headline" required maxLength={80} className={fieldCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mc-desc">Descripción (opcional)</label>
          <input id="mc-desc" name="description" maxLength={120} className={fieldCls} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="mc-image">Imagen (URL https, opcional)</label>
          <input id="mc-image" name="imageUrl" type="url" className={fieldCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="mc-geo">Ubicación</label>
          <select id="mc-geo" name="geo" defaultValue="bogota" className={fieldCls}>
            <option value="bogota">Bogotá (25 km)</option>
            <option value="co">Todo Colombia</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls} htmlFor="mc-agemin">Edad mín.</label>
            <input id="mc-agemin" name="ageMin" inputMode="numeric" pattern="\d+" defaultValue="25" className={fieldCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="mc-agemax">Edad máx.</label>
            <input id="mc-agemax" name="ageMax" inputMode="numeric" pattern="\d+" defaultValue="60" className={fieldCls} />
          </div>
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={busy !== null} className="mt-4">
        {busy === "create" ? "Creando en Meta…" : "Crear campaña en pausa"}
      </Button>
      <Flash msg={msg} className="mt-3 empty:hidden" />
    </form>
  );
}
