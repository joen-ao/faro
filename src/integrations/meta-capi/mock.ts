import type { CapiAdapter, CapiEvent } from "./types";

/** Records events in memory; sends nothing. */
export function createMockCapi(): CapiAdapter & { sent: CapiEvent[] } {
  const sent: CapiEvent[] = [];
  return {
    isMock: true,
    sent,
    async send(events) {
      sent.push(...events);
      return { ok: true, received: events.length, isMock: true };
    },
  };
}
