/** F31 · Meta Conversions API (server events for the Mokub dataset). */

/** Hashed / non-PII identifiers Meta matches on. Never contains raw email or phone. */
export interface CapiUserData {
  em?: string[];
  ph?: string[];
  external_id?: string[];
  fbc?: string;
  fbp?: string;
  client_ip_address?: string;
  client_user_agent?: string;
}

export interface CapiEvent {
  event_name: "Lead" | "QualifiedLead" | "PageView";
  /** Unix seconds. */
  event_time: number;
  /** Same id as the browser pixel event, so Meta deduplicates them. */
  event_id: string;
  action_source: "website" | "system_generated";
  event_source_url?: string;
  user_data: CapiUserData;
  custom_data?: Record<string, string | number>;
}

export interface CapiResult {
  ok: boolean;
  received: number;
  isMock: boolean;
  error?: string;
}

export interface CapiAdapter {
  readonly isMock: boolean;
  send(events: CapiEvent[]): Promise<CapiResult>;
}
