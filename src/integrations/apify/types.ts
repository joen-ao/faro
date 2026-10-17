export const APIFY_API = "https://api.apify.com/v2";

/** Contacts an Apify contact actor found for one start URL (no personal names are requested or kept). */
export interface ApifyContactItem {
  url: string;
  emails: string[];
  phones: string[];
  whatsapps: string[];
}

export interface ApifyRunResult {
  items: ApifyContactItem[];
  runId: string | null;
  /** Real cost of the whole run (`usageTotalUsd`); shared by all URLs of the run. */
  usageTotalUsd: number;
  latencyMs: number;
  isMock: boolean;
}

export interface ApifyAdapter {
  scrapeContacts(urls: string[]): Promise<ApifyRunResult>;
}

export class ApifyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

/** Thrown for URLs Faro must never scrape: Google Maps (Places API only) and social networks. */
export class BlockedUrlError extends ApifyError {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}
