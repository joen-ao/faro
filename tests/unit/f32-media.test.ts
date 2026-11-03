import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRealMetaAds, isMetaCdn } from "@/integrations/meta-ads/real";
import { MetaAdsError } from "@/integrations/meta-ads";
import { safeName, sniffImage } from "@/features/ads/media";
import { mediaOf } from "@/features/copilot/create";
import { VariantSchema } from "@/features/copilot/propose";
import { createTestDb } from "../helpers/test-db";

let conn: Awaited<ReturnType<typeof createTestDb>>;
vi.mock("@/db/client", async (orig) => {
  const real = await orig<typeof import("@/db/client")>();
  return { ...real, getReadyDb: async () => conn.db };
});

const TOKEN = "EAAtesttoken1234567890";
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

type Seen = { method: string; path: string; form: Record<string, string | { size: number; name: string }> };

/** Graph API double that understands both urlencoded and multipart bodies. */
function graph(handler: (s: Seen) => unknown) {
  const seen: Seen[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname.endsWith("fbcdn.net")) return new Response(JPG, { status: 200 });
    const method = init?.method ?? "GET";
    const form: Seen["form"] = {};
    if (init?.body instanceof FormData) for (const [k, v] of init.body.entries()) form[k] = typeof v === "string" ? v : { size: v.size, name: (v as File).name };
    else for (const [k, v] of (method === "GET" ? url.searchParams : new URLSearchParams(String(init?.body ?? ""))).entries()) form[k] = v;
    const s = { method, path: url.pathname.replace(/^\/v[\d.]+\//, ""), form };
    seen.push(s);
    const json = handler(s) ?? { error: { message: `no route ${method} ${s.path}` } };
    return new Response(JSON.stringify(json), { status: (json as { error?: unknown }).error ? 400 : 200 });
  }) as typeof fetch;
  return { seen, ads: createRealMetaAds({ token: TOKEN, adAccountId: "act_123", pageId: "999", fetchImpl }) };
}

describe("helpers", () => {
  it("sniffs JPG/PNG by magic bytes and builds safe names", () => {
    expect(sniffImage(JPG)).toBe("jpg");
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(new TextEncoder().encode("<svg>"))).toBeNull();
    expect(safeName("../Anúncio final (1).HEIC", "jpg")).toBe("Anuncio-final-1.jpg");
    expect(isMetaCdn("https://scontent.fbog2-4.fna.fbcdn.net/x.jpg")).toBe(true);
    expect(isMetaCdn("https://evil.com/fbcdn.net.jpg")).toBe(false);
  });

  it("variants accept an uploaded hash or video id and record the media kind", () => {
    const base = { angle: "Ahorro", format_hint: "estatico", hook: "Hook corto", primaryText: "x".repeat(25), headline: "Título", cta: "LEARN_MORE", hypothesis: "Prueba algo" };
    expect(VariantSchema.safeParse({ ...base, imageHash: "nothex" }).success).toBe(false);
    expect(VariantSchema.parse({ ...base, videoId: "2609467862859585", imageHash: "" })).toMatchObject({ videoId: "2609467862859585" });
    expect(mediaOf({ videoId: "123456", imageHash: "a".repeat(32) })).toEqual({ mediaType: "video", mediaRef: "123456" });
    expect(mediaOf({ imageHash: "a".repeat(32) })).toEqual({ mediaType: "image", mediaRef: "a".repeat(32) });
    expect(mediaOf({})).toEqual({ mediaType: null, mediaRef: null });
  });
});

