import {
  BOGOTA,
  CONVERSATION_ACTIONS,
  currencyOffset,
  MetaAdsError,
  URL_TAGS,
  type CreatedAd,
  type CreatedCampaign,
  type MetaAccount,
  type MetaAd,
  type MetaAdInsightRow,
  type MetaAdSet,
  type MetaAdsAdapter,
  type MetaApiCallLogger,
  type MetaCampaign,
  type MetaInsightRow,
  type PausedCampaignSpec,
  type UploadedImage,
  type VideoState,
  type VideoUploadSession,
  type VideoUploadStep,
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

/** Thumbnails are only fetched from Meta's own CDN (never an arbitrary URL). */
export function isMetaCdn(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname.endsWith(".fbcdn.net") || u.hostname === "fbcdn.net");
  } catch {
    return false;
  }
}

/** Meta object ids are numeric; anything else could address another path of the Graph API. */
function checkId(id: string): string {
  if (!/^\d{5,25}$/.test(id)) throw new MetaAdsError("ID de Meta inválido", 400);
  return id;
}

function countConversations(actions: unknown): number {
  return ((actions as { action_type?: string; value?: string }[] | undefined) ?? [])
    .filter((a) => (CONVERSATION_ACTIONS as readonly string[]).includes(a.action_type ?? ""))
    .reduce((s, a) => s + Number(a.value ?? 0), 0);
}

