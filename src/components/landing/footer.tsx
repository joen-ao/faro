import Link from "next/link";
import { Attribution } from "@/components/attribution";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-faro-border">
      <div aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: "var(--faro-gradient-brand)" }} />
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 py-20">
        <div className="flex w-full flex-col justify-between gap-6 md:flex-row md:items-center">
          <p className="max-w-xl font-display text-2xl font-semibold leading-snug sm:text-3xl">
            Deja de adivinar dónde buscar. Mide cuánto cuesta cada cliente.
          </p>
          <Link href="/app/new" className={cn(buttonVariants({ size: "lg" }), "h-14 px-8 text-base font-semibold")}>
            Encontrar mis clientes
          </Link>
        </div>
        <div className="flex w-full flex-col gap-3 border-t border-faro-border pt-8 text-sm text-faro-text-3">
          <Attribution />
          <p>
            <span className="font-display font-semibold text-white">Faro</span> · Integrado con Dapta · Proyecto del 30X Hackathon
          </p>
        </div>
      </div>
    </footer>
  );
}