describe("real adapter uploads", () => {
  it("uploads an image as multipart and returns its hash", async () => {
    const { ads, seen } = graph((s) => (s.path === "act_123/adimages" ? { images: { "a.jpg": { hash: "f".repeat(32), url: "https://x.fbcdn.net/a.jpg", width: 1080, height: 1080 } } } : null));
    expect(await ads.uploadImage(JPG, "a.jpg")).toEqual({ hash: "f".repeat(32), url: "https://x.fbcdn.net/a.jpg", width: 1080, height: 1080 });
    expect(seen[0]!.form.filename).toEqual({ size: JPG.length, name: "a.jpg" });
  });

  it("runs the chunked video phases with Meta's offsets", async () => {
    const { ads, seen } = graph((s) => {
      if (s.form.upload_phase === "start") return { video_id: "55555", upload_session_id: "66666", start_offset: "0", end_offset: "1048576" };
      if (s.form.upload_phase === "transfer") return { start_offset: String(Number(s.form.start_offset) + (s.form.video_file_chunk as { size: number }).size), end_offset: "9999999" };
      if (s.form.upload_phase === "finish") return { success: true };
      return null;
    });
    expect(await ads.startVideoUpload(5000)).toEqual({ videoId: "55555", sessionId: "66666", startOffset: 0, endOffset: 1048576 });
    expect(await ads.transferVideoChunk("66666", 0, new Uint8Array(3000))).toEqual({ startOffset: 3000, endOffset: 9999999 });
    await ads.finishVideoUpload("66666", "promo.mp4");
    expect(seen.map((s) => s.form.upload_phase)).toEqual(["start", "transfer", "finish"]);
    await expect(ads.transferVideoChunk("../x", 0, new Uint8Array(1))).rejects.toBeInstanceOf(MetaAdsError);
  });

  it("maps video status and picks the preferred thumbnail", async () => {
    let ready = false;
    const { ads } = graph((s) => {
      if (s.path === "55555") return { status: { video_status: ready ? "ready" : "processing" } };
      if (s.path === "55555/thumbnails") return { data: [{ uri: "https://a.fbcdn.net/1.jpg" }, { uri: "https://a.fbcdn.net/2.jpg", is_preferred: true }] };
      return null;
    });
    expect(await ads.getVideo("55555")).toEqual({ id: "55555", status: "processing", thumbnailUrl: null });
    ready = true;
    expect(await ads.getVideo("55555")).toEqual({ id: "55555", status: "ready", thumbnailUrl: "https://a.fbcdn.net/2.jpg" });
  });
});

describe("creatives with uploaded media", () => {
  const spec = (ads: { videoId?: string; imageHash?: string; imageUrl?: string }[]) => ({
    name: "Prueba",
    url: "https://www.mokub.co/es",
    dailyBudget: 20000,
    geo: "bogota" as const,
    ageMin: 25,
    ageMax: 65,
    ads: ads.map((a, i) => ({ name: `A${i}`, primaryText: "Texto principal", headline: "Título", description: "Desc", cta: "LEARN_MORE" as const, ...a })),
  });
  const routes = (videoStatus = "ready") => (s: Seen) => {
    if (s.path === "act_123" && s.method === "GET") return { name: "Mokub", currency: "COP", timezone_name: "America/Bogota", account_status: 1 };
    if (s.path === "55555") return { status: { video_status: videoStatus } };
    if (s.path === "55555/thumbnails") return { data: [{ uri: "https://a.fbcdn.net/t.jpg", is_preferred: true }] };
    if (s.path === "act_123/adimages") return { images: { t: { hash: "b".repeat(32) } } };
    if (s.path === "act_123/campaigns") return { id: "111" };
    if (s.path === "act_123/adsets") return { id: "222" };
    if (s.path === "act_123/adcreatives") return { id: "333" };
    if (s.path === "act_123/ads") return { id: "444" };
    if (s.method === "DELETE") return { success: true };
    return null;
  };

  it("builds video_data with Meta's thumbnail copied to the library, and link_data with image_hash", async () => {
    const { ads, seen } = graph(routes());
    await ads.createPausedCampaign(spec([{ videoId: "55555" }, { imageHash: "c".repeat(32), imageUrl: "https://ignored.example/x.png" }]));
    const stories = seen.filter((s) => s.path === "act_123/adcreatives").map((s) => JSON.parse(String(s.form.object_story_spec)));
    expect(stories[0]).toEqual({
      page_id: "999",
      video_data: { video_id: "55555", image_hash: "b".repeat(32), message: "Texto principal", title: "Título", link_description: "Desc", call_to_action: { type: "LEARN_MORE", value: { link: "https://www.mokub.co/es" } } },
    });
    expect(stories[1].link_data).toMatchObject({ image_hash: "c".repeat(32) });
    expect(stories[1].link_data).not.toHaveProperty("picture");
  });

  it("creates nothing while a video is still processing", async () => {
    const { ads, seen } = graph(routes("processing"));
    await expect(ads.createPausedCampaign(spec([{ videoId: "55555" }]))).rejects.toThrow(/procesando/);
    expect(seen.some((s) => s.path === "act_123/campaigns")).toBe(false);
  });
});