export function createRealMetaAds(opts: RealMetaOptions): MetaAdsAdapter {
  const version = opts.apiVersion ?? "v25.0";
  const base = `https://graph.facebook.com/${version}`;
  const doFetch = opts.fetchImpl ?? fetch;
  const account = opts.adAccountId.startsWith("act_") ? opts.adAccountId : `act_${opts.adAccountId}`;
  let currency: string | null = null;

  async function call(method: "GET" | "POST" | "DELETE", path: string, params: Json = {}): Promise<Json> {
    const encoded = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      encoded.set(k, typeof v === "string" ? v : JSON.stringify(v));
    }
    encoded.set("access_token", opts.token);
    if (method === "GET") return send(method, path, `${base}/${path}?${encoded.toString()}`, {});
    return send(method, path, `${base}/${path}`, { headers: { "content-type": "application/x-www-form-urlencoded" }, body: encoded.toString() });
  }

  /** F32 · multipart POST (file uploads). */
  async function callForm(path: string, form: FormData, timeoutMs = 120_000): Promise<Json> {
    form.set("access_token", opts.token);
    return send("POST", path, `${base}/${path}`, { body: form }, timeoutMs);
  }

  async function send(method: string, path: string, url: string, init: RequestInit, timeoutMs = opts.timeoutMs ?? 30_000): Promise<Json> {
    const started = Date.now();
    let status: number | null = null;
    let error: string | null = null;
    try {
      const res = await doFetch(url, { ...init, method, signal: AbortSignal.timeout(timeoutMs) });
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

  async function uploadImage(bytes: Uint8Array, name: string): Promise<UploadedImage> {
    const form = new FormData();
    form.set("filename", new Blob([bytes as BlobPart]), name);
    const body = await callForm(`${account}/adimages`, form);
    const img = Object.values((body.images as Record<string, Json> | undefined) ?? {})[0];
    if (!img?.hash) throw new MetaAdsError("Meta no devolvió el hash de la imagen");
    return { hash: String(img.hash), url: String(img.url ?? ""), width: Number(img.width ?? 0), height: Number(img.height ?? 0) };
  }

  async function getVideo(videoId: string): Promise<VideoState> {
    const v = await call("GET", checkId(videoId), { fields: "status,picture" });
    const raw = String((v.status as { video_status?: string } | undefined)?.video_status ?? "processing");
    const status = raw === "ready" ? "ready" : raw === "error" ? "error" : "processing";
    let thumbnailUrl: string | null = null;
    if (status === "ready") {
      const t = await call("GET", `${checkId(videoId)}/thumbnails`, {});
      const list = (t.data as { uri?: string; is_preferred?: boolean }[] | undefined) ?? [];
      thumbnailUrl = (list.find((x) => x.is_preferred) ?? list[0])?.uri ?? null;
    }
    return { id: videoId, status, thumbnailUrl };
  }

  /** Meta requires a thumbnail for video ads: copy Meta's preferred one into the image library. */
  async function videoThumbnailHash(videoId: string): Promise<string> {
    const v = await getVideo(videoId);
    if (v.status !== "ready") throw new MetaAdsError("Un video todavía se está procesando en Meta. Espera a que esté listo.", 400);
    if (!v.thumbnailUrl || !isMetaCdn(v.thumbnailUrl)) throw new MetaAdsError("Meta aún no generó la miniatura del video", 400);
    const res = await doFetch(v.thumbnailUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new MetaAdsError("No se pudo leer la miniatura del video");
    return (await uploadImage(new Uint8Array(await res.arrayBuffer()), `thumb-${videoId}.jpg`)).hash;
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
        const conversations = countConversations(r.actions);
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

    async getAdInsights(range): Promise<MetaAdInsightRow[]> {
      const rows = await list(`${account}/insights`, {
        level: "ad",
        time_increment: "1",
        time_range: { since: range.since, until: range.until },
        fields: "ad_id,ad_name,campaign_id,spend,impressions,clicks,inline_link_clicks,frequency,actions,date_start",
        limit: "500",
      });
      return rows.map((r) => ({
        adId: String(r.ad_id),
        adName: String(r.ad_name ?? ""),
        campaignId: String(r.campaign_id ?? ""),
        date: String(r.date_start),
        spend: Number(r.spend ?? 0),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        linkClicks: Number(r.inline_link_clicks ?? 0),
        frequency: Number(r.frequency ?? 0),
        conversations: countConversations(r.actions),
      }));
    },

    async createPausedCampaign(spec: PausedCampaignSpec): Promise<CreatedCampaign> {
      if (spec.ads.length < 1 || spec.ads.length > 6) throw new MetaAdsError("Una campaña lleva entre 1 y 6 anuncios", 400);
      // Videos first: every one must be processed (and get a thumbnail) before anything is created.
      const thumbs = new Map<string, string>();
      for (const a of spec.ads) if (a.videoId && !thumbs.has(a.videoId)) thumbs.set(a.videoId, await videoThumbnailHash(a.videoId));
      const cur = await accountCurrency();
      const campaign = await call("POST", `${account}/campaigns`, {
        name: spec.name,
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: "false",
      });
      const campaignId = String(campaign.id);
      const link = `${withUtm(spec.url, campaignId)}&utm_content={{ad.id}}`;
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
        const ads: CreatedAd[] = [];
        for (const [i, a] of spec.ads.entries()) {
          const adName = a.name || `${spec.name} · anuncio ${i + 1}`;
          const cta = { type: a.cta, value: { link: spec.url } };
          const story = a.videoId
            ? {
                video_data: {
                  video_id: a.videoId,
                  image_hash: thumbs.get(a.videoId),
                  message: a.primaryText,
                  title: a.headline,
                  ...(a.description ? { link_description: a.description } : {}),
                  call_to_action: cta,
                },
              }
            : {
                link_data: {
                  link: spec.url,
                  message: a.primaryText,
                  name: a.headline,
                  ...(a.description ? { description: a.description } : {}),
                  ...(a.imageHash ? { image_hash: a.imageHash } : a.imageUrl ? { picture: a.imageUrl } : {}),
                  call_to_action: cta,
                },
              };
          const creative = await call("POST", `${account}/adcreatives`, {
            name: `${adName} · creativo`,
            // Meta appends these to every click; {{ad.id}} becomes utm_content so each lead knows its ad.
            url_tags: URL_TAGS,
            object_story_spec: { page_id: opts.pageId, ...story },
          });
          const ad = await call("POST", `${account}/ads`, {
            name: adName,
            adset_id: String(adSet.id),
            creative: { creative_id: String(creative.id) },
            status: "PAUSED",
          });
          ads.push({ adId: String(ad.id), creativeId: String(creative.id), name: adName });
        }
        return { campaignId, adSetId: String(adSet.id), ads, link, urlTags: URL_TAGS, isMock: false };
      } catch (e) {
        // Leave nothing half-built: the campaign (paused, never active) is removed with its children.
        await call("DELETE", campaignId).catch(() => undefined);
        throw e;
      }
    },

    uploadImage,
    getVideo,

    async startVideoUpload(fileSize: number): Promise<VideoUploadSession> {
      const b = await call("POST", `${account}/advideos`, { upload_phase: "start", file_size: String(fileSize) });
      return { videoId: String(b.video_id), sessionId: String(b.upload_session_id), startOffset: Number(b.start_offset), endOffset: Number(b.end_offset) };
    },

    async transferVideoChunk(sessionId: string, startOffset: number, chunk: Uint8Array): Promise<VideoUploadStep> {
      const form = new FormData();
      form.set("upload_phase", "transfer");
      form.set("upload_session_id", checkId(sessionId));
      form.set("start_offset", String(startOffset));
      form.set("video_file_chunk", new Blob([chunk as BlobPart]), "chunk");
      const b = await callForm(`${account}/advideos`, form);
      return { startOffset: Number(b.start_offset), endOffset: Number(b.end_offset) };
    },

    async finishVideoUpload(sessionId: string, title: string) {
      await call("POST", `${account}/advideos`, { upload_phase: "finish", upload_session_id: checkId(sessionId), title: title.slice(0, 250) });
    },

    async setCampaignStatus(campaignId, status) {
      await call("POST", checkId(campaignId), { status });
    },

    async listAds(): Promise<MetaAd[]> {
      const rows = await list(`${account}/ads`, { fields: "id,name,campaign_id,adset_id,status,effective_status", limit: "200" });
      return rows.map((a) => ({
        id: String(a.id),
        name: String(a.name ?? ""),
        campaignId: String(a.campaign_id ?? ""),
        adSetId: String(a.adset_id ?? ""),
        status: String(a.status ?? ""),
        effectiveStatus: String(a.effective_status ?? ""),
      }));
    },

    async listAdSets(): Promise<MetaAdSet[]> {
      const cur = await accountCurrency();
      const rows = await list(`${account}/adsets`, { fields: "id,name,campaign_id,status,daily_budget", limit: "200" });
      return rows.map((a) => ({
        id: String(a.id),
        name: String(a.name ?? ""),
        campaignId: String(a.campaign_id ?? ""),
        status: String(a.status ?? ""),
        dailyBudget: a.daily_budget ? Number(a.daily_budget) / currencyOffset(cur) : null,
      }));
    },

    async setAdStatus(adId, status) {
      await call("POST", checkId(adId), { status });
    },

    async setAdSetBudget(adSetId, dailyBudget) {
      const cur = await accountCurrency();
      if (!(dailyBudget > 0)) throw new MetaAdsError("Presupuesto inválido", 400);
      await call("POST", checkId(adSetId), { daily_budget: String(Math.round(dailyBudget * currencyOffset(cur))) });
    },
  };
}
