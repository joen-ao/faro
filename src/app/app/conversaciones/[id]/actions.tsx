"use client";

import { useState } from "react";
import { Flash, useAction } from "@/app/app/ads/use-action";
import { Button } from "@/components/ui/button";

/** Take / give back the conversation and reply by hand (only inside Meta's 24 h window). */
export function ConversationActions({ id, status, canWrite }: { id: string; status: "abierta" | "humano" | "cerrada"; canWrite: boolean }) {
  const { busy, msg, call } = useAction();
  const [text, setText] = useState("");
  const url = `/api/wa-agent/conversations/${id}`;
  if (status === "cerrada") return <p className="mt-8 text-sm text-faro-text-3">Conversación cerrada: ya se registró en Faro.</p>;

  return (
    <section className="mt-8 border-t border-white/[0.08] pt-6" aria-label="Acciones">
      <div className="flex flex-wrap items-center gap-3">
        {status === "abierta" ? (
          <Button variant="outline" disabled={!!busy} onClick={() => call("tomar", url, { action: "tomar" }, () => "Tomaste la conversación: el agente ya no responde.")}>
            Tomar la conversación
          </Button>
        ) : (
          <Button variant="outline" disabled={!!busy} onClick={() => call("devolver", url, { action: "devolver" }, () => "El agente vuelve a responder.")}>
            Devolver al agente
          </Button>
        )}
        <p className="text-sm text-faro-text-3">{status === "humano" ? "El agente no responde mientras la tengas tú." : "El agente responde solo."}</p>
      </div>

      {canWrite ? (
        <form
          className="mt-5 flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("responder", url, { action: "responder", text }, () => "Mensaje enviado.")) setText("");
          }}
        >
          <label htmlFor="reply" className="text-sm font-medium">
            Responder como el equipo
          </label>
          <textarea
            id="reply"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1500}
            className="w-full rounded-xl border border-white/[0.12] bg-faro-surface-1 px-3 py-2 text-sm focus-visible:border-faro-border-active focus-visible:outline-none"
          />
          <div>
            <Button type="submit" disabled={!!busy || !text.trim()}>
              {busy === "responder" ? "Enviando…" : "Enviar por WhatsApp"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-5 text-sm text-faro-text-3">Pasaron más de 24 horas desde su último mensaje: WhatsApp solo permite escribirle con una plantilla aprobada.</p>
      )}
      <Flash msg={msg} className="mt-4" />
    </section>
  );
}
