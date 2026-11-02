import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";
import { createRealMetaAds, currencyOffset, getMetaAds, MetaAdsError, redactToken, withUtm } from "@/integrations/meta-ads";

const TOKEN = "EAAtesttoken1234567890";

type Call = { method: string; url: string; body: URLSearchParams };

/** Fake Graph API: routes by method + path suffix; records every call. */
function fakeGraph(routes: Record<string, (body: URLSearchParams) => { status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = method === "GET" ? new URL(url).searchParams : new URLSearchParams(String(init?.body ?? ""));
    calls.push({ method, url, body });
    const path = new URL(url).pathname.replace(/^\/v[\d.]+\//, "");
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(" ");
      return m === method && path.endsWith(p!);
    });
    const r = key ? routes[key]!(body) : { status: 404, json: { error: { message: "not found" } } };
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const adapter = (fetchImpl: typeof fetch, logs: unknown[] = []) =>
  createRealMetaAds({ token: TOKEN, adAccountId: "act_123", pageId: "999", fetchImpl, onApiCall: (c) => void logs.push(c) });

const account = (currency = "COP") => ({ json: { name: "Mokub Ads", currency, timezone_name: "America/Bogota", account_status: 1 } });

describe("helpers", () => {
  it("redacts tokens from text and query strings", () => {
    expect(redactToken(`bad ${TOKEN} here`, TOKEN)).toBe("bad [redacted] here");
    expect(redactToken("https://g/x?access_token=abc&x=1")).toBe("https://g/x?access_token=[redacted]&x=1");
  });
  it("uses offset 1 for COP and 100 for USD", () => {
    expect(currencyOffset("COP")).toBe(1);
    expect(currencyOffset("usd")).toBe(100);
  });
  it("adds Faro UTMs carrying the campaign id", () => {
    const u = new URL(withUtm("https://www.mokub.co/?ref=x", "123456"));
    expect(Object.fromEntries(u.searchParams)).toEqual({ ref: "x", utm_source: "meta", utm_medium: "paid_social", utm_campaign: "123456" });
  });
});

describe("getMetaAds selection", () => {
  it("is mock unless META_ADS_MODE=real with token, account and page", () => {
    expect(getMetaAds(parseEnv({})).isMock).toBe(true);
    expect(getMetaAds(parseEnv({ META_ADS_MODE: "real", META_ACCESS_TOKEN: TOKEN, META_AD_ACCOUNT_ID: "act_1" })).isMock).toBe(true);
    expect(getMetaAds(parseEnv({ META_ADS_MODE: "mock", META_ACCESS_TOKEN: TOKEN, META_AD_ACCOUNT_ID: "act_1", META_PAGE_ID: "2" })).isMock).toBe(true);
    expect(getMetaAds(parseEnv({ META_ADS_MODE: "real", META_ACCESS_TOKEN: TOKEN, META_AD_ACCOUNT_ID: "act_1", META_PAGE_ID: "2" })).isMock).toBe(false);
  });
});

describe("real adapter", () => {
  it("reads insights across pages and counts conversations", async () => {
    let page = 0;
    const g = fakeGraph({
      "GET act_123/insights": () => {
        page++;
        return page === 1
          ? { json: { data: [{ campaign_id: "1", campaign_name: "A", date_start: "2026-11-01", spend: "12000.5", impressions: "900", clicks: "20", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "3" }, { action_type: "link_click", value: "20" }] }], paging: { next: "n", cursors: { after: "c1" } } } }
          : { json: { data: [{ campaign_id: "1", campaign_name: "A", date_start: "2026-11-02", spend: "8000", impressions: "700", clicks: "11" }] } };
      },
    });
    const rows = await adapter(g.fetchImpl).getInsights({ since: "2026-11-01", until: "2026-11-02" });
    expect(rows).toEqual([
      { campaignId: "1", campaignName: "A", date: "2026-11-01", spend: 12000.5, impressions: 900, clicks: 20, conversations: 3 },
      { campaignId: "1", campaignName: "A", date: "2026-11-02", spend: 8000, impressions: 700, clicks: 11, conversations: 0 },
    ]);
    expect(g.calls[1]!.body.get("after")).toBe("c1");
    expect(JSON.parse(g.calls[0]!.body.get("time_range")!)).toEqual({ since: "2026-11-01", until: "2026-11-02" });
  });

  it("creates campaign, ad set, creative and ad, all PAUSED, with UTM link and COP budget", async () => {
    const g = fakeGraph({
      "GET act_123": () => account("COP"),
      "POST act_123/campaigns": () => ({ json: { id: "111" } }),
      "POST act_123/adsets": () => ({ json: { id: "222" } }),
      "POST act_123/adcreatives": () => ({ json: { id: "333" } }),
      "POST act_123/ads": () => ({ json: { id: "444" } }),
    });
    const out = await adapter(g.fetchImpl).createPausedCampaign({
      name: "Mokub prueba",
      url: "https://www.mokub.co/",
      dailyBudget: 20000,
      primaryText: "Texto",
      headline: "Título",
      imageUrl: "https://www.mokub.co/og.png",
      cta: "LEARN_MORE",
      geo: "bogota",
      ageMin: 25,
      ageMax: 60,
    });
    expect(out).toMatchObject({ campaignId: "111", adSetId: "222", creativeId: "333", adId: "444", isMock: false });
    expect(new URL(out.link).searchParams.get("utm_campaign")).toBe("111");
    const post = (p: string) => g.calls.find((c) => c.method === "POST" && c.url.endsWith(p))!.body;
    expect(post("/campaigns").get("status")).toBe("PAUSED");
    expect(post("/campaigns").get("objective")).toBe("OUTCOME_TRAFFIC");
    expect(post("/adsets").get("status")).toBe("PAUSED");
    expect(post("/adsets").get("daily_budget")).toBe("20000");
    expect(JSON.parse(post("/adsets").get("targeting")!).geo_locations.custom_locations[0].radius).toBe(25);
    expect(post("/ads").get("status")).toBe("PAUSED");
    const story = JSON.parse(post("/adcreatives").get("object_story_spec")!);
    expect(story.page_id).toBe("999");
    expect(story.link_data.link).toBe(out.link);
    expect(story.link_data.call_to_action.value.link).toBe(out.link);
  });

  it("multiplies the budget by 100 for USD accounts", async () => {
    const g = fakeGraph({
      "GET act_123": () => account("USD"),
      "POST act_123/campaigns": () => ({ json: { id: "1" } }),
      "POST act_123/adsets": () => ({ json: { id: "2" } }),
      "POST act_123/adcreatives": () => ({ json: { id: "3" } }),
      "POST act_123/ads": () => ({ json: { id: "4" } }),
    });
    await adapter(g.fetchImpl).createPausedCampaign({ name: "x", url: "https://www.mokub.co/", dailyBudget: 5, primaryText: "t", headline: "h", cta: "LEARN_MORE", geo: "co", ageMin: 18, ageMax: 65 });
    const adset = g.calls.find((c) => c.url.endsWith("/adsets"))!.body;
    expect(adset.get("daily_budget")).toBe("500");
    expect(JSON.parse(adset.get("targeting")!).geo_locations).toEqual({ countries: ["CO"] });
  });

  it("removes the half-built campaign when a later step fails, and never leaks the token", async () => {
    const logs: { error: string | null; endpoint: string }[] = [];
    const g = fakeGraph({
      "GET act_123": () => account(),
      "POST act_123/campaigns": () => ({ json: { id: "777" } }),
      "POST act_123/adsets": () => ({ status: 400, json: { error: { message: `Invalid token ${TOKEN}`, code: 100 } } }),
      "DELETE 777": () => ({ json: { success: true } }),
    });
    const err = await adapter(g.fetchImpl, logs)
      .createPausedCampaign({ name: "x", url: "https://www.mokub.co/", dailyBudget: 5000, primaryText: "t", headline: "h", cta: "LEARN_MORE", geo: "bogota", ageMin: 18, ageMax: 65 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaAdsError);
    expect((err as Error).message).not.toContain(TOKEN);
    expect(g.calls.some((c) => c.method === "DELETE" && c.url.endsWith("/777"))).toBe(true);
    expect(JSON.stringify(logs)).not.toContain(TOKEN);
    expect(logs.every((l) => !l.endpoint.includes("access_token"))).toBe(true);
  });

  it("rejects non-numeric campaign ids before calling Meta", async () => {
    const g = fakeGraph({});
    await expect(adapter(g.fetchImpl).setCampaignStatus("../act_1", "ACTIVE")).rejects.toThrow(MetaAdsError);
    expect(g.calls).toHaveLength(0);
  });
});
