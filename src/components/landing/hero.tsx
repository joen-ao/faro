import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Deterministic pseudo-random field so server and client markup always match. */
function field(count: number) {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: count }, (_, i) => {
    const x = 6 + rnd() * 88;
    const y = 6 + rnd() * 88;
    const kind = i % 9 === 0 ? "fit" : i % 23 === 0 ? "qualified" : "found";
    return { x, y, kind, delay: (rnd() * 6).toFixed(2) };
  });
}
const DOTS = field(64);

/** Decorative radar: dots found by a rotating beam. Purely CSS, no client JS. */
function Beacon() {
  return (
    <div aria-hidden className="relative mx-auto aspect-square w-full max-w-[520px]">
      <div className="absolute inset-0 rounded-full border border-faro-border" />
      <div className="absolute inset-[16%] rounded-full border border-faro-border" />
      <div className="absolute inset-[33%] rounded-full border border-faro-border" />
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
      <div className="faro-beam absolute inset-0 rounded-full" />
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        {DOTS.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.kind === "found" ? 0.9 : 1.5}
            className={cn(d.kind === "found" ? "fill-white/35" : "faro-pulse fill-[#cbe850]")}
            style={d.kind === "found" ? undefined : { animationDelay: `${d.delay}s` }}
          />
        ))}
      </svg>
      <div className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#cbe850] shadow-[0_0_32px_8px_rgba(203,232,80,0.45)]" />
    </div>
  );
}

export function Hero() {
  return (
    <header className="relative isolate overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px]" style={{ background: "var(--faro-glow-violet)" }} />
      <div aria-hidden className="pointer-events-none absolute -right-40 top-24 -z-10 size-[560px] rounded-full bg-[#7c3aed]/20 blur-[120px]" />
      <nav aria-label="Principal" className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl font-bold tracking-tight">
          Faro<span className="text-faro-accent">.</span>
        </span>
        <div className="flex items-center gap-5 text-sm text-faro-text-2">
          <a href="#como-funciona" className="hidden hover:text-white sm:inline">Cómo funciona</a>
          <a href="#pauta" className="hidden hover:text-white sm:inline">Pauta vs. gratis</a>
          <a href="#cumplimiento" className="hidden hover:text-white sm:inline">Cumplimiento</a>
          <Link href="/app/new" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Buscar mis clientes</Link>
        </div>
      </nav>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1.15fr_0.85fr] lg:pb-28 lg:pt-16">
        <div className="flex flex-col items-start gap-7">
          <p className="rounded-full border border-faro-border px-3 py-1 text-xs tracking-wide text-faro-text-2">
            Reto Dapta · 30X Hackathon
          </p>
          <h1 className="font-display text-[2.5rem] font-bold leading-[1.04] sm:text-6xl lg:text-[4.25rem]">
            ¿Dónde están tus próximos clientes y <span className="text-faro-accent">cuánto te cuestan?</span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-faro-text-2">
            Describe a tu cliente ideal. Faro lo busca en fuentes gratuitas, lo contacta y se lo pasa a Dapta para calificarlo. Tú ves cuánto te costó cada lead según dónde lo encontró, frente a la pauta.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/app/new" className={cn(buttonVariants({ size: "lg" }), "group h-14 px-8 text-base font-semibold")}>
              Encontrar mis clientes
              <ArrowRight className="size-5 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden />
            </Link>
            <a href="#demo" className="text-sm text-faro-text-2 underline decoration-white/30 underline-offset-4 hover:text-white">
              Ver la demostración (30 s)
            </a>
          </div>
        </div>
        <Beacon />
      </div>
      <div aria-hidden className="h-px w-full" style={{ background: "var(--faro-gradient-brand)" }} />
    </header>
  );
}
