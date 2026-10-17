import type { Metadata } from "next";
import { z } from "zod";
import { LeadReceipt } from "@/components/lead-receipt";
import { getDb } from "@/db/client";
import { buildDemoReceipt, getLeadReceipt } from "@/features/metrics";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recibo de lead (interno)", robots: { index: false } };

/** Internal test page: `?demo=1` shows a DEMO receipt from a throwaway DB; `?lead=<uuid>` a real one. */
export default async function ReceiptDevPage({ searchParams }: { searchParams: Promise<{ demo?: string; lead?: string }> }) {
  const sp = await searchParams;
  const leadId = z.string().uuid().safeParse(sp.lead);
  const receipt = sp.demo === "1" ? await buildDemoReceipt() : leadId.success ? await getLeadReceipt(getDb().db, leadId.data) : null;

  return (
    <main className="relative isolate min-h-dvh px-4 py-10 sm:py-16">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" style={{ background: "var(--faro-glow-violet)" }} />
      <div className="mx-auto mb-8 max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-faro-text-3">Interno · F13</p>
        <h1 className="mt-2 text-2xl font-bold">Recibo de lead</h1>
        <p className="mt-1 text-sm text-faro-text-2">Cada línea se puede seguir hasta su registro de costo.</p>
      </div>
      {receipt ? (
        <LeadReceipt receipt={receipt} />
      ) : (
        <p className="mx-auto max-w-md rounded-card border border-border p-6 text-center text-sm text-faro-text-2">
          Usa <code className="text-faro-accent">?demo=1</code> para ver un recibo de ejemplo, o <code className="text-faro-accent">?lead=&lt;uuid&gt;</code>.
        </p>
      )}
    </main>
  );
}
