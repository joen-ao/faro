import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { listConversations, type InboxRow } from "@/features/wa-agent/inbox";
import { waCloudIsReal } from "@/integrations/wa-cloud";
import { requireAppAccess } from "@/lib/app-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conversaciones", robots: { index: false, follow: false } };

const STATUS: Record<InboxRow["status"], { label: string; cls: string }> = {
  humano: { label: "Con una persona", cls: "text-faro-warn" },
  abierta: { label: "Agente", cls: "text-faro-accent" },
  cerrada: { label: "Cerrada", cls: "text-faro-text-3" },
};

const when = (d: Date) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
const last4 = (p: string) => `···${p.replace(/\D/g, "").slice(-4)}`;

export default async function ConversationsPage() {
  const h = await headers();
  const denied = requireAppAccess(new Request("http://internal/app/conversaciones", { headers: h }));
  if (denied) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
        <p className="mt-2 text-sm text-faro-text-2">Esta sección requiere la clave de acceso de la app (APP_ACCESS_KEY).</p>
      </main>
    );
  }
  const db = (await getReadyDb()) as unknown as AppDb;
  const rows = await listConversations(db);
  const real = waCloudIsReal();
  const waiting = rows.filter((r) => r.status === "humano").length;

  return (
    <main className="min-h-dvh px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight">Conversaciones</h1>
        <p className="mt-2 text-sm text-faro-text-2">
          WhatsApp del agente propio de Faro.{" "}
          {real ? "Conectado a la API de WhatsApp de Meta." : "Modo de prueba: no se envía nada a WhatsApp."}
          {waiting > 0 && <span className="text-faro-warn"> {waiting === 1 ? "Una conversación espera" : `${waiting} conversaciones esperan`} a una persona.</span>}
        </p>

        {rows.length === 0 ? (
          <p className="mt-10 text-sm text-faro-text-3">
            Todavía no hay conversaciones. Cuando alguien le escriba al número conectado, aparece aquí.
          </p>
        ) : (
          <ul className="mt-8 divide-y divide-white/[0.08] border-y border-white/[0.08]">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/app/conversaciones/${r.id}`} className="flex items-start gap-4 px-1 py-4 hover:bg-white/[0.03] focus-visible:bg-white/[0.05] focus-visible:outline-none">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-semibold">{r.business ?? r.contactName ?? "Contacto de WhatsApp"}</span>
                      <span className="text-faro-text-3">{last4(r.phone)}</span>
                      {r.fromAd && <span className="text-xs text-faro-text-3">desde un anuncio</span>}
                      {r.meeting && <span className="text-xs text-faro-accent">reunión agendada</span>}
                      {r.isMock && <span className="text-xs text-faro-text-3">prueba</span>}
                    </p>
                    <p className="mt-1 truncate text-sm text-faro-text-2">
                      {r.lastAuthor && r.lastAuthor !== "contacto" ? `${r.lastAuthor === "persona" ? "Equipo" : "Agente"}: ` : ""}
                      {r.lastText ?? "[mensaje no textual]"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <p className={STATUS[r.status].cls}>{STATUS[r.status].label}</p>
                    <p className="mt-1 text-faro-text-3">{when(r.lastMessageAt)}</p>
                    <p className="mt-1 tabular-nums text-faro-text-3">
                      {r.messages} mensajes · USD {r.costUsd.toFixed(3)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
