import type { Metadata } from "next";
import { headers } from "next/headers";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { allowedAdHosts, bogotaDate } from "@/features/ads";
import { adPerformance } from "@/features/copilot";
import { getServiceCatalog } from "@/features/settings/services";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv, resolveMode } from "@/lib/env";
import { CopilotPanel } from "./copilot-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Copiloto de pauta", robots: { index: false, follow: false } };

export default async function CopilotPage() {
  const h = await headers();
  const denied = requireAppAccess(new Request("http://internal/app/ads/copilot", { headers: h }));
  if (denied) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-faro-text-2">Esta sección requiere la clave de acceso de la app (APP_ACCESS_KEY).</p>
      </main>
    );
  }
  const env = getEnv();
  const db = (await getReadyDb()) as unknown as AppDb;
  const [catalog, perf] = await Promise.all([getServiceCatalog(db), adPerformance(db, bogotaDate(29))]);

  return (
    <main className="relative isolate min-h-dvh px-4 py-10 sm:py-14">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" style={{ background: "var(--faro-glow-violet)" }} />
      <div className="mx-auto max-w-5xl">
        <p className="text-xs uppercase tracking-[0.25em] text-faro-text-3">Pauta · Copiloto</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Campañas que se miden hasta el lead calificado</h1>
        <p className="mt-2 max-w-2xl text-sm text-faro-text-2">
          Claude propone anuncios con ángulos distintos a partir de tu oferta. Tú los editas y apruebas, Faro los crea en pausa y mide cada anuncio
          hasta el lead calificado por el agente de WhatsApp.
        </p>
        <CopilotPanel
          services={catalog.services.map((x) => ({ id: x.id, name: x.name, price: x.price ?? null }))}
          prices={catalog.services.flatMap((x) => [x.price ?? "", x.entryOffer ?? ""])}
          allowedHosts={allowedAdHosts(env)}
          maxBudget={env.ADS_MAX_DAILY_BUDGET_COP}
          aiMock={resolveMode("anthropic", env) === "mock"}
          metaMock={getMetaAds(env).isMock}
          performance={perf}
        />
      </div>
    </main>
  );
}
