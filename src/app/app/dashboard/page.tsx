import type { Metadata } from "next";
import { headers } from "next/headers";
import { Attribution } from "@/components/attribution";
import { ChallengePanel } from "@/components/dashboard/challenge-panel";
import { DashboardBody } from "@/components/dashboard/dashboard-body";
import { DemoToggle } from "@/components/dashboard/demo-toggle";
import { CompliancePanel, Panel } from "@/components/dashboard/panels";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { getDashboardData } from "@/features/dashboard/data";
import { OutreachPanel } from "@/components/dashboard/outreach-panel";
import { getOutreachMetrics } from "@/features/metrics/outreach";
import { requireAppAccess } from "@/lib/app-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tablero · Faro", robots: { index: false } };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const h = await headers();
  if (requireAppAccess(new Request("http://faro.local/app/dashboard", { headers: h }))) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-faro-text-2">El tablero es interno. Entra con la clave de acceso del equipo.</p>
      </main>
    );
  }
  const includeDemo = (await searchParams).demo === "1";
  const db = (await getReadyDb()) as unknown as AppDb;
  const [data, outreach] = await Promise.all([getDashboardData(db, { includeDemo }), getOutreachMetrics(db)]);

  return (
    <main>
      <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-8 sm:px-6 sm:pb-[72px] sm:pt-9">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[13px] uppercase tracking-[0.2em] text-faro-text-3">Tablero</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight tracking-[-0.03em] sm:text-[40px]">¿Qué fuente rinde más por peso?</h1>
            <p className="mt-2 max-w-xl text-sm text-faro-text-2">Cada número viene de registros de costo reales y se puede abrir hasta su recibo.</p>
          </div>
          <DemoToggle on={includeDemo} />
        </header>

        <div className="mt-7 space-y-7">
          <OutreachPanel m={outreach} />

          <ChallengePanel items={data.challenge} />

          <section aria-label="Datos reales">
            <DashboardBody bucket={data.real} demoBucket={data.demo} />
          </section>

          {data.demo && (
            <section aria-label="Datos de prueba (DEMO)" className="rounded-card border-2 border-dashed border-destructive/60 p-3 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <span className="rounded border-2 border-destructive px-2 py-0.5 text-xs font-bold tracking-[0.3em] text-destructive">DEMO</span>
                <h2 className="font-display text-lg font-semibold">Datos de prueba, separados de los reales</h2>
              </div>
              <p className="mb-4 text-sm text-faro-text-2">Datos de ejemplo para ver el tablero lleno. No se suman a los totales reales ni se usan para recomendar.</p>
              <DashboardBody bucket={data.demo} demo />
            </section>
          )}

          <Panel id="compliance" title="Panel de cumplimiento" hint="Requisito obligatorio (SPEC §8). Solo mensajes reales; los de prueba no cuentan.">
            <CompliancePanel m={data.compliance} />
          </Panel>
        </div>

        <footer className="mt-10 border-t border-border pt-5">
          <Attribution />
        </footer>
      </div>
    </main>
  );
}
