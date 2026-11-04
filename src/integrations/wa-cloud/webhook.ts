import { createHmac } from "node:crypto";
import { z } from "zod";
import { safeEqual } from "@/lib/app-access";

/** `X-Hub-Signature-256: sha256=<hex HMAC of the raw body with the app secret>`. Fail-closed without a secret. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string | undefined): boolean {
  if (!appSecret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(header.slice("sha256=".length), expected);
}

/** GET handshake: returns the challenge to echo, or null to refuse. */
export function verifyChallenge(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null;
  if (params.get("hub.mode") !== "subscribe") return null;
  const given = params.get("hub.verify_token");
  if (!given || !safeEqual(given, verifyToken)) return null;
  return params.get("hub.challenge");
}

const referral = z
  .object({ source_type: z.string().optional(), source_id: z.string().optional(), source_url: z.string().optional(), ctwa_clid: z.string().optional() })
  .passthrough();

const message = z
  .object({
    from: z.string(),
    id: z.string(),
    timestamp: z.string().optional(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
    interactive: z
      .object({
        button_reply: z.object({ title: z.string() }).optional(),
        list_reply: z.object({ title: z.string() }).optional(),
      })
      .passthrough()
      .optional(),
    referral: referral.optional(),
  })
  .passthrough();

const status = z
  .object({ id: z.string(), status: z.string(), recipient_id: z.string().optional(), errors: z.array(z.object({ code: z.number().optional(), title: z.string().optional() }).passthrough()).optional() })
  .passthrough();

const value = z
  .object({
    metadata: z.object({ phone_number_id: z.string() }).passthrough(),
    contacts: z.array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() }).passthrough()).optional(),
    messages: z.array(message).optional(),
    statuses: z.array(status).optional(),
  })
  .passthrough();

export const metaWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({ changes: z.array(z.object({ field: z.string(), value: z.unknown() })) }).passthrough()),
});

export interface InboundMessage {
  phoneNumberId: string;
  /** E.164 */
  from: string;
  wamid: string;
  kind: "text" | "audio" | "image" | "other";
  text: string | null;
  contactName: string | null;
  /** Click-to-WhatsApp ad that opened the chat. */
  adId: string | null;
  adClick: boolean;
  at: Date;
}

export interface StatusUpdate {
  wamid: string;
  status: string;
  error: string | null;
}

const e164 = (waId: string) => `+${waId.replace(/\D/g, "")}`;

/** Flattens a Cloud API delivery into inbound messages and outbound status changes; ignores everything else. */
export function parseMetaWebhook(body: unknown): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const parsed = metaWebhookSchema.safeParse(body);
  const out = { messages: [] as InboundMessage[], statuses: [] as StatusUpdate[] };
  if (!parsed.success || parsed.data.object !== "whatsapp_business_account") return out;
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== "messages") continue;
      const v = value.safeParse(change.value);
      if (!v.success) continue;
      const names = new Map((v.data.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? null]));
      for (const m of v.data.messages ?? []) {
        const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        const kind = text !== null ? "text" : m.type === "audio" || m.type === "voice" ? "audio" : m.type === "image" ? "image" : "other";
        const ad = m.referral?.source_type === "ad" ? (m.referral.source_id ?? null) : null;
        out.messages.push({
          phoneNumberId: v.data.metadata.phone_number_id,
          from: e164(m.from),
          wamid: m.id,
          kind,
          text,
          contactName: names.get(m.from) ?? null,
          adId: ad && /^\d{5,25}$/.test(ad) ? ad : null,
          adClick: m.referral?.source_type === "ad" || !!m.referral?.ctwa_clid,
          at: m.timestamp && /^\d+$/.test(m.timestamp) ? new Date(Number(m.timestamp) * 1000) : new Date(),
        });
      }
      for (const s of v.data.statuses ?? []) {
        const err = s.errors?.[0];
        out.statuses.push({ wamid: s.id, status: s.status, error: err ? `${err.code ?? ""} ${err.title ?? ""}`.trim() : null });
      }
    }
  }
  return out;
}
