import type { LandingStats } from "@/features/metrics/landing";
import { cn } from "@/lib/utils";
import { CountUp } from "./motion";
import { EMPTY, Eyebrow, ScreenSection } from "./ui";

const STEPS = [
  { n: "01", t: "Encontrar", d: "OpenStreetMap, RUES y REPS en una sola base, sin duplicados y sin personas naturales." },
  { n: "02", t: "Contactar", d: "Un mensaje por empresa con un diagnóstico gratuito de su presencia digital." },
  { n: "03", t: "Calificar con Dapta", d: "El agente conversa por chat o WhatsApp y devuelve si el lead está calificado." },
  { n: "04", t: "Medir", d: "CPL y costo por lead calificado por fuente y canal, con recibo de cada peso." },
];

const FUNNEL = [
  { key: "leadsFound", label: "Empresas encontradas", w: "w-full", box: "bg-faro-surface-1 border-white/10 px-6 py-6 sm:px-8 sm:py-7", size: "text-4xl sm:text-[44px]" },
  { key: "leadsFit", label: "Del perfil", w: "w-[88%] sm:w-[84%]", box: "bg-[#141416] border-white/[0.12] px-5 py-5 sm:px-7 sm:py-6", size: "text-3xl sm:text-[40px]" },
  { key: "contacted", label: "Contactados", w: "w-[76%] sm:w-[68%]", box: "bg-faro-surface-2 border-faro-accent/35 px-5 py-5 sm:px-6 sm:py-[22px]", size: "text-3xl sm:text-4xl" },
  { key: "qualified", label: "Calificados", w: "w-[64%] sm:w-[52%]", box: "bg-faro-accent text-[#1a1a1c] border-transparent px-5 py-5 sm:px-6", size: "text-2xl sm:text-[32px]" },
] as const;

export function HowItWorks({ stats }: { stats: LandingStats }) {
  return (
    <ScreenSection id="como-funciona" labelledBy="how-title">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-16 px-4 py-24 sm:px-6 lg:flex-row lg:items-center">
        <div className="faro-reveal min-w-0 flex-1">
          <Eyebrow>Cómo funciona</Eyebrow>
          <h2 id="how-title" className="mt-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-[60px]">
            De una frase a clientes calificados.
          </h2>
          <p className="mt-5 max-w-[460px] text-lg leading-relaxed text-white/60">Cuatro pasos, cada uno con su costo registrado.</p>
          <ol className="mt-12 flex flex-col">
            {STEPS.map((s, i) => {
              const last = i === STEPS.length - 1;
              return (
                <li key={s.n} className={cn("m-up relative flex gap-5 sm:gap-7", !last && "pb-8")} style={{ ["--d" as string]: `${250 + i * 180}ms` }}>
                  {!last && (
                    <span
                      aria-hidden
                      className={cn("m-line absolute left-[27px] top-[60px] bottom-0 w-px", i === 0 ? "bg-gradient-to-b from-faro-accent/60 to-white/[0.08]" : "bg-white/[0.08]")}
                    />
                  )}
                  <span
                    aria-hidden
                    className={cn(
                      "m-dot grid size-14 flex-none place-items-center rounded-full border font-display text-lg font-semibold",
                      i === 0 ? "border-faro-accent text-faro-accent" : "border-white/20 text-white/80",
                    )}
                  >
                    {s.n}
                  </span>
                  <div className="pt-1.5">
                    <h3 className="font-display text-2xl font-semibold">{s.t}</h3>
                    <p className="mt-2 max-w-[420px] leading-relaxed text-white/60">{s.d}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <figure aria-labelledby="funnel-caption" className="faro-reveal relative min-w-0 flex-1">
          <div aria-hidden className="m-glow absolute -inset-[60px] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(203,232,80,0.12)_0%,rgba(0,0,0,0)_70%)]" />
          <div className="relative flex flex-col items-center gap-3.5">
            {FUNNEL.map((f, i) => (
              <div key={f.key} className={cn("m-funnel flex items-baseline justify-between gap-4 rounded-[20px] border", f.w, f.box)} style={{ ["--d" as string]: `${400 + i * 160}ms` }}>
                <span className={f.key === "qualified" ? "font-bold" : "text-white/65"}>{f.label}</span>
                <span className={cn("font-display font-bold tracking-[-0.03em]", stats.state === "ready" ? f.size : "whitespace-nowrap text-sm font-semibold tracking-normal opacity-75 sm:text-base")}>
                  {stats.state === "ready" ? <CountUp to={stats[f.key]} /> : EMPTY}
                </span>
              </div>
            ))}
            <figcaption id="funnel-caption" className="mt-2 text-center text-[13px] text-faro-text-3">
              Embudo real del evento, todas las búsquedas. Sin datos de ejemplo.
            </figcaption>
          </div>
        </figure>
      </div>
    </ScreenSection>
  );
}
