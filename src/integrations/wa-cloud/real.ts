import { WaCloudError, type WaCloudAdapter } from "./types";

type Fetch = typeof fetch;

export function createRealWaCloud(opts: { phoneNumberId: string; token: string; version: string; fetch?: Fetch }): WaCloudAdapter {
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
    async markRead(wamid, typing) {
      await post({ status: "read", message_id: wamid, ...(typing ? { typing_indicator: { type: "text" } } : {}) });
    },
  };
}
