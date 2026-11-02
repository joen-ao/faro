"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Pause, Play, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface MetaStatusView {
  mock: boolean;
  configured: boolean;
  accountName: string | null;
  currency: string | null;
  pageId: string | null;
  spendEnabled: boolean;
  maxDailyBudget: number;
  allowedHosts: string[];
  error: string | null;
}
export interface MetaCampaignView {
  id: string;
  name: string;
  status: string;
  effectiveStatus: string;
  dailyBudget: number | null;
  spendLocal: number;
  usd: number;
  impressions: number;
  clicks: number;
  conversations: number;
}
export interface LastSyncView {
  at: string;
  mode: "real" | "mock";
  saved: number;
  rows: number;
  since: string;
  until: string;
  error?: string;
}

type Msg = { kind: "ok" | "error"; text: string; lines?: string[] } | null;

const field = "h-10 w-full rounded-button border border-border bg-faro-surface-2 px-3 text-sm text-foreground placeholder:text-faro-text-3";
const label = "mb-1 block text-xs text-faro-text-2";
const money = (n: number, cur: string) => `${cur} ${n.toLocaleString("es-CO", { maximumFractionDigits: cur === "COP" ? 0 : 2 })}`;
const ctr = (c: MetaCampaignView) => (c.impressions > 0 ? `${((c.clicks / c.impressions) * 100).toFixed(2)} %` : "—");

