import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { BookingInput, type MokubBooking } from "./mokub";

export const PRODUCTS = ["mapa", "agente_whatsapp", "landing_agente", "flujo", "rag", "software", "sprint", "web_esencial", "web_completa", "web_medida", "no_sabe"] as const;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "consultar_horarios",
    description:
      "Consulta las horas libres del Diagnóstico gratis de 20 minutos en el calendario de Mokub. Úsala antes de ofrecer cualquier hora y otra vez si la persona pide otro día. Sin date devuelve los próximos 3 días hábiles con horas libres ({ok, days:[{date, slots}]}); con date devuelve las horas de ese día ({ok, date, slots}). Las horas vienen en HH:MM (24 h) en la zona tz. Si ok es false, no inventes horas.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Fecha que pidió la persona, YYYY-MM-DD. Omítela si no pidió un día concreto." },
        tz: { type: "string", description: "Zona IANA de la persona. America/Bogota salvo que diga que está en otro país." },
      },
    },
  },
  {
    name: "agendar_diagnostico",
    description:
      "Reserva el Diagnóstico gratis de 20 minutos. Úsala una sola vez, solo cuando la persona confirmó una hora que devolvió consultar_horarios y ya tienes su nombre completo, su correo, el nombre del negocio y su autorización para usar esos datos. Si responde ok:true, confirma con el texto de when. Si responde slot_taken, ofrece las horas de slots. Si responde duplicado, di que ya tiene una reunión agendada hoy con ese correo. Si responde datos_invalidos, pide solo ese dato.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre completo (nombre y apellido)." },
        email: { type: "string", description: "Correo para la invitación." },
        empresa: { type: "string", description: "Nombre del negocio." },
        interes: { type: "string", enum: ["agentes", "automatizacion", "rag", "software", "web", "no_se"] },
        fecha: { type: "string", description: "YYYY-MM-DD, tal como vino en consultar_horarios." },
        hora: { type: "string", description: "HH:MM (24 h), tal como vino en consultar_horarios." },
        tz: { type: "string", description: "La misma zona que usaste en consultar_horarios." },
        autorizo: { type: "boolean", description: "true solo si la persona autorizó usar su nombre y correo para la invitación." },
      },
      required: ["nombre", "email", "empresa", "interes", "fecha", "hora", "autorizo"],
    },
  },
  {
    name: "guardar_datos",
    description: "Guarda lo que aprendiste de la persona. Solo los campos nuevos.",
    input_schema: {
      type: "object",
      properties: {
        nombre_negocio: { type: "string", description: "Nombre del negocio; nunca el de una persona." },
        producto_interes: { type: "string", enum: [...PRODUCTS] },
        ref_diagnostico: { type: "string", description: 'Lo que va después de "ref." en el primer mensaje, sin paréntesis.' },
        quiere_comprar: { type: "boolean", description: "true si confirmó que quiere comprar un producto de precio cerrado y aceptó que el equipo le escriba con la factura." },
      },
    },
  },
  {
    name: "pasar_a_persona",
    description: "Pasa la conversación a una persona del equipo de Mokub. Después de esto no respondes más en esta conversación.",
    input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] },
  },
  {
    name: "terminar",
    description: "Cierra la conversación después de tu despedida (ver reglas). Indica si quedó calificado y un resumen de una o dos frases sin correos ni nombres de personas.",
    input_schema: {
      type: "object",
      properties: { calificado: { type: "boolean" }, resumen: { type: "string" } },
      required: ["calificado", "resumen"],
    },
  },
];

const SaveInput = z.object({
  nombre_negocio: z.string().trim().min(2).max(160).optional(),
  producto_interes: z.enum(PRODUCTS).optional(),
  ref_diagnostico: z.string().trim().regex(/^[\w-]{3,80}$/).optional(),
  quiere_comprar: z.boolean().optional(),
});

const AvailabilityInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), tz: z.string().trim().max(64).optional() });
const EndInput = z.object({ calificado: z.boolean(), resumen: z.string().trim().min(3).max(600) });
const HandoffInput = z.object({ motivo: z.string().trim().min(2).max(300) });

/** What a tool run changes; the engine persists it. Internal keys start with "_". */
export interface ToolEffects {
  variables: Record<string, unknown>;
  handoff?: string;
  end?: boolean;
  booked?: { when: string; email: string };
  wantsToBuy?: boolean;
  failed?: boolean;
}

export interface ToolEnv {
  phone: string;
  variables: Record<string, unknown>;
  booking: MokubBooking;
}

/** "2026-11-10" + "16:20" in Bogotá -> ISO with offset; other zones keep the wall time and name the zone. */
export function meetingIso(fecha: string, hora: string, tz?: string): string {
  return !tz || tz === "America/Bogota" ? `${fecha}T${hora}:00-05:00` : `${fecha}T${hora}:00 ${tz}`;
}

