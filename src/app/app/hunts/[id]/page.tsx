import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DEMO_HUNT_ID } from "@/features/hunts/demo";
import { HuntLive } from "@/features/hunts/ui/hunt-live";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Búsqueda en vivo · Faro" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function HuntPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lead?: string }> }) {
  const { id } = await params;
  const { lead } = await searchParams;
  // `/app/hunts/demo` is the seeded DEMO hunt (2.000 synthetic points); the stream route seeds it on first read.
  if (id === "demo") redirect(`/app/hunts/${DEMO_HUNT_ID}${lead ? `?lead=${encodeURIComponent(lead)}` : ""}`);
  if (!UUID.test(id)) notFound();
  return <HuntLive huntId={id} initialLeadId={lead && UUID.test(lead) ? lead : undefined} />;
}
