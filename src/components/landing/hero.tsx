import Link from "next/link";
import { ArrowIcon, PrimaryLink } from "./ui";

const NAV = [
  ["#como-funciona", "Cómo funciona"],
  ["#resultados", "Resultados en vivo"],
  ["#diagnostico", "Diagnóstico"],
  ["#cumplimiento", "Cumplimiento"],
] as const;

export function Nav() {
  return (
    <div className="relative mx-auto flex max-w-[1240px] items-center gap-4 px-4 py-5 sm:px-6 lg:gap-8">
      <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-semibold tracking-tight text-white">
        <span aria-hidden className="size-3 rounded-full bg-faro-accent shadow-[0_0_0_6px_rgba(203,232,80,0.15)]" />
        Faro
      </Link>
      <nav aria-label="Principal" className="hidden flex-1 items-center gap-7 text-[15px] lg:flex">
        {NAV.map(([href, label]) => (
          <a key={href} href={href} className="rounded text-white/70 transition-colors hover:text-white">
            {label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
        <Link
          href="/app/login"
          className="inline-flex h-10 items-center rounded-button border border-faro-border px-3.5 text-sm text-white transition-colors hover:border-white/40 sm:h-11 sm:px-[18px] sm:text-[15px]"
        >
          Entrar
        </Link>
        <PrimaryLink className="h-10 px-3.5 text-sm sm:h-11 sm:px-5 sm:text-[15px]">Encontrar mis clientes</PrimaryLink>
      </div>
    </div>
  );
}

/** Hero: pill, H1, CTAs and the product frame, which holds the real demo video (poster until play). */
export function Hero() {
  return (
    <header className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-260px] -z-10 h-[900px] w-[1400px] -translate-x-1/2"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(124,58,237,0.38) 0%, rgba(0,0,0,0) 70%)" }}
      />
      <Nav />
      <div className="mx-auto flex max-w-[1240px] flex-col items-center gap-7 px-4 pb-10 pt-12 text-center sm:px-6 sm:pt-[72px]">
        <p className="faro-rise inline-flex items-center gap-2.5 rounded-full border border-faro-border bg-[rgba(15,15,15,0.8)] px-4 py-2 text-[13px] text-white/75 sm:text-sm">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-faro-accent" />
          30X Hackathon · Reto Dapta · Integrado con Dapta
        </p>
        <h1
          className="faro-rise max-w-[980px] font-display text-[40px] font-bold leading-[1.04] tracking-[-0.035em] [--d:80ms] sm:text-6xl lg:text-[76px]"
        >
          ¿Dónde están tus próximos clientes <span className="text-faro-accent">y cuánto te cuestan?</span>
        </h1>
        <p className="faro-rise max-w-[680px] text-lg leading-relaxed text-white/65 [--d:160ms] sm:text-xl">
          Faro encuentra empresas en fuentes públicas, les escribe con un diagnóstico útil y mide el costo real de cada lead por canal. El agente de Dapta las califica.
        </p>
        <div className="faro-rise flex w-full flex-col items-stretch justify-center gap-3 [--d:240ms] sm:w-auto sm:flex-row sm:items-center">
          <PrimaryLink className="h-14 px-7 text-[17px]">
            Encontrar mis clientes
            <ArrowIcon />
          </PrimaryLink>
          <a
            href="#demo"
            className="inline-flex h-14 items-center justify-center gap-2.5 rounded-button border border-faro-border px-6 text-[17px] text-white transition-colors hover:border-white/40"
          >
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M10 8l6 4-6 4z" />
            </svg>
            Ver demo de 30 s
          </a>
        </div>

        <figure id="demo" className="faro-rise mt-8 w-full max-w-[1120px] scroll-mt-6 [--d:360ms]">
          <div className="rounded-[20px] border border-faro-border bg-faro-surface-1 p-1.5 shadow-[0_40px_120px_rgba(0,0,0,0.6)] sm:p-2.5">
            <div className="faro-grid-bg overflow-hidden rounded-[14px] bg-[radial-gradient(120%_90%_at_30%_40%,#141418_0%,#0a0a0b_60%,#050505_100%)]">
              <video
                className="block aspect-video w-full bg-transparent"
                controls
                muted
                playsInline
                preload="none"
                poster="/demo/poster.jpg"
                width={1280}
                height={720}
                aria-label="Demostración de Faro en 30 segundos"
                aria-describedby="demo-caption"
              >
                <source src="/demo/faro-demo.mp4" type="video/mp4" />
                Tu navegador no reproduce video. Descarga la demostración en /demo/faro-demo.mp4.
              </video>
            </div>
          </div>
          <figcaption id="demo-caption" className="mt-4 text-sm text-faro-text-3">
            Demostración con datos de ejemplo: las cifras del video son ilustrativas. Los números reales del evento están más abajo.
          </figcaption>
        </figure>
      </div>
    </header>
  );
}
