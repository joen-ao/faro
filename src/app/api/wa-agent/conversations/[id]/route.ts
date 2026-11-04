import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { waConversations } from "@/db/schema";
import { readJsonCapped } from "@/features/diagnostic/limits";
import { getAgentDeps, inServiceWindow, sendAs, setStatus } from "@/features/wa-agent";
import { requireAppAccess } from "@/lib/app-access";
import { withDb } from "@/lib/with-db";

export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("tomar") }),
  z.object({ action: z.literal("devolver") }),
  z.object({ action: z.literal("responder"), text: z.string().trim().min(1).max(1500) }),
]);

/** F44 inbox: a person takes the conversation (the agent goes quiet), gives it back, or replies by hand. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = requireAppAccess(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ ok: false, message: "Conversación inválida." }, { status: 400 });
  const raw = await readJsonCapped(req);
  if (!raw.ok) return NextResponse.json({ ok: false, message: "Cuerpo inválido." }, { status: 400 });
  const body = Body.safeParse(raw.json);
  if (!body.success) return NextResponse.json({ ok: false, message: "Acción inválida." }, { status: 400 });
  return withDb(async (db) => {
    const [conv] = await db.select().from(waConversations).where(eq(waConversations.id, id)).limit(1);
    if (!conv) return NextResponse.json({ ok: false, message: "No existe esa conversación." }, { status: 404 });
    if (conv.status === "cerrada") return NextResponse.json({ ok: false, message: "La conversación ya está cerrada." }, { status: 409 });
    switch (body.data.action) {
      case "tomar":
        await setStatus(db, id, "humano");
        return NextResponse.json({ ok: true });
      case "devolver":
        await setStatus(db, id, "abierta");
        return NextResponse.json({ ok: true });
      case "responder": {
        // Outside Meta's 24 h window only an approved template may be sent.
        if (!inServiceWindow(conv.lastInboundAt)) return NextResponse.json({ ok: false, message: "Pasaron más de 24 horas desde su último mensaje: solo se puede escribir con una plantilla aprobada." }, { status: 409 });
        // A person writing means the agent steps back.
        if (conv.status === "abierta") await setStatus(db, id, "humano");
        const sent = await sendAs(db, getAgentDeps(), conv, body.data.text, "persona");
        if (!sent.ok) return NextResponse.json({ ok: false, message: "WhatsApp no aceptó el mensaje." }, { status: 502 });
        return NextResponse.json({ ok: true });
      }
    }
  });
}