const collectSlots = (res: Record<string, unknown>): string[] => {
  const out: string[] = [];
  if (Array.isArray(res.slots)) out.push(...res.slots.filter((s): s is string => typeof s === "string"));
  if (Array.isArray(res.days)) for (const d of res.days as { slots?: unknown }[]) if (Array.isArray(d?.slots)) out.push(...d.slots.filter((s): s is string => typeof s === "string"));
  return out;
};

export async function runTool(name: string, rawInput: unknown, env: ToolEnv): Promise<{ result: Record<string, unknown>; effects: ToolEffects }> {
  const v = env.variables;
  const offered = new Set<string>(Array.isArray(v._slots) ? (v._slots as string[]) : []);
  const fail = (result: Record<string, unknown>): { result: Record<string, unknown>; effects: ToolEffects } => ({ result, effects: { variables: { _fallos: Number(v._fallos ?? 0) + 1 }, failed: true } });

  switch (name) {
    case "consultar_horarios": {
      const q = AvailabilityInput.safeParse(rawInput ?? {});
      if (!q.success) return { result: { ok: false, error: "datos_invalidos", mensaje: "date debe ser YYYY-MM-DD" }, effects: { variables: {} } };
      try {
        const res = await env.booking.availability({ date: q.data.date, tz: q.data.tz, whatsapp: env.phone });
        if (res.ok !== true) return fail(res);
        const slots = collectSlots(res);
        return { result: res, effects: { variables: { _slots: [...new Set([...offered, ...slots])] } } };
      } catch {
        return fail({ ok: false, error: "error", mensaje: "No se pudo consultar la agenda." });
      }
    }
    case "agendar_diagnostico": {
      if (v.reunion_agendada === true) return { result: { ok: false, error: "ya_agendada", mensaje: "Esta conversación ya tiene una reunión agendada." }, effects: { variables: {} } };
      const input = (rawInput ?? {}) as Record<string, unknown>;
      if (input.autorizo !== true) return { result: { ok: false, error: "sin_autorizacion", mensaje: "Pide la autorización para usar el nombre y el correo antes de agendar." }, effects: { variables: {} } };
      const parsed = BookingInput.safeParse({ ...input, whatsapp: env.phone });
      if (!parsed.success) {
        const campo = String(parsed.error.issues[0]?.path[0] ?? "");
        return { result: { ok: false, error: "datos_invalidos", campo }, effects: { variables: {} } };
      }
      if (!offered.has(parsed.data.hora)) return { result: { ok: false, error: "hora_no_consultada", mensaje: "Esa hora no salió de consultar_horarios: consulta primero." }, effects: { variables: {} } };
      try {
        const res = await env.booking.book(parsed.data);
        if (res.ok === true) {
          const when = typeof res.when === "string" ? res.when : `${parsed.data.fecha} ${parsed.data.hora}`;
          return {
            result: res,
            effects: {
              variables: { reunion_agendada: true, fecha_reunion: meetingIso(parsed.data.fecha, parsed.data.hora, parsed.data.tz), _email: parsed.data.email.toLowerCase(), nombre_negocio: v.nombre_negocio ?? parsed.data.empresa },
              booked: { when, email: parsed.data.email },
            },
          };
        }
        // slot_taken / duplicado / datos_invalidos are answers, not outages.
        if (res.error === "slot_taken" || res.error === "duplicado" || res.error === "datos_invalidos" || res.error === "hora_invalida") {
          return { result: res, effects: { variables: { _slots: [...new Set([...offered, ...collectSlots(res)])] } } };
        }
        return fail(res);
      } catch {
        return fail({ ok: false, error: "error", mensaje: "No se pudo agendar." });
      }
    }
    case "guardar_datos": {
      const p = SaveInput.safeParse(rawInput ?? {});
      if (!p.success) return { result: { ok: false, error: "datos_invalidos" }, effects: { variables: {} } };
      const wantsToBuy = p.data.quiere_comprar === true && v.quiere_comprar !== true;
      return { result: { ok: true }, effects: { variables: { ...p.data }, wantsToBuy } };
    }
    case "pasar_a_persona": {
      const p = HandoffInput.safeParse(rawInput ?? {});
      return { result: { ok: true }, effects: { variables: {}, handoff: p.success ? p.data.motivo : "sin motivo" } };
    }
    case "terminar": {
      const p = EndInput.safeParse(rawInput ?? {});
      if (!p.success) return { result: { ok: false, error: "datos_invalidos" }, effects: { variables: {} } };
      return { result: { ok: true }, effects: { variables: { calificado: p.data.calificado, resumen: p.data.resumen }, end: true } };
    }
    default:
      return { result: { ok: false, error: "herramienta_desconocida" }, effects: { variables: {} } };
  }
}
