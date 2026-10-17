import type { Metadata } from "next";
import { getReadyDb } from "@/db/client";
import type { AppDb } from "@/db/types";
import { buildLandingStats, getPublicMetrics, type PublicMetrics } from "@/features/metrics";
import { Compliance } from "@/components/landing/compliance";
import { DemoVideo } from "@/components/landing/demo-video";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PaidVsFree } from "@/components/landing/paid-vs-free";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Faro — ¿Dónde están tus próximos clientes y cuánto te cuestan?",
  description: "Describe a tu cliente ideal. Faro lo busca en fuentes gratuitas, lo contacta, lo califica con Dapta y mide el costo por lead de cada fuente.",
};

/** Real aggregates only; any failure degrades to the honest empty state. */
async function loadMetrics(): Promise<PublicMetrics | null> {
  try {
    const db = (await getReadyDb()) as unknown as AppDb;
    return await getPublicMetrics(db);
  } catch (e) {
    console.error("landing metrics unavailable", e);
    return null;
  }
}

export default async function Home() {
  const stats = buildLandingStats(await loadMetrics());
  return (
    <>
      <Hero />
      <main>
        <DemoVideo />
        <HowItWorks />
        <PaidVsFree stats={stats} />
        <Compliance />
      </main>
      <Footer />
    </>
  );
}
