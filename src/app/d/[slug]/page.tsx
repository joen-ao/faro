import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createOptOutToken } from "@/features/compliance/optout";
import { computeBenchmark } from "@/features/diagnostic/benchmark";
import { getDiagnostic } from "@/features/diagnostic/data";
import { buildFindings, registryNote, safeHttpUrl } from "@/features/diagnostic/findings";
import { parseTracking } from "@/features/diagnostic/params";
import { DiagnosticView } from "../_components/diagnostic-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Diagnóstico de captación de pacientes",
  robots: { index: false, follow: false },
};

function optOutHref(leadId: string): string | null {
  try {
    return `/baja/${encodeURIComponent(createOptOutToken(leadId))}`;
  } catch {
    return null; // OPTOUT_SECRET missing in production: the page falls back to "reply to the message".
  }
}

export default async function DiagnosticPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const d = await getDiagnostic(slug);
  if (!d) notFound();
  const tracking = parseTracking(await searchParams);
  const now = new Date();
  return (
    <DiagnosticView
      slug={slug}
      tracking={tracking}
      company={{ name: d.company.name, isDemo: d.isDemo }}
      findings={buildFindings(d.company, d.site, now)}
      benchmark={computeBenchmark(d.site, d.peers, { city: d.company.city, websiteKnown: !!safeHttpUrl(d.company.website), now })}
      registry={registryNote(d.sources)}
      optOutHref={optOutHref(d.leadId)}
    />
  );
}
