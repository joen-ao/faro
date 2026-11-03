import type { Variant } from "./propose";

/** F33 · Mock replies for `ad_brief` and `ad_chat`: deterministic, built from the payload (never presented as real). */

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function mockAdBrief(payloadLine: string): string {
  let p: { text?: string; services?: { id: string; name: string }[]; allowedHosts?: string[] } = {};
  try {
    p = JSON.parse(payloadLine);
  } catch {
    /* empty */
  }
  const text = p.text ?? "";
  const t = fold(text);
  const service = (p.services ?? []).find((s) => fold(s.name).split(/\W+/).filter((w) => w.length > 4).some((w) => t.includes(w)));
  const money = /(\d+(?:[.,]\d+)*)\s*(millon(?:es)?|mil|k\b)?/.exec(t.replace(/\$/g, ""));
  let budget: number | null = null;
  if (money) {
    const n = Number(money[1]!.replace(/[.,](?=\d{3}\b)/g, "").replace(",", "."));
    const unit = money[2] ?? "";
    budget = Math.round(unit.startsWith("millon") ? n * 1_000_000 : unit ? n * 1000 : n);
    if (!(budget >= 1000)) budget = null;
  }
  const host = (p.allowedHosts ?? []).find((h) => t.includes(h));
  const audience = /(?:para|a)\s+((?:due|gerente|clinica|pyme|empresa|negocio|restaurante|odontolog)[^,.]*)/.exec(t)?.[1] ?? null;
  return JSON.stringify({
    serviceId: service?.id ?? null,
    url: host ? `https://${host}/` : null,
    dailyBudget: budget,
    geo: /colombia|nacional|todo el pais/.test(t) ? "co" : /bogota/.test(t) ? "bogota" : null,
    audience: audience ? text.slice(t.indexOf(audience), t.indexOf(audience) + audience.length) : null,
    notes: null,
    count: null,
    question: null,
  });
}

export function mockAdChat(payloadLine: string): string {
  let p: { message?: string; variants?: (Variant & { index: number })[] } = {};
  try {
    p = JSON.parse(payloadLine);
  } catch {
    /* empty */
  }
  const m = fold(p.message ?? "");
  const vs = p.variants ?? [];
  const n = Number(/\b(?:la|el|anuncio|variante)\s*(\d)\b/.exec(m)?.[1] ?? 0);
  const targets = n ? vs.filter((v) => v.index === n) : vs;
  if (/emoji/.test(m)) {
    const strip = (s: string) => s.replace(/\p{Extended_Pictographic}️?/gu, "").replace(/\s{2,}/g, " ").trim();
    return JSON.stringify({ reply: "Modo de prueba: quité los emojis.", edits: targets.map((v) => ({ index: v.index, changes: { primaryText: strip(v.primaryText), headline: strip(v.headline), hook: strip(v.hook) } })) });
  }
  if (/corta|corto|resum|acorta/.test(m) && targets.length) {
    return JSON.stringify({
      reply: `Modo de prueba: acorté el texto ${n ? `del anuncio ${n}` : "de todos los anuncios"} a su primera frase.`,
      edits: targets.map((v) => {
        const first = /^.{20,}?[.!?](?=\s|$)/.exec(v.primaryText)?.[0] ?? v.primaryText.slice(0, 120);
        return { index: v.index, changes: { primaryText: first.length >= 20 ? first : v.primaryText } };
      }),
    });
  }
  return JSON.stringify({ reply: "Modo de prueba: con la IA real respondo preguntas sobre el rendimiento y edito los anuncios. Aquí entiendo «más corta» y «sin emojis».", edits: [] });
}
