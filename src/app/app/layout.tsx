import { headers } from "next/headers";
import { AppShell } from "@/components/app/app-sidebar";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { getAppShellData } from "@/features/app-shell/data";
import { requireAppAccess } from "@/lib/app-access";

async function shellDb(): Promise<AppDb | null> {
  const h = await headers();
  // No counts without access (login, access denied): the sidebar still renders, just without data.
  if (requireAppAccess(new Request("http://internal/app", { headers: h }))) return null;
  try {
    return (await getReadyDb()) as unknown as AppDb;
  } catch (e) {
    console.error("db unavailable for the sidebar", e);
    return null;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const data = await getAppShellData(await shellDb());
  return <AppShell data={data}>{children}</AppShell>;
}
