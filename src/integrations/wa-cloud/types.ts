/** F44 · Meta WhatsApp Cloud API, the slice Faro's agent uses. */
export interface WaSendResult {
  /** Meta message id (wamid). */
  wamid: string;
}

export interface WaCloudAdapter {
  readonly isMock: boolean;
  sendText(to: string, body: string): Promise<WaSendResult>;
  /** F45 · Sends an approved template: body parameters in order, plus the URL button's dynamic suffix if any. */
  sendTemplate(to: string, t: { name: string; language: string; body: string[]; urlButton?: string }): Promise<WaSendResult>;
  /** F45 · Status of every template in the WhatsApp Business Account (name -> APPROVED | PENDING | REJECTED …). */
  templateStatuses(): Promise<Record<string, string>>;
  /** Marks an inbound message as read and shows "typing…" until the next message (or ~25 s). */
  markRead(wamid: string, typing: boolean): Promise<void>;
}

export class WaCloudError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "WaCloudError";
  }
}
