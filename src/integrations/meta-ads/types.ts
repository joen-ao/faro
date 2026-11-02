/** F28 · Meta Marketing API adapter: reads metrics and creates paused campaigns. */

export type CampaignStatus = "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED" | "IN_PROCESS" | "WITH_ISSUES";

export interface MetaAccount {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  /** 1 = active (Meta account_status). */
  status: number;
  pageId: string;
  isMock: boolean;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: CampaignStatus | string;
  effectiveStatus: string;
  objective: string;
  /** Daily budget in account currency major units (summed over its ad sets), null when unknown. */
  dailyBudget: number | null;
  createdTime: string;
}

/** One campaign-day of insights; money in account currency major units. */
export interface MetaInsightRow {
  campaignId: string;
  campaignName: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversations: number;
}

export type CtaType = "LEARN_MORE" | "CONTACT_US" | "SIGN_UP" | "GET_QUOTE";

export interface PausedCampaignSpec {
  name: string;
  /** Destination URL without UTMs (validated: https + allowed host). */
  url: string;
  /** Daily budget in account currency major units (e.g. COP pesos). */
  dailyBudget: number;
  primaryText: string;
  headline: string;
  description?: string;
  imageUrl?: string;
  cta: CtaType;
  /** `bogota` = 25 km radius around Bogotá; `co` = all of Colombia. */
  geo: "bogota" | "co";
  ageMin: number;
  ageMax: number;
}

export interface CreatedCampaign {
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
  /** Final ad link, with UTMs carrying the campaign id. */
  link: string;
  isMock: boolean;
}

export interface MetaApiCall {
  service: "meta_ads";
  endpoint: string;
  status: number | null;
  latencyMs: number;
  error: string | null;
  costUsd: 0;
  isMock: boolean;
}
export type MetaApiCallLogger = (call: MetaApiCall) => void | Promise<void>;

export interface MetaAdsAdapter {
  readonly isMock: boolean;
  getAccount(): Promise<MetaAccount>;
  listCampaigns(): Promise<MetaCampaign[]>;
  getInsights(range: { since: string; until: string }): Promise<MetaInsightRow[]>;
  createPausedCampaign(spec: PausedCampaignSpec): Promise<CreatedCampaign>;
  setCampaignStatus(campaignId: string, status: "ACTIVE" | "PAUSED"): Promise<void>;
}

export class MetaAdsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "MetaAdsError";
  }
}

/** Currencies Meta handles without minor units (amounts are sent as-is). Others use offset 100. */
const OFFSET_ONE = new Set(["CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND"]);
export const currencyOffset = (currency: string): number => (OFFSET_ONE.has(currency.toUpperCase()) ? 1 : 100);

/** Bogotá city center, used for the `bogota` radius targeting. */
export const BOGOTA = { latitude: 4.711, longitude: -74.0721, radiusKm: 25 } as const;

/** Meta action types counted as "conversations started". */
export const CONVERSATION_ACTIONS = ["onsite_conversion.messaging_conversation_started_7d"] as const;
