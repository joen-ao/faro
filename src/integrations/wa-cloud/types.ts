/** F44 · Meta WhatsApp Cloud API, the slice Faro's agent uses. */
export interface WaSendResult {
  /** Meta message id (wamid). */
  wamid: string;
}

export interface WaCloudAdapter {
  readonly isMock: boolean;
  sendText(to: string, body: string): Promise<WaSendResult>;
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
