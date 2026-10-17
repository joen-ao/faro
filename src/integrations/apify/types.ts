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
  /** True for fictional output: no network, no robots check needed. */
  readonly isMock?: boolean;
  scrapeContacts(urls: string[]): Promise<ApifyRunResult>;
}

export class ApifyError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Cost of a run that did not succeed: still billed, so callers must record it. */
    readonly usageTotalUsd?: number,
    readonly runId?: string,
  ) {
    super(message);
    this.name = "ApifyError";
  }
}

import { BlockedUrlError as Blocked } from "@/lib/scrape-guard";

export const BlockedUrlError = Blocked;
export type BlockedUrlError = Blocked;
