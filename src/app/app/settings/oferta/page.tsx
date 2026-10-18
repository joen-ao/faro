import type { Metadata } from "next";
import { headers } from "next/headers";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { DEFAULT_CATALOG_SOURCE, DEFAULT_COMPANY } from "@/config/default-services";
import { ServicesEditor } from "@/features/offer/ui/services-editor";
import { getServiceCatalog } from "@/features/settings/services";
import { requireAppAccess } from "@/lib/app-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mis servicios · Configuración", robots: { index: false, follow: false } };

export default async function OfferSettingsPage() {
  const h = await headers();
  const denied = requireAppAccess(new Request("http://internal/app/settings/oferta", { headers: h }));
  if (denied) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-faro-text-2">Esta sección requiere la clave de acceso de la app (APP_ACCESS_KEY).</p>
      </main>
    );
  }
  const db = (await getReadyDb()) as unknown as AppDb;
  const catalog = await getServiceCatalog(db);

  return (
    <main className="relative isolate min-h-dvh overflow-x-clip px-4 py-10 sm:py-14">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" style={{ background: "var(--faro-glow-violet)" }} />
      <div className="mx-auto max-w-3xl">
        <p className="text-xs uppercase tracking-[0.25em] text-faro-text-3">Configuración · Oferta</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Mis servicios</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-faro-text-2">
          Lo que vendes y qué resultado obtiene el cliente. Con esto Faro escribe el correo, conecta cada hallazgo del diagnóstico con el servicio que lo resuelve y le da contexto al agente de Dapta.
        </p>
        {catalog.origin === "default" && (
          <p className="mt-3 text-sm text-faro-text-3">
            {DEFAULT_COMPANY.name}: {DEFAULT_COMPANY.pitch}
          </p>
        )}
        <div className="mt-8">
          <ServicesEditor initial={catalog.services} note={catalog.note} origin={catalog.origin} defaultSource={DEFAULT_CATALOG_SOURCE} />
        </div>
      </div>
    </main>
  );
}
