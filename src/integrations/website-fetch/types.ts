export const WEBSITE_LICENSE = "Sitio web público de la empresa";
export const FETCH_TIMEOUT_MS = 8000;
export const MAX_BODY_BYTES = 1_000_000;
export const MAX_REDIRECTS = 3;
export const MAX_CONTACT_PAGES = 2;
export const MAX_WEBSITE_TEXT_BYTES = 8 * 1024;

/** `social`: the company's own Instagram/Facebook/LinkedIn/TikTok page (a URL), never a person's profile. */
export type ContactType = "email" | "phone" | "whatsapp" | "web_form" | "social";

/** A contact found on a company's own public site. Never a person's name. */
export interface ExtractedContact {
  type: ContactType;
  value: string;
  /** Role mailbox / published company line. WhatsApp numbers stay false (often a personal mobile). */
  isGeneric: boolean;
  evidenceUrl: string;
}

export interface SiteSignals {
  hasContactForm: boolean;
  /** Links to an online booking tool or says "agenda tu cita en línea". */
  onlineBooking: boolean;
  /** Site has neither a booking tool nor an appointment form. */
  noAppointmentForm: boolean;
  /** Platform names only (facebook, instagram...), never profile URLs. */
  socialNetworks: string[];
  copyrightYear: number | null;
}

export interface SiteExtraction {
  contacts: ExtractedContact[];
  signals: SiteSignals;
  /** Visible text, <= 8 KB, without team/doctor blocks or "Dr. Nombre" mentions. */
  websiteText: string;
  /** Count only: the personal-looking addresses themselves are never stored. */
  discardedPersonalEmails: number;
}

export interface SiteFetchResult {
  url: string;
  pages: Array<{ url: string; status: number; truncated: boolean }>;
  skipped: Array<{ url: string; reason: string }>;
  extraction: SiteExtraction;
  /** HTTP requests made, robots.txt included. */
  requests: number;
  latencyMs: number;
  isMock: boolean;
  error?: string;
}

export interface WebsiteFetchAdapter {
  fetchSite(url: string): Promise<SiteFetchResult>;
  /** robots.txt check only (used before handing a URL to Apify). Unsafe or unreachable robots => false. */
  allows(url: string): Promise<boolean>;
}