describe("upload routes (mock Meta)", () => {
  beforeAll(async () => {
    conn = await createTestDb();
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await conn.close();
  });

  async function load() {
    vi.resetModules();
    vi.stubEnv("APP_ACCESS_KEY", "k-test");
    vi.stubEnv("META_ADS_MODE", "mock");
    return {
      image: await import("@/app/api/ads/meta/media/image/route"),
      video: await import("@/app/api/ads/meta/media/video/route"),
      finish: await import("@/app/api/ads/meta/media/video/finish/route"),
      state: await import("@/app/api/ads/meta/media/video/[id]/route"),
    };
  }
  const H = { "x-app-key": "k-test" };
  const imageReq = (bytes: Uint8Array, headers: Record<string, string> = H) => {
    const form = new FormData();
    form.set("file", new Blob([bytes as BlobPart]), "foto.jpg");
    return new Request("http://x/api/ads/meta/media/image", { method: "POST", body: form, headers });
  };

  it("require the session or app key", async () => {
    const r = await load();
    expect((await r.image.POST(imageReq(JPG, {}))).status).toBe(401);
    expect((await r.video.POST(new Request("http://x/v", { method: "POST", body: "{}" }))).status).toBe(401);
    expect((await r.video.PUT(new Request("http://x/v?session=12345&offset=0", { method: "PUT", body: "x" }))).status).toBe(401);
    expect((await r.state.GET(new Request("http://x/v/12345"), { params: Promise.resolve({ id: "12345" }) })).status).toBe(401);
  });

  it("accepts JPG/PNG only and returns the library hash", async () => {
    const r = await load();
    const ok = await r.image.POST(imageReq(JPG));
    expect(ok.status).toBe(200);
    expect((await ok.json()).image.hash).toMatch(/^[a-f0-9]{32}$/);
    expect((await r.image.POST(imageReq(new TextEncoder().encode("GIF89a")))).status).toBe(400);
  });

  it("uploads a video in chunks, finishes it and reports it ready", async () => {
    const r = await load();
    const json = (b: unknown) => ({ method: "POST", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify(b) });
    expect((await r.video.POST(new Request("http://x/v", json({ fileSize: 10, name: "promo.gif" })))).status).toBe(400);
    const start = await (await r.video.POST(new Request("http://x/v", json({ fileSize: 7, name: "promo.mp4" })))).json();
    const { sessionId, videoId } = start.upload;
    const put = (offset: number, body: Uint8Array) => r.video.PUT(new Request(`http://x/v?session=${sessionId}&offset=${offset}`, { method: "PUT", headers: H, body: body as BodyInit }));
    expect((await (await put(0, new Uint8Array(4))).json()).next).toEqual({ startOffset: 4, endOffset: 7 });
    expect((await (await put(4, new Uint8Array(3))).json()).next.startOffset).toBe(7);
    expect((await put(0, new Uint8Array(0))).status).toBe(400);
    expect((await r.finish.POST(new Request("http://x/f", json({ session: sessionId, name: "promo.mp4" })))).status).toBe(200);
    const st = await (await r.state.GET(new Request(`http://x/v/${videoId}`, { headers: H }), { params: Promise.resolve({ id: videoId }) })).json();
    expect(st.video.status).toBe("ready");
  });
});
