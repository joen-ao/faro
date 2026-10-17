export interface EmailMessage {
  to: string;
  from: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  /** e.g. List-Unsubscribe / List-Unsubscribe-Post (RFC 8058). */
  headers?: Record<string, string>;
}

export interface EmailSendResult {
  /** Provider message id. */
  id: string;
}

export interface EmailAdapter {
  readonly isMock: boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}
