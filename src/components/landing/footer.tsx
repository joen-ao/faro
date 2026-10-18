import { Attribution } from "@/components/attribution";
import { ArrowIcon, PrimaryLink } from "./ui";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="mx-auto max-w-[1240px] px-4 pb-28 pt-[72px] sm:px-6 max-sm:pb-20 max-sm:pt-12">
      <div className="faro-reveal relative flex flex-col items-center gap-6 overflow-hidden rounded-3xl border border-faro-accent/35 bg-[linear-gradient(90deg,rgba(203,232,80,0.16)_0%,rgba(0,0,0,0)_100%),#0f0f0f] px-6 py-16 text-center sm:px-8 sm:py-[72px]">
        <h2 id="cta-title" className="max-w-[760px] font-display text-[32px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[52px]">
          Escribe a quién le quieres vender. Faro hace el resto.
        </h2>
        <PrimaryLink className="h-14 px-7 text-[17px]">
          Encontrar mis clientes
          <ArrowIcon />
        </PrimaryLink>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/[0.08]">
      <div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-4 px-4 py-10 text-sm text-faro-text-3 sm:px-6 md:flex-row md:items-start">
        <p>
          <span className="font-display font-semibold text-white">Faro</span> · Proyecto del 30X Hackathon · Integrado con Dapta
        </p>
        <Attribution className="text-sm md:text-right" />
      </div>
    </footer>
  );
}
