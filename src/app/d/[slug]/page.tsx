import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createOptOutToken } from "@/features/compliance/optout";
import { computeBenchmark } from "@/features/diagnostic/benchmark";
import { getDiagnostic } from "@/features/diagnostic/data";
import { buildFindings, registryNote, safeHttpUrl } from "@/features/diagnostic/findings";
import { parseTracking } from "@/features/diagnostic/params";
import { howWeHelp, recommendService } from "@/features/offer/match";
import { localize } from "@/features/diagnostic/vocab";
import { DiagnosticView } from "../_components/diagnostic-view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Diagnóstico gratuito de su presencia digital",
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
  const findings = buildFindings(d.company, d.site, now).map((f) => ({ ...f, title: localize(f.title, d.health), why: localize(f.why, d.health), recommendation: localize(f.recommendation, d.health) }));
  // Deterministic, no AI on the page: one template per finding kind naming the service and its outcome.
  const rec = recommendService(findings, d.offer.services, d.offer.angles);
  const help: Record<string, string> = {};
  for (const f of findings) {
    if (f.status === "ok") continue;
    const line = howWeHelp(f.id, d.offer.services, d.offer.angles);
    if (line) help[f.id] = line;
  }
  const offer = rec ? { help, service: { name: rec.service.name, outcome: rec.service.outcome, entryOffer: rec.service.entryOffer ?? null } } : undefined;
  return (
    <DiagnosticView
      slug={slug}
      tracking={tracking}
      company={{ name: d.company.name, isDemo: d.isDemo }}
      findings={findings}
      offer={offer}
      benchmark={computeBenchmark(d.site, d.peers, { city: d.benchCity, websiteKnown: !!safeHttpUrl(d.company.website), now })}
      registry={registryNote(d.sources)}
      optOutHref={optOutHref(d.leadId)}
      health={d.health}
      seller={d.offer.company}
    />
  );
}
