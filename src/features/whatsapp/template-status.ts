import { eq } from "drizzle-orm";
import { appSettings } from "@/db/schema";
import type { AppDb } from "@/db/types";
import type { WaCloudAdapter } from "@/integrations/wa-cloud";

const KEY = "wa_template_status";
const TTL_MS = 3600 * 1000;

export interface TemplateStatus {
  statuses: Record<string, string>;
  checkedAt: string;
  error?: string;
}

/** F45 · Template statuses from Meta, cached one hour in app_settings so selecting targets does not call Meta each time. */
export async function templateStatus(db: AppDb, cloud: WaCloudAdapter, opts: { now?: Date; refresh?: boolean } = {}): Promise<TemplateStatus> {
  const now = opts.now ?? new Date();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  const cached = row?.value as unknown as TemplateStatus | undefined;
  if (!opts.refresh && cached && now.getTime() - Date.parse(cached.checkedAt) < TTL_MS) return cached;
  let value: TemplateStatus;
  try {
    value = { statuses: await cloud.templateStatuses(), checkedAt: now.toISOString() };
  } catch (e) {
    // Keep the last known statuses; a Meta outage never makes a rejected template look approved.
    value = { statuses: cached?.statuses ?? {}, checkedAt: now.toISOString(), error: e instanceof Error ? e.message.slice(0, 200) : "error" };
  }
  await db
    .insert(appSettings)
    .values({ key: KEY, value: value as unknown as Record<string, unknown>, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: value as unknown as Record<string, unknown>, updatedAt: now } });
  return value;
}

export const approvedNames = (s: TemplateStatus) => new Set(Object.entries(s.statuses).filter(([, v]) => v === "APPROVED").map(([k]) => k));
