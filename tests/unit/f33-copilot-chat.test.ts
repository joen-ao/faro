import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AnthropicAdapter } from "@/integrations/anthropic";
import { briefFromText, chatCopilot, DEFAULT_AD_URL, type Variant } from "@/features/copilot";
import { mockAdBrief, mockAdChat } from "@/features/copilot/mock-chat";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
vi.mock("@/db/client", async (orig) => {
  const real = await orig<typeof import("@/db/client")>();
  return { ...real, getReadyDb: async () => conn.db };
});
beforeAll(async () => {
  conn = await createTestDb();
  vi.stubEnv("APP_ACCESS_KEY", "k-test");
  vi.stubEnv("META_ADS_MODE", "mock");
  vi.stubEnv("ANTHROPIC_MODE", "mock");
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await conn.close();
});

/** Adapter that always answers the given JSON and keeps the prompts it saw. */
const fixed = (reply: unknown) => {
  const prompts: string[] = [];
  const ai: AnthropicAdapter = {
    model: "test",
    isMock: false,
    async completeRaw(prompt) {
      prompts.push(prompt);
      return { text: JSON.stringify(reply), usage: { input_tokens: 10, output_tokens: 10 } };
    },
  };
  return { ai, prompts };
};

const ctx = { services: [{ id: "agentes-ia", name: "Agentes de IA y automatización" }], allowedHosts: ["www.mokub.co", "web.mokub.co"], maxBudget: 50000 };

const variant = (n: number): Variant => ({
  angle: `Ángulo ${n}`,
  format_hint: "estatico",
  hook: "Un hook corto",
  primaryText: `Texto principal del anuncio número ${n}. Segunda frase que alarga el texto.`,
  headline: `Título ${n}`,
  cta: "LEARN_MORE",
  hypothesis: "Prueba una idea",
});

describe("brief from one sentence", () => {
  it("keeps only catalog services and allowed destinations, flags the budget cap and never invents", async () => {
    const { ai } = fixed({ serviceId: "inventado", url: "evil.com/landing", dailyBudget: 90000, geo: "co", audience: "Clínicas", notes: null, count: 9, question: null });
    const r = await briefFromText("algo", ctx, ai);
    expect(r.brief).toMatchObject({ serviceId: null, url: DEFAULT_AD_URL, dailyBudget: 90000, geo: "co", audience: "Clínicas", count: 4 });
    expect(r.missing).toEqual(["serviceId"]);
    expect(r.question).toBe("¿Qué servicio quieres promocionar?");
    expect(r.warnings.join(" ")).toMatch(/evil\.com.*no está permitido/);
    expect(r.warnings.join(" ")).toMatch(/tope/);
  });

  it("normalizes a bare allowed host and asks Claude's own question when data is missing", async () => {
    const { ai, prompts } = fixed({ serviceId: "agentes-ia", url: "web.mokub.co", dailyBudget: null, geo: null, audience: "Dueños de restaurantes", question: "¿Cuánto al día?" });
    const r = await briefFromText("agentes para restaurantes en web.mokub.co", ctx, ai);
    expect(r.brief).toMatchObject({ serviceId: "agentes-ia", url: "https://web.mokub.co/", geo: "bogota" });
    expect(r).toMatchObject({ missing: ["dailyBudget"], question: "¿Cuánto al día?" });
    expect(prompts[0]).toContain("untrusted data");
  });
});

