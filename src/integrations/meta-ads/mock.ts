import { withUtm } from "./real";
import { createHash } from "node:crypto";
import { URL_TAGS, type CreatedCampaign, type MetaAccount, type MetaAdInsightRow, type MetaAdsAdapter, type MetaCampaign, type MetaInsightRow, type PausedCampaignSpec } from "./types";

/** Video upload sessions outlive one adapter: each request builds its own (mock) adapter. */
const uploads = new Map<string, { videoId: string; size: number; received: number }>();
let uploadSeq = 1;

/** Deterministic, in-memory Meta Ads. Everything it returns is flagged mock and never reaches `ad_spend`. */
export function createMockMetaAds(): MetaAdsAdapter {
  const campaigns: MetaCampaign[] = [
    { id: "900000000000001", name: "DEMO · Mokub sitio web", status: "PAUSED", effectiveStatus: "PAUSED", objective: "OUTCOME_TRAFFIC", dailyBudget: 20000, createdTime: "2026-11-01T12:00:00-0500" },
  ];
  let seq = 2;
  const adStatus = new Map<string, string>([
    ["9000000000000011", "ACTIVE"],
    ["9000000000000012", "ACTIVE"],
  ]);
  let adSetBudget = 20000;
  return {
    isMock: true,
    async getAccount(): Promise<MetaAccount> {
      return { id: "act_mock", name: "Cuenta de prueba (mock)", currency: "COP", timezone: "America/Bogota", status: 1, pageId: "mock_page", isMock: true };
    },
    async listCampaigns() {
      return campaigns.map((c) => ({ ...c }));
    },
    async getInsights(range): Promise<MetaInsightRow[]> {
      const day = (offset: number) => {
        const d = new Date(`${range.until}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - offset);
        return d.toISOString().slice(0, 10);
      };
      return [0, 1]
        .map((o) => day(o))
        .filter((d) => d >= range.since)
        .map((date, i) => ({ campaignId: campaigns[0]!.id, campaignName: campaigns[0]!.name, date, spend: 18000 - i * 2000, impressions: 2400 - i * 300, clicks: 38 - i * 6, conversations: 0 }));
    },
    async getAdInsights(range): Promise<MetaAdInsightRow[]> {
      const rows = await this.getInsights(range);
      return rows.flatMap((r) => [
        { adId: `${r.campaignId}1`, adName: "DEMO · anuncio A", campaignId: r.campaignId, date: r.date, spend: r.spend * 0.6, impressions: Math.round(r.impressions * 0.6), clicks: Math.round(r.clicks * 0.7), linkClicks: Math.round(r.clicks * 0.6), frequency: 1.4, conversations: 0 },
        { adId: `${r.campaignId}2`, adName: "DEMO · anuncio B", campaignId: r.campaignId, date: r.date, spend: r.spend * 0.4, impressions: Math.round(r.impressions * 0.4), clicks: Math.round(r.clicks * 0.3), linkClicks: Math.round(r.clicks * 0.25), frequency: 1.2, conversations: 0 },
      ]);
    },
    async createPausedCampaign(spec: PausedCampaignSpec): Promise<CreatedCampaign> {
      const id = String(900000000000000 + seq++);
      campaigns.unshift({ id, name: spec.name, status: "PAUSED", effectiveStatus: "PAUSED", objective: "OUTCOME_TRAFFIC", dailyBudget: spec.dailyBudget, createdTime: new Date().toISOString() });
      const ads = spec.ads.map((a, i) => ({ adId: `${id}${i + 3}`, creativeId: `${id}${i + 3}0`, name: a.name || `${spec.name} · anuncio ${i + 1}` }));
      return { campaignId: id, adSetId: `${id}1`, ads, link: `${withUtm(spec.url, id)}&utm_content={{ad.id}}`, urlTags: URL_TAGS, isMock: true };
    },
    async setCampaignStatus(campaignId, status) {
      const c = campaigns.find((x) => x.id === campaignId);
      if (c) c.status = c.effectiveStatus = status;
    },
    async listAds() {
      return [...adStatus.entries()].map(([id, st]) => ({ id, name: `DEMO · anuncio ${id.slice(-1)}`, campaignId: campaigns[campaigns.length - 1]!.id, adSetId: "900000000000009", status: st, effectiveStatus: st }));
    },
    async listAdSets() {
      return [{ id: "900000000000009", name: "DEMO · conjunto", campaignId: campaigns[campaigns.length - 1]!.id, status: "ACTIVE", dailyBudget: adSetBudget }];
    },
    async setAdStatus(adId, status) {
      adStatus.set(adId, status);
    },
    async setAdSetBudget(_adSetId, dailyBudget) {
      adSetBudget = dailyBudget;
    },
    async uploadImage(bytes) {
      const hash = createHash("md5").update(bytes).digest("hex");
      return { hash, url: "https://www.mokub.co/og.png", width: 1080, height: 1080 };
    },
    async startVideoUpload(fileSize) {
      if (uploads.size > 100) uploads.clear();
      const n = uploadSeq++;
      const videoId = String(800000000000000 + n);
      const sessionId = String(700000000000000 + n);
      uploads.set(sessionId, { videoId, size: fileSize, received: 0 });
      return { videoId, sessionId, startOffset: 0, endOffset: Math.min(fileSize, 5_242_880) };
    },
    async transferVideoChunk(sessionId, startOffset, chunk) {
      const u = uploads.get(sessionId);
      if (!u || startOffset !== u.received) throw new Error("mock: unknown session or wrong offset");
      u.received += chunk.length;
      return { startOffset: u.received, endOffset: Math.min(u.size, u.received + 5_242_880) };
    },
    async finishVideoUpload() {},
    async getVideo(videoId) {
      return { id: videoId, status: "ready", thumbnailUrl: "https://www.mokub.co/og.png" };
    },
  };
}