function StatusPill({ status }: { status: string }) {
  const active = status === "ACTIVE";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider ${active ? "border-[var(--faro-border-active)] text-faro-accent" : "border-border text-faro-text-3"}`}
    >
      {active ? "ACTIVA" : status === "PAUSED" || status === "CAMPAIGN_PAUSED" ? "EN PAUSA" : status}
    </span>
  );
}

export function MetaPanel({ status, campaigns, lastSync }: { status: MetaStatusView; campaigns: MetaCampaignView[]; lastSync: LastSyncView | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const cur = status.currency ?? "COP";

  async function post(url: string, body?: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function sync() {
    setBusy("sync");
    setMsg(null);
    try {
      const { res, data } = await post("/api/ads/meta/sync?days=7");
      if (res.status === 401) setMsg({ kind: "error", text: "Sin acceso: falta la clave de la app." });
      else if (!res.ok || !data.ok) setMsg({ kind: "error", text: data.message ?? data.summary?.error ?? "No se pudo sincronizar con Meta." });
      else {
        const s = data.summary;
        setMsg({
          kind: "ok",
          text: s.mode === "mock" ? `Modo de prueba: Meta devolvió ${s.rows} filas de ejemplo; no se guardó nada.` : `Sincronizado: ${s.saved} filas (${s.since} a ${s.until}).`,
        });
        router.refresh();
      }
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(c: MetaCampaignView, next: "ACTIVE" | "PAUSED") {
    setBusy(c.id);
    setMsg(null);
    try {
      const { res, data } = await post(`/api/ads/meta/campaigns/${c.id}/status`, { status: next, confirmName: next === "ACTIVE" ? confirmName : "" });
      if (!res.ok || !data.ok) setMsg({ kind: "error", text: data.message ?? "Meta no aceptó el cambio." });
      else {
        setMsg({ kind: "ok", text: next === "ACTIVE" ? `"${c.name}" quedó activa: empieza a gastar según su presupuesto.` : `"${c.name}" quedó en pausa.` });
        setConfirming(null);
        setConfirmName("");
        router.refresh();
      }
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
    } finally {
      setBusy(null);
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const get = (k: string) => String(f.get(k) ?? "");
    setBusy("create");
    setMsg(null);
    try {
      const { res, data } = await post("/api/ads/meta/campaigns", {
        name: get("name"),
        url: get("url"),
        dailyBudget: get("dailyBudget"),
        primaryText: get("primaryText"),
        headline: get("headline"),
        description: get("description"),
        imageUrl: get("imageUrl"),
        cta: get("cta"),
        geo: get("geo"),
        ageMin: get("ageMin"),
        ageMax: get("ageMax"),
      });
      if (!res.ok || !data.ok) setMsg({ kind: "error", text: data.message ?? "Revisa los datos de la campaña.", lines: data.issues });
      else {
        setMsg({ kind: "ok", text: `Campaña creada EN PAUSA${data.mock ? " (modo de prueba)" : ""}. Destino: ${data.created.link}` });
        form.reset();
        router.refresh();
      }
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="meta-h" className="mt-8 space-y-6">
      <div className="rounded-card border border-border bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="meta-h" className="text-lg font-semibold">Meta · API</h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wider ${status.mock ? "border-border text-faro-text-3" : "border-[var(--faro-border-active)] text-faro-accent"}`}
              >
                {status.mock ? "MODO DE PRUEBA" : "CONECTADO"}
              </span>
            </div>
            <p className="mt-1 text-sm text-faro-text-2">
              {status.mock
                ? status.configured
                  ? "Credenciales listas; activa META_ADS_MODE=real para leer la cuenta real."
                  : "Faltan META_ACCESS_TOKEN, META_AD_ACCOUNT_ID o META_PAGE_ID. Los datos de abajo son de ejemplo y no entran a los totales."
                : `${status.accountName ?? "Cuenta"} · ${cur} · página ${status.pageId}`}
            </p>
            {status.error && <p className="mt-2 text-sm text-[var(--faro-danger)]">{status.error}</p>}
            <p className="mt-2 text-xs text-faro-text-3">
              {lastSync
                ? `Última sincronización: ${new Date(lastSync.at).toLocaleString("es-CO", { timeZone: "America/Bogota" })} · ${lastSync.saved} filas${lastSync.error ? ` · ${lastSync.error}` : ""}`
                : "Aún no se ha sincronizado. El cron lo hace a diario a las 6:00 (Bogotá)."}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={sync} disabled={busy !== null} className="shrink-0">
            <RefreshCw className={`size-4 ${busy === "sync" ? "animate-spin" : ""}`} /> Sincronizar ahora
          </Button>
        </div>
        <p className="mt-4 rounded-button border border-dashed border-border p-3 text-xs text-faro-text-2">
          {status.spendEnabled
            ? `Activar campañas está habilitado (tope diario ${money(status.maxDailyBudget, "COP")}). Cada activación pide escribir el nombre de la campaña.`
            : "Activar campañas está bloqueado (ADS_SPEND_ENABLED=false): Faro crea todo en pausa y no gasta dinero. Pausar siempre funciona."}
        </p>
      </div>

      <div className="rounded-card border border-border bg-card p-5">
        <h3 className="text-base font-semibold">Campañas</h3>
        {campaigns.length === 0 ? (
          <p className="mt-3 text-sm text-faro-text-2">La cuenta aún no tiene campañas. Crea la primera abajo: queda en pausa hasta que la actives.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {campaigns.map((c) => {
              const active = c.status === "ACTIVE";
              return (
                <li key={c.id} className="rounded-button border border-border bg-faro-surface-2 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-words font-medium">{c.name}</span>
                        <StatusPill status={c.status} />
                      </div>
                      <p className="mt-1 text-xs text-faro-text-3">
                        ID {c.id} · presupuesto {c.dailyBudget !== null ? `${money(c.dailyBudget, cur)}/día` : "—"}
                      </p>
                    </div>
                    <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs sm:grid-cols-6 md:text-right">
                      <div><dt className="text-faro-text-3">Gasto 30 d</dt><dd className="tabular-nums">{money(c.spendLocal, cur)}</dd></div>
                      <div><dt className="text-faro-text-3">USD</dt><dd className="tabular-nums">{c.usd.toFixed(2)}</dd></div>
                      <div><dt className="text-faro-text-3">Impr.</dt><dd className="tabular-nums">{c.impressions.toLocaleString("es-CO")}</dd></div>
                      <div><dt className="text-faro-text-3">Clics</dt><dd className="tabular-nums">{c.clicks.toLocaleString("es-CO")}</dd></div>
                      <div><dt className="text-faro-text-3">CTR</dt><dd className="tabular-nums">{ctr(c)}</dd></div>
                      <div><dt className="text-faro-text-3">Conv.</dt><dd className="tabular-nums">{c.conversations}</dd></div>
                    </dl>
                    <div className="flex shrink-0 gap-2">
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
                      <label className={label} htmlFor={`confirm-${c.id}`}>
                        Activar empieza a gastar hasta {c.dailyBudget !== null ? money(c.dailyBudget, cur) : "su presupuesto"} por día. Escribe el nombre exacto para confirmar:
                      </label>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input id={`confirm-${c.id}`} className={field} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={c.name} autoComplete="off" />
                        <Button type="button" disabled={busy !== null || confirmName.trim() !== c.name} onClick={() => setStatus(c, "ACTIVE")} className="shrink-0">
                          Confirmar y activar
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form onSubmit={create} className="rounded-card border border-border bg-card p-5" aria-labelledby="new-h">
        <h3 id="new-h" className="flex items-center gap-2 text-base font-semibold">
          <Plus className="size-4" /> Nueva campaña (se crea en pausa)
        </h3>
        <p className="mt-1 text-sm text-faro-text-2">
          Tráfico al sitio web. Faro agrega los UTM con el ID de la campaña para atribuir los leads. Dominios permitidos: {status.allowedHosts.join(", ")}.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={label} htmlFor="mc-name">Nombre de la campaña</label>
            <input id="mc-name" name="name" required minLength={3} maxLength={100} placeholder="Mokub · Agentes de IA · Bogotá" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="mc-url">URL de destino (https)</label>
            <input id="mc-url" name="url" type="url" required defaultValue="https://www.mokub.co/" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="mc-budget">Presupuesto diario (COP, máx. {status.maxDailyBudget.toLocaleString("es-CO")})</label>
            <input id="mc-budget" name="dailyBudget" required inputMode="numeric" pattern="\d+" defaultValue="20000" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="mc-cta">Botón</label>
            <select id="mc-cta" name="cta" defaultValue="LEARN_MORE" className={field}>
              <option value="LEARN_MORE">Más información</option>
              <option value="CONTACT_US">Contáctanos</option>
              <option value="GET_QUOTE">Solicitar cotización</option>
              <option value="SIGN_UP">Registrarte</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="mc-text">Texto principal</label>
            <textarea id="mc-text" name="primaryText" required maxLength={500} rows={3} placeholder="Tus mejores horas se van en tareas que un agente de IA puede hacer solo…" className={`${field} h-auto py-2`} />
          </div>
          <div>
            <label className={label} htmlFor="mc-headline">Título (máx. 80)</label>
            <input id="mc-headline" name="headline" required maxLength={80} placeholder="Agentes de IA para tu operación" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="mc-desc">Descripción (opcional)</label>
            <input id="mc-desc" name="description" maxLength={120} placeholder="Propuesta gratis en 24 h" className={field} />
          </div>
          <div className="sm:col-span-2">
            <label className={label} htmlFor="mc-image">Imagen (URL https, opcional)</label>
            <input id="mc-image" name="imageUrl" type="url" placeholder="https://www.mokub.co/og.png" className={field} />
          </div>
          <div>
            <label className={label} htmlFor="mc-geo">Ubicación</label>
            <select id="mc-geo" name="geo" defaultValue="bogota" className={field}>
              <option value="bogota">Bogotá (25 km)</option>
              <option value="co">Todo Colombia</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="mc-agemin">Edad mín.</label>
              <input id="mc-agemin" name="ageMin" inputMode="numeric" pattern="\d+" defaultValue="25" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="mc-agemax">Edad máx.</label>
              <input id="mc-agemax" name="ageMax" inputMode="numeric" pattern="\d+" defaultValue="60" className={field} />
            </div>
          </div>
        </div>
        <Button type="submit" disabled={busy !== null} className="mt-4 w-full">
          {busy === "create" ? "Creando en Meta…" : "Crear campaña en pausa"}
        </Button>
      </form>

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
    </section>
  );
}
