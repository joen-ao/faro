import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AccessDenied } from "@/features/hunts/ui/access-denied";
import { HuntLive } from "@/features/hunts/ui/hunt-live";
import { requireAppAccess } from "@/lib/app-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Búsqueda en vivo · Faro", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HuntPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lead?: string }> }) {
  const { id } = await params;
  const { lead } = await searchParams;
  const jar = await cookies();
  if (requireAppAccess(new Request("http://faro.local/app/hunts", { headers: { cookie: jar.toString() } }))) return <AccessDenied />;
  if (!UUID.test(id)) notFound();
  return <HuntLive huntId={id} initialLeadId={lead && UUID.test(lead) ? lead : undefined} />;
}
