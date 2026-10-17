import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ICP_PAGES } from "@/config/icp-pages";
import { parseTracking } from "@/features/diagnostic/params";
import { DiagnosticView } from "../../_components/diagnostic-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Diagnóstico para tu empresa", robots: { index: false, follow: false } };

/** Generic ICP page for paid media: `/d/icp/<icpSlug>?utm_source=meta&utm_campaign=<id>`. No lead exists until the form is sent. */
export default async function IcpDiagnosticPage({
  params,
  searchParams,
}: {
  params: Promise<{ icpSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { icpSlug } = await params;
  const icp = Object.hasOwn(ICP_PAGES, icpSlug) ? ICP_PAGES[icpSlug] : undefined;
  if (!icp) notFound();
  const tracking = parseTracking(await searchParams);
  return <DiagnosticView slug={`icp:${icp.slug}`} tracking={tracking} findings={[]} icp={icp} optOutHref={null} />;
}
