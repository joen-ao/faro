import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { inServiceWindow } from "@/features/wa-agent";
import { getConversation } from "@/features/wa-agent/inbox";
import { requireAppAccess } from "@/lib/app-access";
import { cn } from "@/lib/utils";
import { ConversationActions } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conversación", robots: { index: false, follow: false } };

const time = (d: Date) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);

/** Variables worth showing; internal ones (`_slots`, `_email`…) stay hidden. */
const LABELS: Record<string, string> = {
  nombre_negocio: "Negocio",
  producto_interes: "Producto",
  ref_diagnostico: "Referencia",
  reunion_agendada: "Reunión agendada",
  fecha_reunion: "Fecha de la reunión",
  quiere_comprar: "Quiere comprar",
  calificado: "Calificado",
  pidio_baja: "Pidió la baja",
  resumen: "Resumen",
};
const SENT: Record<string, string> = { pending: "enviando", sent: "enviado", delivered: "entregado", read: "leído", failed: "no se envió" };
const show = (v: unknown) => (v === true ? "Sí" : v === false ? "No" : String(v));

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const h = await headers();
  const denied = requireAppAccess(new Request("http://internal/app/conversaciones", { headers: h }));
  if (denied) {
    return (
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Acceso restringido</h1>
      </main>
    );
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const db = (await getReadyDb()) as unknown as AppDb;
  const data = await getConversation(db, id);
  if (!data) notFound();
  const { conversation: c, messages } = data;
  const vars = Object.entries(c.variables as Record<string, unknown>).filter(([k, v]) => LABELS[k] && v !== null && v !== "");
  const cost = messages.reduce((s, m) => s + (m.costUsd ?? 0), 0);

  return (
    <main className="min-h-dvh px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <Link href="/app/conversaciones" className="text-sm text-faro-text-3 hover:text-faro-text-2">
          ← Conversaciones
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight">{(c.variables as Record<string, unknown>).nombre_negocio as string | undefined ?? c.contactName ?? "Contacto de WhatsApp"}</h1>
        <p className="mt-1 text-sm text-faro-text-2">
          {c.phone} · desde {time(c.createdAt)} · {messages.length} mensajes · IA USD {cost.toFixed(4)}
          {c.adId && ` · anuncio ${c.adId}`}
          {c.leadId && (
            <>
              {" · "}
              <span className="text-faro-text-3">lead en Faro</span>
            </>
          )}
        </p>

        {vars.length > 0 && (
          <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 border-y border-white/[0.08] py-4 text-sm sm:grid-cols-2">
            {vars.map(([k, v]) => (
              <div key={k} className={cn("flex gap-2", k === "resumen" && "sm:col-span-2")}>
                <dt className="shrink-0 text-faro-text-3">{LABELS[k]}</dt>
                <dd className="min-w-0 text-faro-text-2">{show(v)}</dd>
              </div>
            ))}
          </dl>
        )}

        <ol className="mt-6 flex flex-col gap-3" aria-label="Mensajes">
          {messages.map((m) => {
            const mine = m.direction === "out";
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", mine ? "bg-faro-surface-2" : "bg-faro-surface-1")}>
                  <p className="whitespace-pre-wrap">{m.text ?? `[${m.kind}]`}</p>
                  <p className="mt-1 text-[11px] text-faro-text-3">
                    {m.author === "persona" ? "Equipo" : m.author === "agente" ? "Agente" : "Contacto"} · {time(m.createdAt)}
                    {mine && ` · ${SENT[m.status] ?? m.status}`}
                    {m.costUsd > 0 && ` · USD ${m.costUsd.toFixed(4)}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <ConversationActions id={c.id} status={c.status} canWrite={inServiceWindow(c.lastInboundAt)} />
      </div>
    </main>
  );
}
