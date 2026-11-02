import {
  BOGOTA,
  CONVERSATION_ACTIONS,
  currencyOffset,
  MetaAdsError,
  type CreatedCampaign,
  type MetaAccount,
  type MetaAdsAdapter,
  type MetaApiCallLogger,
  type MetaCampaign,
  type MetaInsightRow,
  type PausedCampaignSpec,
} from "./types";

export interface RealMetaOptions {
  token: string;
  adAccountId: string;
  pageId: string;
  apiVersion?: string;
  onApiCall?: MetaApiCallLogger;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Removes the token (raw or as a query/body param) from any text before it is logged or returned. */
export function redactToken(text: string, token?: string): string {
  let out = text.replace(/(access_token=)[^&\s"']+/gi, "$1[redacted]");
  if (token && token.length >= 8) out = out.split(token).join("[redacted]");
  return out;
}

/** Adds Faro's UTMs to an ad link; the campaign id becomes `utm_campaign` so F13 can attribute leads. */
export function withUtm(url: string, campaignId: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", "meta");
  u.searchParams.set("utm_medium", "paid_social");
  u.searchParams.set("utm_campaign", campaignId);
  return u.toString();
}

type Json = Record<string, unknown>;

export function createRealMetaAds(opts: RealMetaOptions): MetaAdsAdapter {
  const version = opts.apiVersion ?? "v23.0";
  const base = `https://graph.facebook.com/${version}`;
  const doFetch = opts.fetchImpl ?? fetch;
  const account = opts.adAccountId.startsWith("act_") ? opts.adAccountId : `act_${opts.adAccountId}`;
  let currency: string | null = null;

  async function call(method: "GET" | "POST" | "DELETE", path: string, params: Json = {}): Promise<Json> {
    const started = Date.now();
    const encoded = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      encoded.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    encoded.set("access_token", opts.token);
    const url = method === "GET" ? `${base}/${path}?${encoded.toString()}` : `${base}/${path}`;
    let status: number | null = null;
    let error: string | null = null;
    try {
      const res = await doFetch(url, {
        method,
        headers: method === "GET" ? undefined : { "content-type": "application/x-www-form-urlencoded" },
        body: method === "GET" ? undefined : encoded.toString(),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
      });
      status = res.status;
      const body = (await res.json().catch(() => ({}))) as Json;
      if (!res.ok || body.error) {
        const e = (body.error ?? {}) as { message?: string; error_user_msg?: string; code?: number };
        error = redactToken(e.error_user_msg || e.message || `HTTP ${res.status}`, opts.token);
        throw new MetaAdsError(error, res.status, e.code);
      }
      return body;
    } catch (e) {
      if (e instanceof MetaAdsError) throw e;
      error = redactToken(e instanceof Error ? e.message : String(e), opts.token);
      throw new MetaAdsError(`No se pudo conectar con Meta: ${error}`);
    } finally {
      await opts.onApiCall?.({ service: "meta_ads", endpoint: `${method} ${path}`, status, latencyMs: Date.now() - started, error, costUsd: 0, isMock: false });
    }
  }

  /** Follows `paging.next` cursors (max `pages`). */
  async function list(path: string, params: Json, pages = 10): Promise<Json[]> {
    const out: Json[] = [];
    let after: string | undefined;
    for (let i = 0; i < pages; i++) {
      const body = await call("GET", path, { ...params, ...(after ? { after } : {}) });
      out.push(...((body.data as Json[] | undefined) ?? []));
      const paging = body.paging as { next?: string; cursors?: { after?: string } } | undefined;
      if (!paging?.next || !paging.cursors?.after) break;
      after = paging.cursors.after;
    }
    return out;
  }

  async function getAccount(): Promise<MetaAccount> {
    const a = await call("GET", account, { fields: "name,currency,timezone_name,account_status" });
    currency = String(a.currency ?? "USD");
    return {
      id: account,
      name: String(a.name ?? ""),
      currency,
      timezone: String(a.timezone_name ?? ""),
      status: Number(a.account_status ?? 0),
      pageId: opts.pageId,
      isMock: false,
    };
  }

  async function accountCurrency(): Promise<string> {
    return currency ?? (await getAccount()).currency;
  }

  return {
    isMock: false,
    getAccount,

    async listCampaigns(): Promise<MetaCampaign[]> {
      const cur = await accountCurrency();
      const rows = await list(`${account}/campaigns`, {
        fields: "id,name,status,effective_status,objective,daily_budget,created_time,adsets.limit(25){daily_budget}",
        limit: "100",
      });
      return rows.map((c) => {
        const adsets = ((c.adsets as { data?: { daily_budget?: string }[] } | undefined)?.data ?? []).map((a) => Number(a.daily_budget ?? 0));
        const minor = c.daily_budget ? Number(c.daily_budget) : adsets.reduce((s, b) => s + b, 0);
        return {
          id: String(c.id),
          name: String(c.name ?? ""),
          status: String(c.status ?? ""),
          effectiveStatus: String(c.effective_status ?? ""),
          objective: String(c.objective ?? ""),
          dailyBudget: minor > 0 ? minor / currencyOffset(cur) : null,
          createdTime: String(c.created_time ?? ""),
        };
      });
    },

    async getInsights(range): Promise<MetaInsightRow[]> {
      const rows = await list(`${account}/insights`, {
        level: "campaign",
        time_increment: "1",
        time_range: { since: range.since, until: range.until },
        fields: "campaign_id,campaign_name,spend,impressions,clicks,actions,date_start",
        limit: "500",
      });
      return rows.map((r) => {
        const actions = (r.actions as { action_type?: string; value?: string }[] | undefined) ?? [];
        const conversations = actions
          .filter((a) => (CONVERSATION_ACTIONS as readonly string[]).includes(a.action_type ?? ""))
          .reduce((s, a) => s + Number(a.value ?? 0), 0);
        return {
          campaignId: String(r.campaign_id),
          campaignName: String(r.campaign_name ?? ""),
          date: String(r.date_start),
          spend: Number(r.spend ?? 0),
          impressions: Number(r.impressions ?? 0),
          clicks: Number(r.clicks ?? 0),
          conversations,
        };
      });
    },

    async createPausedCampaign(spec: PausedCampaignSpec): Promise<CreatedCampaign> {
      const cur = await accountCurrency();
      const campaign = await call("POST", `${account}/campaigns`, {
        name: spec.name,
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: "false",
      });
      const campaignId = String(campaign.id);
      const link = withUtm(spec.url, campaignId);
      try {
        const geo =
          spec.geo === "co"
            ? { countries: ["CO"] }
            : { custom_locations: [{ latitude: BOGOTA.latitude, longitude: BOGOTA.longitude, radius: BOGOTA.radiusKm, distance_unit: "kilometer" }] };
        const adSet = await call("POST", `${account}/adsets`, {
          name: `${spec.name} · conjunto`,
          campaign_id: campaignId,
          daily_budget: String(Math.round(spec.dailyBudget * currencyOffset(cur))),
          billing_event: "IMPRESSIONS",
          optimization_goal: "LINK_CLICKS",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          destination_type: "WEBSITE",
          targeting: { geo_locations: geo, age_min: spec.ageMin, age_max: spec.ageMax, targeting_automation: { advantage_audience: 0 } },
          status: "PAUSED",
        });
        const creative = await call("POST", `${account}/adcreatives`, {
          name: `${spec.name} · creativo`,
          object_story_spec: {
            page_id: opts.pageId,
            link_data: {
              link,
              message: spec.primaryText,
              name: spec.headline,
              ...(spec.description ? { description: spec.description } : {}),
              ...(spec.imageUrl ? { picture: spec.imageUrl } : {}),
              call_to_action: { type: spec.cta, value: { link } },
            },
          },
        });
        const ad = await call("POST", `${account}/ads`, {
          name: `${spec.name} · anuncio`,
          adset_id: String(adSet.id),
          creative: { creative_id: String(creative.id) },
          status: "PAUSED",
        });
        return { campaignId, adSetId: String(adSet.id), creativeId: String(creative.id), adId: String(ad.id), link, isMock: false };
      } catch (e) {
        // Leave nothing half-built: the campaign (paused, never active) is removed with its children.
        await call("DELETE", campaignId).catch(() => undefined);
        throw e;
      }
    },

    async setCampaignStatus(campaignId, status) {
      if (!/^\d{5,25}$/.test(campaignId)) throw new MetaAdsError("ID de campaña inválido", 400);
      await call("POST", campaignId, { status });
    },
  };
}
