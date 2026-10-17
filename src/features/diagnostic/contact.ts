import { z } from "zod";
import { isGenericEmail } from "@/features/compliance/email";

/** Company contact form. No person names: only company, a generic mailbox or role, and a message. */
export const contactSchema = z.object({
  slug: z.string().trim().min(1).max(120),
  company: z.string().trim().min(2, "Escribe el nombre de la empresa").max(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Escribe un correo válido")
    .max(160)
    .refine(isGenericEmail, "Usa un correo de la empresa como info@, citas@ o contacto@"),
  role: z.string().trim().max(60).optional(),
  message: z.string().trim().min(5, "Cuéntanos brevemente qué necesitas").max(500, "Máximo 500 caracteres"),
  consent: z.literal(true, { error: "Debes aceptar el aviso de privacidad" }),
  c: z.string().max(20).optional(),
  s: z.string().max(20).optional(),
  utm: z.record(z.string(), z.string().max(80)).optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;

export type ContactResult =
  | { kind: "ok"; data: ContactInput }
  | { kind: "bot" }
  | { kind: "invalid"; errors: Record<string, string> };

/** `hp` is the honeypot: humans never see or fill it, so any value means a bot (silently accepted, never stored). */
export function parseContact(input: unknown): ContactResult {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof raw.hp === "string" && raw.hp.length > 0) return { kind: "bot" };
  const r = contactSchema.safeParse(input);
  if (r.success) return { kind: "ok", data: r.data };
  const errors: Record<string, string> = {};
  for (const i of r.error.issues) errors[String(i.path[0] ?? "form")] ??= i.message;
  return { kind: "invalid", errors };
}
