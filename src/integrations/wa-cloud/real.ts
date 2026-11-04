import { WaCloudError, type WaCloudAdapter } from "./types";

type Fetch = typeof fetch;

export function createRealWaCloud(opts: { phoneNumberId: string; token: string; version: string; businessAccountId?: string; fetch?: Fetch }): WaCloudAdapter {
  const doFetch = opts.fetch ?? fetch;
  const url = `https://graph.facebook.com/${opts.version}/${encodeURIComponent(opts.phoneNumberId)}/messages`;
  async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await doFetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${opts.token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const err = (json.error ?? {}) as { message?: string; code?: number };
      // The token is never part of the message.
      throw new WaCloudError(`whatsapp cloud ${res.status}: ${err.message ?? "error"}`, res.status, err.code);
    }
    return json;
  }
  return {
    isMock: false,
    async sendText(to, body) {
      const json = await post({ recipient_type: "individual", to: to.replace(/^\+/, ""), type: "text", text: { body, preview_url: false } });
      const wamid = (json.messages as { id?: string }[] | undefined)?.[0]?.id;
      if (!wamid) throw new WaCloudError("whatsapp cloud: no message id", 502);
      return { wamid };
    },
    async sendTemplate(to, t) {
      const components: Record<string, unknown>[] = [];
      if (t.body.length) components.push({ type: "body", parameters: t.body.map((text) => ({ type: "text", text })) });
      if (t.urlButton) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: t.urlButton }] });
      const json = await post({ recipient_type: "individual", to: to.replace(/^\+/, ""), type: "template", template: { name: t.name, language: { code: t.language }, components } });
      const wamid = (json.messages as { id?: string }[] | undefined)?.[0]?.id;
      if (!wamid) throw new WaCloudError("whatsapp cloud: no message id", 502);
      return { wamid };
    },
    async templateStatuses() {
      if (!opts.businessAccountId) throw new WaCloudError("whatsapp cloud: WA_BUSINESS_ACCOUNT_ID missing", 400);
      const url = `https://graph.facebook.com/${opts.version}/${encodeURIComponent(opts.businessAccountId)}/message_templates?fields=name,status&limit=200`;
      const res = await doFetch(url, { headers: { authorization: `Bearer ${opts.token}` }, signal: AbortSignal.timeout(15_000) });
      const json = (await res.json().catch(() => ({}))) as { data?: { name?: string; status?: string }[]; error?: { message?: string } };
      if (!res.ok) throw new WaCloudError(`whatsapp cloud ${res.status}: ${json.error?.message ?? "error"}`, res.status);
      const out: Record<string, string> = {};
      for (const t of json.data ?? []) if (t.name && t.status) out[t.name] = out[t.name] === "APPROVED" ? "APPROVED" : t.status;
      return out;
    },
    async markRead(wamid, typing) {
      await post({ status: "read", message_id: wamid, ...(typing ? { typing_indicator: { type: "text" } } : {}) });
    },
  };
}