describe("chat edits", () => {
  it("applies valid edits to the right ad, rejects bad index/format, and lints the result", async () => {
    const { ai } = fixed({
      reply: "Listo.",
      edits: [
        { index: 2, changes: { headline: "Nuevo título corto", primaryText: "Garantizado 100 % o te devolvemos el dinero, resultados asegurados ya." } },
        { index: 7, changes: { headline: "x" } },
        { index: 1, changes: { primaryText: "corto" } },
        { index: 3, changes: { budget: 999999 } },
      ],
    });
    const r = await chatCopilot("cambia la 2", { brief: null, variants: [variant(1), variant(2), variant(3)], performance: [], learnings: [], history: [] }, new Set(), ai);
    expect(r.changed).toEqual([1]);
    expect(r.variants[1]!.headline).toBe("Nuevo título corto");
    expect(r.variants[0]!.primaryText).toBe(variant(1).primaryText);
    expect(r.variants[2]).toEqual(variant(3));
    expect(r.rejected).toHaveLength(2);
    expect(r.issues[1]!.length).toBeGreaterThan(0);
  });

  it("puts performance and history in the payload as data, with the no-actions rule", async () => {
    const { ai, prompts } = fixed({ reply: "Faltan datos.", edits: [] });
    await chatCopilot("¿cuál rinde mejor?", { brief: null, variants: [], performance: [], learnings: [{ statement: "El video gana", confidence: "media" }], history: [{ role: "user", text: "hola" }] }, new Set(), ai);
    expect(prompts[0]).toContain("cannot create, activate, pause or change budgets");
    expect(prompts[0]).toContain("El video gana");
  });
});

describe("mock replies", () => {
  it("reads service, budget, host and audience from a sentence", () => {
    const r = JSON.parse(mockAdBrief(JSON.stringify({ text: "Agentes de IA para clínicas dentales en Bogotá, 40 mil al día, a web.mokub.co", ...ctx })));
    expect(r).toMatchObject({ serviceId: "agentes-ia", dailyBudget: 40000, url: "https://web.mokub.co/", geo: "bogota" });
    expect(r.audience).toMatch(/clínicas dentales/);
    expect(JSON.parse(mockAdBrief(JSON.stringify({ text: "algo de 1,5 millones", ...ctx }))).dailyBudget).toBe(1_500_000);
  });

  it("shortens one ad or strips emojis", () => {
    const vs = [variant(1), { ...variant(2), headline: "Título 🚀 2" }].map((v, i) => ({ ...v, index: i + 1 }));
    const short = JSON.parse(mockAdChat(JSON.stringify({ message: "haz la 1 más corta", variants: vs })));
    expect(short.edits).toEqual([{ index: 1, changes: { primaryText: "Texto principal del anuncio número 1." } }]);
    const emoji = JSON.parse(mockAdChat(JSON.stringify({ message: "quita los emojis", variants: vs })));
    expect(emoji.edits[1].changes.headline).toBe("Título 2");
  });
});

describe("F33 endpoints (mock AI)", () => {
  const H = { "x-app-key": "k-test", "content-type": "application/json" };
  const post = (body: unknown, headers: Record<string, string> = H) => new Request("http://x/api", { method: "POST", headers, body: JSON.stringify(body) });

  it("require the app key", async () => {
    const brief = await import("@/app/api/ads/copilot/brief/route");
    const chat = await import("@/app/api/ads/copilot/chat/route");
    expect((await brief.POST(post({ text: "hola mundo" }, {}))).status).toBe(401);
    expect((await chat.POST(post({ message: "hola" }, {}))).status).toBe(401);
  });

  it("build a brief and edit an ad end to end", async () => {
    const brief = await import("@/app/api/ads/copilot/brief/route");
    const chat = await import("@/app/api/ads/copilot/chat/route");
    const b = await (await brief.POST(post({ text: "Agentes de IA para dueños de pymes en Bogotá, 30 mil al día" }))).json();
    expect(b.ok).toBe(true);
    expect(b.brief.dailyBudget).toBe(30000);
    const c = await (await chat.POST(post({ message: "haz la 2 más corta", variants: [variant(1), variant(2)] }))).json();
    expect(c).toMatchObject({ ok: true, changed: [1] });
    expect(c.variants[1].primaryText).toBe("Texto principal del anuncio número 2.");
    expect((await chat.POST(post({ message: "x", variants: [{ ...variant(1), cta: "BUY_NOW" }] }))).status).toBe(400);
  });
});
