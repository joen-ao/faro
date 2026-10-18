import type { Metadata } from "next";
import { headers } from "next/headers";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { checkSendWindow } from "@/features/compliance/windows";
import { getSendWindow } from "@/features/settings/send-window";
import { requireAppAccess } from "@/lib/app-access";
import { SendWindowForm } from "./send-window-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Horario de envío · Configuración", robots: { index: false, follow: false } };

export default async function SendWindowSettingsPage() {
  const h = await headers();
  const denied = requireAppAccess(new Request("http://internal/app/settings/envio", { headers: h }));
  if (denied) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-faro-text-2">Esta sección requiere la clave de acceso de la app (APP_ACCESS_KEY).</p>
      </main>
    );
  }
  const db = (await getReadyDb()) as unknown as AppDb;
  const current = await getSendWindow(db);
  const win = checkSendWindow(new Date(), "CO", current.setting);

  return (
    <main className="relative isolate min-h-dvh px-4 py-10 sm:py-14">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" style={{ background: "var(--faro-glow-violet)" }} />
      <div className="mx-auto max-w-2xl">
        <p className="text-xs uppercase tracking-[0.25em] text-faro-text-3">Configuración · Envío</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">¿Cuándo salen los mensajes?</h1>
        <p className="mt-2 text-sm text-faro-text-2">
          La cola solo envía dentro de esta ventana (hora de Colombia). Fuera de ella los mensajes quedan encolados y salen cuando abre.
        </p>
        <SendWindowForm
          initial={current.setting}
          origin={current.origin}
          now={{ allowed: win.allowed, reason: win.reason, nextAllowedAt: win.nextAllowedAt?.toISOString() ?? null }}
        />
      </div>
    </main>
  );
}
