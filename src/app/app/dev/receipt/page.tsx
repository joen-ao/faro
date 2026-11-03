import type { Metadata } from "next";
import { headers } from "next/headers";
import { z } from "zod";
import { LeadReceipt } from "@/components/lead-receipt";
import { getReadyDb } from "@/db/client";
import { getLeadReceipt } from "@/features/metrics";
import { requireAppAccess } from "@/lib/app-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recibo de lead (interno)", robots: { index: false } };

/** Internal page: `?lead=<uuid>` shows that lead's receipt. */
export default async function ReceiptDevPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const sp = await searchParams;
  const leadId = z.string().uuid().safeParse(sp.lead);
  // A lead receipt exposes company costs: it needs the app access key.
  if (leadId.success) {
    const denied = requireAppAccess(new Request("http://internal/app/dev/receipt", { headers: await headers() }));
    if (denied) {
      return (
        <main className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-2xl font-bold">Acceso restringido</h1>
          <p className="mt-2 text-sm text-faro-text-2">Esta sección requiere la clave de acceso de la app (APP_ACCESS_KEY).</p>
        </main>
      );
    }
  }
  const receipt = leadId.success ? await getLeadReceipt(await getReadyDb(), leadId.data) : null;

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
          Usa <code className="text-faro-accent">?lead=&lt;uuid&gt;</code> para ver el recibo de un lead.
        </p>
      )}
    </main>
  );
}
