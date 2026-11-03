import type { Metadata } from "next";
import { headers } from "next/headers";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { allowedAdHosts } from "@/features/ads";
import { listLearnings } from "@/features/copilot";
import { getServiceCatalog } from "@/features/settings/services";
import { getMetaAds } from "@/integrations/meta-ads";
import { requireAppAccess } from "@/lib/app-access";
import { getEnv, resolveMode } from "@/lib/env";
import { CopilotPanel } from "./copilot-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Copiloto de pauta", robots: { index: false, follow: false } };

/** F36 · only creating lives here; measuring and deciding moved to Pauta (/app/ads). */
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
  const metaMock = getMetaAds(env).isMock;
  const catalog = await getServiceCatalog(db);
  const learnings = await listLearnings(db, metaMock);
  const hints = learnings.filter((l) => l.confidence === "alta" || l.confidence === "media").slice(0, 3).map((l) => l.statement);

  return (
    <main>
      <div className="mx-auto max-w-[1280px] px-4 pb-16 pt-8 sm:px-6 sm:pt-9">
        <header>
          <h1 className="text-3xl font-bold leading-tight tracking-[-0.03em] sm:text-[40px]">Copiloto</h1>
          <p className="mt-2 max-w-xl text-sm text-faro-text-2">Describe la campaña, revisa los anuncios que escribe Claude y créala en pausa.</p>
        </header>
        <CopilotPanel
          services={catalog.services.map((x) => ({ id: x.id, name: x.name, price: x.price ?? null }))}
          prices={catalog.services.flatMap((x) => [x.price ?? "", x.entryOffer ?? ""])}
          allowedHosts={allowedAdHosts(env)}
          maxBudget={env.ADS_MAX_DAILY_BUDGET_COP}
          aiMock={resolveMode("anthropic", env) === "mock"}
          metaMock={metaMock}
          hints={hints}
        />
      </div>
    </main>
  );
}
