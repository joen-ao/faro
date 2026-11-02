import { withUtm } from "./real";
import type { CreatedCampaign, MetaAccount, MetaAdsAdapter, MetaCampaign, MetaInsightRow, PausedCampaignSpec } from "./types";

/** Deterministic, in-memory Meta Ads. Everything it returns is flagged mock and never reaches `ad_spend`. */
export function createMockMetaAds(): MetaAdsAdapter {
  const campaigns: MetaCampaign[] = [
    { id: "900000000000001", name: "DEMO · Mokub sitio web", status: "PAUSED", effectiveStatus: "PAUSED", objective: "OUTCOME_TRAFFIC", dailyBudget: 20000, createdTime: "2026-11-01T12:00:00-0500" },
  ];
  let seq = 2;
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
    async createPausedCampaign(spec: PausedCampaignSpec): Promise<CreatedCampaign> {
      const id = String(900000000000000 + seq++);
      campaigns.unshift({ id, name: spec.name, status: "PAUSED", effectiveStatus: "PAUSED", objective: "OUTCOME_TRAFFIC", dailyBudget: spec.dailyBudget, createdTime: new Date().toISOString() });
      return { campaignId: id, adSetId: `${id}1`, creativeId: `${id}2`, adId: `${id}3`, link: withUtm(spec.url, id), isMock: true };
    },
    async setCampaignStatus(campaignId, status) {
      const c = campaigns.find((x) => x.id === campaignId);
      if (c) c.status = c.effectiveStatus = status;
    },
  };
}
