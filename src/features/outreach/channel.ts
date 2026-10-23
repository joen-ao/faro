import { isGenericEmail } from "@/features/compliance/email";
import type { Country } from "@/features/compliance/windows";
import type { ContactChannel } from "@/db/types";

export interface ContactRow {
  /** `social` pages are shown to the team but never used to send (platform terms forbid automated DMs). */
  type: "email" | "phone" | "whatsapp" | "web_form" | "social";
  value: string;
  isGeneric: boolean;
}

export interface ChannelOption {
  channel: ContactChannel;
  value: string;
  /** Only informative: the compliance gate has the final word. */
  usable: boolean;
  note?: string;
}

export interface ChannelOptions {
  whatsappEnabled: boolean;
  country: Country;
}

/**
 * Candidate channels in priority order (SPEC §9.2): generic email > web form (assisted) > WhatsApp (only
 * when enabled). Non-generic emails are listed as not usable so the UI can explain the block.
 * US: email only (CAN-SPAM).
 */
export function channelOptions(contacts: ContactRow[], opts: ChannelOptions): ChannelOption[] {
  const out: ChannelOption[] = [];
  const emails = contacts.filter((c) => c.type === "email");
  const generic = emails.find((c) => c.isGeneric && isGenericEmail(c.value));
  if (generic) out.push({ channel: "email", value: generic.value, usable: true });
  else if (emails[0]) out.push({ channel: "email", value: emails[0].value, usable: false, note: "Correo no genérico (parece de una persona)" });
  if (opts.country !== "US") {
    const form = contacts.find((c) => c.type === "web_form");
    if (form) out.push({ channel: "web_form", value: form.value, usable: true, note: "Asistido: lo envía una persona" });
    const wa = contacts.find((c) => c.type === "whatsapp");
    if (wa) {
      out.push(
        opts.whatsappEnabled
          ? { channel: "whatsapp", value: wa.value, usable: true }
          : { channel: "whatsapp", value: wa.value, usable: false, note: "WhatsApp desactivado (WHATSAPP_ENABLED=false)" },
      );
    }
  }
  return out;
}

/** First usable option, or null when the lead has no allowed channel. */
export function selectChannel(contacts: ContactRow[], opts: ChannelOptions): ChannelOption | null {
  return channelOptions(contacts, opts).find((o) => o.usable) ?? null;
}

/** Option for an explicit channel (even if not usable, so the gate can explain the block). */
export function optionFor(contacts: ContactRow[], opts: ChannelOptions, channel: ContactChannel): ChannelOption | null {
  return channelOptions(contacts, opts).find((o) => o.channel === channel) ?? null;
}
