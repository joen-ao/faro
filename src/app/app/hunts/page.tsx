import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { listHunts } from "@/features/hunts/list";
import { fmtDate, fmtInt, prettyCity } from "@/features/hunts/ui/format";
import { requireAppAccess } from "@/lib/app-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Búsquedas · Faro", robots: { index: false, follow: false } };

const STATUS: Record<string, string> = { pending: "En cola", running: "Buscando", paused: "En pausa", completed: "Terminada", failed: "Con error" };

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
    <main className="relative isolate min-h-dvh px-4 py-10 sm:px-8 sm:py-12">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px]" style={{ background: "var(--faro-glow-violet)" }} />
      <div className="mx-auto max-w-[1240px]">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-faro-text-3">Faro · búsquedas</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Lo que ya buscamos</h1>
            <p className="mt-2 text-sm text-faro-text-2">Cada búsqueda con sus leads, los del perfil y cómo va el contacto. Solo datos reales.</p>
          </div>
          <Link href="/app/new" className="inline-flex h-11 items-center self-start rounded-button bg-faro-accent px-5 text-sm font-semibold text-faro-accent-ink hover:brightness-110">
            Nueva búsqueda
          </Link>
        </header>

        {items.length === 0 ? (
          <p className="mt-10 rounded-card border border-border bg-card p-8 text-center text-faro-text-2">Aún no hay búsquedas. Crea la primera desde “Nueva búsqueda”.</p>
        ) : (
          <ul className="mt-8 grid gap-4 md:grid-cols-2" data-testid="hunt-list">
            {items.map((x) => (
              <li key={x.id} className="flex flex-col gap-4 rounded-card border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-semibold">
                      {x.sector ? x.sector.charAt(0).toUpperCase() + x.sector.slice(1) : "Búsqueda"}
                      {x.city ? ` · ${prettyCity(x.city)}` : ""}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-xs text-faro-text-3">{x.prompt}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <span className="rounded-full border border-border px-2 py-0.5 text-faro-text-2">{STATUS[x.status] ?? x.status}</span>
                    {x.isDemo && <span className="rounded-full bg-faro-surface-2 px-2 py-0.5 text-faro-text-3">DEMO</span>}
                    <span className="text-faro-text-3">{fmtDate(x.createdAt)}</span>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                  {[
                    ["Leads", x.leads],
                    ["Del perfil", x.fit],
                    ["En cola", x.queued],
                    ["Enviados", x.sent],
                    ["Respondieron", x.responded],
                    ["Calificados", x.qualified],
                  ].map(([k, v]) => (
                    <div key={k as string} className="rounded-button bg-faro-surface-1 px-2 py-2">
                      <dt className="text-[11px] text-faro-text-3">{k}</dt>
                      <dd className="font-display text-lg font-semibold">{fmtInt(v as number)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/app/hunts/${x.id}`} className="inline-flex h-9 items-center rounded-button border border-border px-3 text-sm hover:border-faro-accent">
                    Ver mapa y leads
                  </Link>
                  <Link href={`/app/hunts/${x.id}/outreach`} className="inline-flex h-9 items-center rounded-button bg-faro-accent px-3 text-sm font-semibold text-faro-accent-ink hover:brightness-110">
                    Contactar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
