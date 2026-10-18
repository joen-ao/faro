import { mockIcpCriteria } from "@/features/icp/presets";
import { mockOfferAngles, mockServicesSuggest } from "@/features/offer/angles";
import type { AnthropicAdapter, Usage } from "./types";

export const MOCK_MODEL = "mock-claude";

/** Prompts carry `[[task:<name>]]` and the payload after a marker line. */
export function taskOf(prompt: string): string | null {
  return /\[\[task:([a-z_]+)\]\]/.exec(prompt)?.[1] ?? null;
}

function after(prompt: string, marker: string): string {
  const i = prompt.indexOf(marker);
  return i < 0 ? "" : prompt.slice(i + marker.length).trim();
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic: same prompt always yields the same text. Never touches the network. */
export function mockResponse(prompt: string): string {
  const task = taskOf(prompt);
  if (task === "icp_parse") return JSON.stringify(mockIcpCriteria(after(prompt, "USER_INPUT:")));
  if (task === "score_signals") {
    let parsed: { signals?: string[]; text?: string } = {};
    try {
      parsed = JSON.parse(after(prompt, "PAYLOAD:").split("\n")[0]);
    } catch {
      /* empty payload -> nothing found */
    }
    const text = parsed.text ?? "";
    const lower = norm(text);
    const results = (parsed.signals ?? []).map((signal) => {
      const hit = norm(signal)
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .find((w) => lower.includes(w));
      if (!hit) return { signal, found: false, quote: "" };
      const idx = lower.indexOf(hit);
      return { signal, found: true, quote: text.slice(Math.max(0, idx - 20), idx + hit.length + 40).trim() };
    });
    const found = results.filter((r) => r.found).map((r) => r.signal);
    return JSON.stringify({ signals: results, why_now: found.length ? `Muestra senales de ${found.join(", ")}.` : "" });
  }
  if (task === "services_suggest") return mockServicesSuggest(after(prompt, "DESCRIPTION:"));
  if (task === "offer_angles") return mockOfferAngles(after(prompt, "PAYLOAD:").split("\n")[0] ?? "");
  if (task === "outreach_message") {
    let p: {
      company?: string;
      sector?: string;
      city?: string;
      offer?: string;
      service?: { name?: string; outcome?: string };
      finding?: string;
      help?: string;
    } = {};
    try {
      p = JSON.parse(after(prompt, "PAYLOAD:").split("\n")[0]);
    } catch {
      /* fall back to generic copy */
    }
    const company = p.company || "su empresa";
    const where = p.city ? ` en ${p.city}` : "";
    const what = p.sector ? ` de ${p.sector}` : "";
    if (p.service?.name && p.service.outcome) {
      // One real finding -> one service, as the prompt asks.
      return JSON.stringify({
        subject: `Una idea para ${company}`.slice(0, 70),
        opening: p.finding
          ? `Revisamos la información pública de ${company}: ${p.finding}.`
          : `Vimos que ${company} trabaja en el sector${what}${where} y quisimos escribirle con una idea concreta.`,
        value: `${p.help ? `${p.help}, le proponemos` : "Le proponemos"} ${p.service.name}. ${p.service.outcome}`.slice(0, 300),
      });
    }
    return JSON.stringify({
      subject: `Una idea para ${company}`,
      opening: `Vimos que ${company} trabaja en el sector${what}${where} y quisimos escribirle con una idea concreta, sin compromiso.`,
      value: p.offer && p.offer.length >= 10 ? `${p.offer}`.slice(0, 280) : "Ayudamos a pymes a encontrar nuevos clientes y a medir cuánto cuesta conseguir cada uno.",
    });
  }
  // Unknown task: stable pseudo-output so callers can still exercise validation paths.
  return JSON.stringify({ mock: true, hash: fnv(prompt) });
}

export function createMockAnthropic(): AnthropicAdapter {
  return {
    model: MOCK_MODEL,
    isMock: true,
    async completeRaw(prompt) {
      const text = mockResponse(prompt);
      const usage: Usage = { input_tokens: Math.ceil(prompt.length / 4), output_tokens: Math.ceil(text.length / 4) };
      return { text, usage };
    },
  };
}
