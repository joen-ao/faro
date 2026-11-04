import type { WaCloudAdapter } from "./types";

export interface MockWaCloud extends WaCloudAdapter {
  sent: { to: string; body: string; wamid: string }[];
  read: string[];
}

let seq = 0;

/** Records what would have been sent; nothing leaves the process. */
export function createMockWaCloud(): MockWaCloud {
  const sent: MockWaCloud["sent"] = [];
  const read: string[] = [];
  return {
    isMock: true,
    sent,
    read,
    async sendText(to, body) {
      const wamid = `wamid.mock-${Date.now()}-${++seq}`;
      sent.push({ to, body, wamid });
      return { wamid };
    },
    async markRead(wamid) {
      read.push(wamid);
    },
  };
}
