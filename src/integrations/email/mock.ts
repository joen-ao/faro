import type { EmailAdapter, EmailMessage } from "./types";

export interface MockEmailAdapter extends EmailAdapter {
  /** Everything "sent" through this mock (never leaves the process). */
  readonly outbox: EmailMessage[];
}

/** No network, no keys. Ids are marked `mock_`. */
export function createMockEmail(): MockEmailAdapter {
  const outbox: EmailMessage[] = [];
  return {
    isMock: true,
    outbox,
    async send(message) {
      outbox.push(message);
      return { id: `mock_${outbox.length}_${Date.now().toString(36)}` };
    },
  };
}
