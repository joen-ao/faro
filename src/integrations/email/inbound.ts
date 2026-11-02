/**
 * F27 · Resend receiving: the `email.received` webhook carries only metadata, so the content (text, html, headers)
 * is read with GET /emails/receiving/{id}. Needs a full-access key (a sending-only key gets 401).
 */
export interface ReceivedEmail {
  id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string | null;
  headers: Record<string, string>;
  messageId: string | null;
}

type FetchLike = typeof fetch;

export async function fetchReceivedEmail(id: string, apiKey: string, fetcher: FetchLike = fetch): Promise<ReceivedEmail | null> {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) return null;
  try {
    const res = await fetcher(`https://api.resend.com/emails/receiving/${id}?html_format=cid`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const headers: Record<string, string> = {};
    const h = j.headers;
    if (h && typeof h === "object") for (const [k, v] of Object.entries(h as Record<string, unknown>)) if (typeof v === "string") headers[k.toLowerCase()] = v.slice(0, 4000);
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []);
    return {
      id,
      from: typeof j.from === "string" ? j.from : "",
      to: list(j.to),
      subject: typeof j.subject === "string" ? j.subject.slice(0, 500) : "",
      text: typeof j.text === "string" ? j.text.slice(0, 50_000) : "",
      html: typeof j.html === "string" ? j.html.slice(0, 500_000) : null,
      headers,
      messageId: typeof j.message_id === "string" ? j.message_id : null,
    };
  } catch {
    return null;
  }
}
