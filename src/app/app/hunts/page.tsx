import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { fmtInt, sourceLabel } from "@/features/dashboard/format";
import { listHunts, type HuntSummary } from "@/features/hunts/list";
import { fmtDate, prettyCity } from "@/features/hunts/ui/format";
import { requireAppAccess } from "@/lib/app-access";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Búsquedas · Faro", robots: { index: false, follow: false } };

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "En cola", tone: "bg-faro-surface-3 text-white" },
  running: { label: "Buscando", tone: "bg-faro-warn/15 text-faro-warn" },
  paused: { label: "En pausa", tone: "bg-faro-surface-3 text-white" },
  completed: { label: "Terminada", tone: "bg-faro-accent/15 text-faro-accent" },
  failed: { label: "Con error", tone: "bg-destructive/15 text-destructive" },
};

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-faro-accent focus-visible:ring-offset-2 focus-visible:ring-offset-black";
const BTN = cn("inline-flex min-h-11 items-center justify-center rounded-button px-[18px] text-sm", FOCUS);
const BTN_PRIMARY = cn(BTN, "bg-faro-accent font-bold text-faro-accent-ink hover:brightness-110");
const BTN_GHOST = cn(BTN, "border border-white/20 text-white hover:border-faro-accent");

const title = (x: HuntSummary) => `${x.sector ? x.sector.charAt(0).toUpperCase() + x.sector.slice(1) : "Búsqueda"}${x.area ? ` · ${x.area}` : x.city ? ` · ${prettyCity(x.city)}` : ""}`;

function Metrics({ items }: { items: [string, number, boolean?][] }) {
  return (
    <dl className="grid min-w-0 flex-[2_1_520px] grid-cols-[repeat(auto-fit,minmax(90px,1fr))] gap-2">
      {items.map(([k, v, accent]) => (
        <div key={k} className="rounded-[10px] bg-faro-surface-2 px-3 py-2.5">
          <dt className="text-xs text-faro-text-3">{k}</dt>
          <dd className={cn("mt-0.5 font-display text-[22px] font-bold tabular-nums", accent ? "text-faro-accent" : "text-white")}>{fmtInt(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function HuntCard({ x }: { x: HuntSummary }) {
  if (x.isDemo) {
    return (
      <li className="flex flex-wrap items-center gap-x-8 gap-y-5 rounded-card border border-dashed border-white/20 bg-faro-surface-1 p-5 sm:p-6">
        <div className="min-w-0 flex-[1_1_280px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-xl font-semibold sm:text-[22px]">{title(x)}</h2>
            <span className="rounded-full bg-faro-surface-3 px-2.5 py-0.5 text-xs font-bold text-white">DEMO</span>
          </div>
          <p className="mt-1.5 text-sm text-faro-text-3">Búsqueda de demostración · fuera de los totales reales</p>
        </div>
        <Metrics items={[["Leads", x.leads], ["Del perfil", x.fit]]} />
        <div className="flex-none">
          <Link href={`/app/hunts/${x.id}`} className={BTN_GHOST}>
            Ver demo
          </Link>
        </div>
      </li>
    );
  }
  const st = STATUS[x.status] ?? { label: x.status, tone: "bg-faro-surface-3 text-white" };
  const sources = x.bySource.map((s) => `${sourceLabel(s.source)} ${fmtInt(s.leads)}`);
  if (x.mergedDuplicates > 0) sources.push(`${fmtInt(x.mergedDuplicates)} ${x.mergedDuplicates === 1 ? "duplicado fusionado" : "duplicados fusionados"}`);
  return (
    <li className="flex flex-wrap items-center gap-x-8 gap-y-5 rounded-card border border-white/[0.12] bg-faro-surface-1 p-5 sm:p-6">
      <div className="min-w-0 flex-[1_1_280px]">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="font-display text-xl font-semibold sm:text-[22px]">{title(x)}</h2>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", st.tone)}>{st.label}</span>
        </div>
        <p className="mt-1.5 line-clamp-3 text-pretty text-sm text-faro-text-3">
          “{x.prompt}” · <span className="whitespace-nowrap">{fmtDate(x.createdAt)}</span>
        </p>
        <p className="mt-2.5 text-[13px] text-faro-text-2">{sources.length ? sources.join(" · ") : "Aún sin leads reales"}</p>
        {x.leads > x.fit && x.fit >= 0 && !x.isDemo && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-faro-text-3">
            <strong className="font-semibold text-white/80">Del perfil</strong> = encaja y tiene un correo de empresa para escribirle.{" "}
            {(x.leads - x.fit).toLocaleString("es-CO")} siguen sin contacto público: búscales sitio web y redes (gratis) desde el mapa.
          </p>
        )}
      </div>
      <Metrics
        items={[
          ["Leads", x.leads],
          ["Del perfil", x.fit, true],
          ["En cola", x.queued],
          ["Enviados", x.sent],
          ["Respondieron", x.responded],
          ["Calificados", x.qualified],
        ]}
      />
      <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:flex-none sm:flex-col">
        <Link href={`/app/hunts/${x.id}/outreach`} className={cn(BTN_PRIMARY, "flex-1 sm:flex-none")}>
          Contactar
        </Link>
        <Link href={`/app/hunts/${x.id}`} className={cn(BTN_GHOST, "flex-1 sm:flex-none")}>
          Ver mapa y leads
        </Link>
      </div>
    </li>
  );
}

export default async function HuntsPage() {
  const h = await headers();
  if (requireAppAccess(new Request("http://internal/app/hunts", { headers: h }))) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-faro-text-2">Entra con la clave de acceso del equipo.</p>
      </main>
    );
  }
  const items = await listHunts((await getReadyDb()) as unknown as AppDb);

  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-8 sm:px-6 sm:pb-[72px] sm:pt-9">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[13px] uppercase tracking-[0.2em] text-faro-text-3">Búsquedas</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] sm:text-[40px]">Lo que ya buscamos</h1>
          <p className="mt-2 text-faro-text-2">Cada búsqueda con sus leads y cómo va el contacto. Solo datos reales.</p>
        </div>
        <Link href="/app/new" className={cn(BTN_PRIMARY, "min-h-12 gap-2 px-5")}>
          <span aria-hidden>+</span> Nueva búsqueda
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="mt-8 rounded-card border border-white/[0.12] bg-faro-surface-1 p-8 text-center text-faro-text-2">Aún no hay búsquedas. Crea la primera desde “Nueva búsqueda”.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3.5" data-testid="hunt-list">
          {items.map((x) => (
            <HuntCard key={x.id} x={x} />
          ))}
        </ul>
      )}
    </main>
  );
}
