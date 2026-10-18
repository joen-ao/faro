import { eq } from "drizzle-orm";
import { z } from "zod";
import { appSettings } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { sendWindowPolicy, type SendWindowSetting } from "@/features/compliance/windows";

const KEY = "send_window";

export const sendWindowInput = z.discriminatedUnion("policy", [
  z.object({ policy: z.literal("ley2300") }),
  z.object({ policy: z.literal("extendida") }),
  z
    .object({
      policy: z.literal("custom"),
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(1).max(24),
      days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    })
    .refine((w) => w.endHour > w.startHour, { message: "La hora de fin debe ser mayor que la de inicio", path: ["endHour"] })
    .transform((w) => ({ ...w, days: [...new Set(w.days)].sort() })),
]);

export interface StoredSendWindow {
  setting: SendWindowSetting;
  /** "panel" when saved from /app/settings/envio, "env" when it falls back to SEND_WINDOW_POLICY. */
  origin: "panel" | "env";
  updatedAt: Date | null;
}

/** The active send window: the panel setting when saved, else SEND_WINDOW_POLICY from the environment. */
export async function getSendWindow(db: AppDb, env: Record<string, string | undefined> = process.env): Promise<StoredSendWindow> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  const parsed = row ? sendWindowInput.safeParse(row.value) : null;
  if (parsed?.success) return { setting: parsed.data, origin: "panel", updatedAt: row!.updatedAt };
  return { setting: { policy: sendWindowPolicy(env) }, origin: "env", updatedAt: null };
}

export async function saveSendWindow(db: AppDb, input: unknown): Promise<SendWindowSetting> {
  const setting = sendWindowInput.parse(input);
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: KEY, value: setting as Record<string, unknown>, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: setting as Record<string, unknown>, updatedAt: now } });
  return setting;
}
