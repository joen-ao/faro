"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Check, Copy, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Link {
  slug: string;
  audience: string;
  url: string | null;
}
interface Row {
  id: string;
  platform: string;
  campaign: string;
  date: string;
  usd: number;
  impressions: number;
  clicks: number;
  isDemo: boolean;
}
type Msg = { kind: "ok" | "error"; text: string; lines?: string[] } | null;

const field = "h-10 w-full rounded-button border border-border bg-faro-surface-2 px-3 text-sm text-foreground placeholder:text-faro-text-3";
const label = "mb-1 block text-xs text-faro-text-2";

export function AdsPanel({ links, rows, defaultCampaign }: { links: Link[]; rows: Row[]; defaultCampaign: string }) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);

  async function copy(url: string, slug: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(slug);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setMsg({ kind: "error", text: "No se pudo copiar; selecciona el enlace y cópialo a mano." });
    }
  }

  async function submitManual(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/ads/spend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform: "meta",
          campaign: String(f.get("campaign") ?? ""),
          date: String(f.get("date") ?? ""),
          usd: String(f.get("usd") ?? ""),
          impressions: String(f.get("impressions") || "0"),
          clicks: String(f.get("clicks") || "0"),
          isDemo: demo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ kind: "error", text: res.status === 401 ? "Sin acceso: falta la clave de la app." : "Revisa los datos del formulario.", lines: data.issues });
      else {
        setMsg({ kind: "ok", text: "Gasto guardado y repartido entre los leads de la campaña." });
        router.refresh();
      }
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
    } finally {
      setBusy(false);
    }
  }

  async function submitCsv(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) return setMsg({ kind: "error", text: "Elige un archivo CSV." });
    if (file.size > 1_000_000) return setMsg({ kind: "error", text: "El archivo supera 1 MB." });
    setBusy(true);
    setMsg(null);
    try {
      const body = new FormData();
      body.set("file", file);
      if (demo) body.set("demo", "1");
      const res = await fetch("/api/ads/spend/csv", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      const errors: { line: number; error: string }[] = data.errors ?? [];
      const lines = errors.slice(0, 20).map((x) => `Línea ${x.line || "—"}: ${x.error}`);
      if (res.status === 413) setMsg({ kind: "error", text: "El archivo supera 1 MB." });
      else if (res.status === 401) setMsg({ kind: "error", text: "Sin acceso: falta la clave de la app." });
      else if (!data.saved && errors.length) setMsg({ kind: "error", text: "No se guardó ninguna fila.", lines });
      else {
        setMsg({ kind: errors.length ? "error" : "ok", text: `${data.saved} filas guardadas${errors.length ? `, ${errors.length} con error` : ""}.`, lines });
        router.refresh();
      }
    } catch {
      setMsg({ kind: "error", text: "No hay conexión con el servidor." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <section aria-labelledby="utm-h" className="rounded-card border border-border bg-card p-5">
        <h2 id="utm-h" className="text-lg font-semibold">Enlace del anuncio</h2>
        <p className="mt-1 text-sm text-faro-text-2">Usa este enlace como destino. Cada visita queda atribuida a meta_ads.</p>
        {links.some((l) => l.url) ? (
          <ul className="mt-4 space-y-3">
            {links.map((l) => (
              <li key={l.slug} className="rounded-button border border-border bg-faro-surface-2 p-3">
                <p className="text-xs text-faro-text-3">{l.audience}</p>
                {l.url ? (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <code data-testid="utm-link" className="min-w-0 flex-1 break-all text-xs text-faro-accent">{l.url}</code>
                    <Button type="button" size="sm" variant="outline" onClick={() => copy(l.url!, l.slug)} aria-label={`Copiar enlace de ${l.audience}`}>
                      {copied === l.slug ? <Check className="size-4" /> : <Copy className="size-4" />}
                      {copied === l.slug ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-button border border-dashed border-border p-3 text-sm text-faro-text-2">
            Define <code className="text-faro-accent">META_ADS_CAMPAIGN_ID</code> en el entorno para generar el enlace.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={submitManual} className="rounded-card border border-border bg-card p-5" aria-labelledby="manual-h">
          <h2 id="manual-h" className="text-lg font-semibold">Carga manual</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={label} htmlFor="platform">Plataforma</label>
              <input id="platform" className={field} value="meta" disabled readOnly />
            </div>
            <div className="col-span-2">
              <label className={label} htmlFor="campaign">Campaña (utm_campaign)</label>
              <input id="campaign" name="campaign" required maxLength={80} defaultValue={defaultCampaign} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="date">Fecha</label>
              <input id="date" name="date" type="date" required className={field} />
            </div>
            <div>
              <label className={label} htmlFor="usd">Gasto (USD)</label>
              <input id="usd" name="usd" required inputMode="decimal" pattern="\d+(\.\d{1,6})?" placeholder="25.00" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="impressions">Impresiones</label>
              <input id="impressions" name="impressions" inputMode="numeric" pattern="\d*" placeholder="0" className={field} />
            </div>
            <div>
              <label className={label} htmlFor="clicks">Clics</label>
              <input id="clicks" name="clicks" inputMode="numeric" pattern="\d*" placeholder="0" className={field} />
            </div>
          </div>
          <Button type="submit" disabled={busy} className="mt-4 w-full">Guardar gasto</Button>
        </form>

        <form onSubmit={submitCsv} className="rounded-card border border-border bg-card p-5" aria-labelledby="csv-h">
          <h2 id="csv-h" className="text-lg font-semibold">Carga por CSV</h2>
          <p className="mt-1 text-sm text-faro-text-2">Máximo 1 MB. Columnas: <code className="text-faro-accent">platform,campaign,date,usd,impressions,clicks</code> (platform, impressions y clics opcionales). Fecha yyyy-mm-dd.</p>
          <label className={`${label} mt-4`} htmlFor="file">Archivo</label>
          <input id="file" name="file" type="file" accept=".csv,text/csv" className="block w-full text-sm text-faro-text-2 file:mr-3 file:h-10 file:cursor-pointer file:rounded-button file:border file:border-border file:bg-faro-surface-2 file:px-3 file:text-sm file:text-foreground" />
          <Button type="submit" variant="secondary" disabled={busy} className="mt-4 w-full">
            <Upload className="size-4" /> Subir CSV
          </Button>
        </form>
      </div>

      <label className="flex items-start gap-3 rounded-card border border-border bg-card p-4 text-sm">
        <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="mt-0.5 size-4 accent-[#cbe850]" />
        <span>
          <span className="font-medium">Marcar como datos de prueba (DEMO)</span>
          <span className="block text-xs text-faro-text-2">Solo para pruebas: se guarda aparte y nunca entra en los totales reales. Apagado por defecto.</span>
        </span>
      </label>

      <div role="status" aria-live="polite">
        {msg && (
          <div className={`rounded-card border p-4 text-sm ${msg.kind === "ok" ? "border-[var(--faro-border-active)]" : "border-[var(--faro-danger)]"}`}>
            <p className={msg.kind === "ok" ? "text-faro-accent" : "text-[var(--faro-danger)]"}>{msg.text}</p>
            {msg.lines?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-faro-text-2">
                {msg.lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            ) : null}
          </div>
        )}
      </div>

      <section aria-labelledby="list-h" className="rounded-card border border-border bg-card p-5">
        <h2 id="list-h" className="text-lg font-semibold">Gasto cargado</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-faro-text-2">Aún no hay gasto. Carga la primera fila o un CSV para ver el CPL de meta_ads.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-faro-text-3">
                <tr>
                  <th className="py-2 pr-3 font-normal">Fecha</th>
                  <th className="py-2 pr-3 font-normal">Campaña</th>
                  <th className="py-2 pr-3 text-right font-normal">USD</th>
                  <th className="py-2 pr-3 text-right font-normal">Impr.</th>
                  <th className="py-2 pr-3 text-right font-normal">Clics</th>
                  <th className="py-2 font-normal"><span className="sr-only">Tipo</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2 pr-3 tabular-nums">{r.date}</td>
                    <td className="py-2 pr-3 break-all">{r.campaign}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.usd.toFixed(2)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.impressions.toLocaleString("es-CO")}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{r.clicks.toLocaleString("es-CO")}</td>
                    <td className="py-2 text-right">{r.isDemo && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] tracking-wider text-faro-text-3">DEMO</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
