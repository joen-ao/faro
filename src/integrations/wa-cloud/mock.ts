import type { WaCloudAdapter } from "./types";

export interface MockWaCloud extends WaCloudAdapter {
  sent: { to: string; body: string; wamid: string }[];
  templates: { to: string; name: string; body: string[]; urlButton?: string; wamid: string }[];
  /** Statuses the mock reports; tests set them. */
  statuses: Record<string, string>;
  read: string[];
}

let seq = 0;

/** Records what would have been sent; nothing leaves the process. */
export function createMockWaCloud(): MockWaCloud {
  const sent: MockWaCloud["sent"] = [];
  const read: string[] = [];
  const templates: MockWaCloud["templates"] = [];
  const statuses: Record<string, string> = {};
  return {
    isMock: true,
    sent,
    read,
    templates,
    statuses,
    async sendTemplate(to, t) {
      const wamid = `wamid.mock-tpl-${Date.now()}-${++seq}`;
      templates.push({ to, name: t.name, body: t.body, urlButton: t.urlButton, wamid });
      return { wamid };
    },
    async templateStatuses() {
      return { ...statuses };
    },
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
