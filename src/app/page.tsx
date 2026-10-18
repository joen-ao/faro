import type { Metadata } from "next";
import "@/styles/landing.css";
import { Compliance } from "@/components/landing/compliance";
import { loadLandingData } from "@/components/landing/data";
import { DiagnosticPreview } from "@/components/landing/diagnostic";
import { FiguresBand, SourcesStrip } from "@/components/landing/figures";
import { FinalCta, Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { PaidVsFree } from "@/components/landing/paid-vs-free";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Faro — ¿Dónde están tus próximos clientes y cuánto te cuestan?",
  description: "Faro encuentra empresas en fuentes públicas, les escribe con un diagnóstico útil y mide el costo real de cada lead por canal. El agente de Dapta las califica.",
};

export default async function Home() {
  const data = await loadLandingData();
  return (
    <div className="overflow-x-clip">
      <Hero />
      <main>
        <SourcesStrip />
        <FiguresBand data={data} />
        <HowItWorks stats={data.stats} />
        <PaidVsFree stats={data.stats} bySource={data.bySource} />
        <DiagnosticPreview sites={data.sites} />
        <Compliance naturalPersonsContacted={data.naturalPersonsContacted} excludedPersons={data.excludedPersons} />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
