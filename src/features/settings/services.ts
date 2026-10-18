import { eq } from "drizzle-orm";
import { appSettings } from "@/db/schema";
import type { AppDb } from "@/db/types";
import { DEFAULT_CATALOG_NOTE, DEFAULT_COMPANY, DEFAULT_SERVICES } from "@/config/default-services";
import { CatalogSetting, type Service } from "@/features/offer/schema";

const KEY = "services";

export interface StoredCatalog {
  services: Service[];
  note?: string;
  company?: string;
  /** "panel" when saved from /app/settings/oferta, "default" while the initial (mokub.co) catalog is in use. */
  origin: "panel" | "default";
  updatedAt: Date | null;
}

/** The initial catalog, already validated (ids, cleaned text). */
export function defaultCatalog(): StoredCatalog {
  const parsed = CatalogSetting.parse({ services: DEFAULT_SERVICES, note: DEFAULT_CATALOG_NOTE, company: DEFAULT_COMPANY.name });
  return { ...parsed, origin: "default", updatedAt: null };
}

/** The team's services: the saved catalog, else the initial one (nothing is written until the team edits it). */
export async function getServiceCatalog(db: AppDb): Promise<StoredCatalog> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  const parsed = row ? CatalogSetting.safeParse(row.value) : null;
  if (parsed?.success) return { ...parsed.data, origin: "panel", updatedAt: row!.updatedAt };
  return defaultCatalog();
}

export async function saveServiceCatalog(db: AppDb, input: unknown): Promise<CatalogSetting> {
  const setting = CatalogSetting.parse(input);
  const value = JSON.parse(JSON.stringify(setting)) as Record<string, unknown>;
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: KEY, value, updatedAt: now })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
  return setting;
}
