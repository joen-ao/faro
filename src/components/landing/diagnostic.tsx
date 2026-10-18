import type { SitesSummary } from "./data";
import { CountUp } from "./motion";
import { EMPTY, Eyebrow, ScreenSection } from "./ui";

function Stat({ label, value }: { label: string; value: React.ReactNode | null }) {
  return (
    <div className="flex flex-col-reverse justify-end">
      <dt className="mt-1.5 text-[13px] text-faro-text-3">{label}</dt>
      <dd className={value === null ? "pt-2 text-base font-semibold text-faro-text-3" : "font-display text-3xl font-bold sm:text-4xl"}>{value ?? EMPTY}</dd>
    </div>
  );
}

/** Illustrative phone: shows the shape of the diagnostic, never a real company nor invented figures. */
function Phone({ sites }: { sites: SitesSummary | null }) {
  const bar = (v: number | null | undefined) => `${v === null || v === undefined ? 0 : Math.round(v * 100)}%`;
  return (
    <div className="m-phone w-[min(320px,100%)] rounded-[44px] border border-white/15 bg-faro-surface-2 p-3 shadow-[0_60px_120px_rgba(0,0,0,0.7)]">
      <div className="flex min-h-[520px] flex-col gap-3.5 overflow-hidden rounded-[34px] bg-black px-5 py-7 sm:min-h-[560px]">
        <p className="text-[11px] uppercase tracking-[0.18em] text-faro-accent">Diagnóstico gratuito</p>
        <p className="font-display text-2xl font-bold leading-[1.1] tracking-[-0.02em]">Su empresa</p>
        <div className="m-up flex gap-2" style={{ ["--d" as string]: "500ms" }}>
          <div className="flex-1 rounded-xl bg-[rgba(245,181,68,0.12)] p-2.5">
            <p className="font-display text-sm font-bold text-faro-warn">Oportunidades</p>
            <p className="text-[11px] text-white/70">qué arreglar primero</p>
          </div>
          <div className="flex-1 rounded-xl bg-faro-accent/[0.12] p-2.5">
            <p className="font-display text-sm font-bold text-faro-accent">A favor</p>
            <p className="text-[11px] text-white/70">lo que ya hace bien</p>
          </div>
        </div>
        <div className="m-up rounded-[14px] border border-faro-warn/40 bg-faro-surface-1 p-3.5" style={{ ["--d" as string]: "700ms" }}>
          <p className="text-sm font-bold">Sin botón de WhatsApp</p>
          <p className="mt-1.5 text-xs leading-snug text-white/60">Agregue un botón flotante con un mensaje ya escrito.</p>
        </div>
        <div className="m-up rounded-[14px] bg-faro-surface-1 p-3.5" style={{ ["--d" as string]: "900ms" }}>
          <p className="text-xs text-faro-text-3">Usted vs. su competencia real</p>
          <div className="mt-2.5 h-1.5 rounded-md bg-faro-surface-2">
            <div className="m-bar h-1.5 rounded-md bg-[#6b6b70]" style={{ width: bar(sites?.booking.pct), ["--d" as string]: "1100ms" }} />
          </div>
          <div className="mt-2 h-1.5 rounded-md bg-faro-surface-2">
            <div className="m-bar h-1.5 rounded-md bg-[#6b6b70]" style={{ width: bar(sites?.whatsapp.pct), ["--d" as string]: "1250ms" }} />
          </div>
        </div>
        <p className="m-cta mt-auto flex h-[46px] items-center justify-center rounded-xl bg-faro-accent text-sm font-bold text-[#1a1a1c]">Hablar por WhatsApp</p>
      </div>
    </div>
  );
}

export function DiagnosticPreview({ sites }: { sites: SitesSummary | null }) {
  const share = (s: SitesSummary["whatsapp"] | undefined) => (s && s.pct !== null ? <CountUp to={Math.round(s.pct * 100)} suffix=" %" /> : null);
  return (
    <ScreenSection id="diagnostico" labelledBy="diag-title">
      <div aria-hidden className="absolute -right-[10%] top-0 h-full w-[70%] bg-[radial-gradient(50%_50%_at_50%_50%,rgba(124,58,237,0.28)_0%,rgba(0,0,0,0)_70%)]" />
      <div className="relative mx-auto flex w-full max-w-[1240px] flex-col gap-16 px-4 py-24 sm:px-6 lg:flex-row lg:items-center lg:gap-[72px]">
        <div className="faro-reveal min-w-0 flex-1">
          <Eyebrow>Lo que recibe cada empresa</Eyebrow>
          <h2 id="diag-title" className="mt-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-[64px]">
            Un diagnóstico que le sirve. No un correo más.
          </h2>
          <p className="mt-6 max-w-[480px] text-lg leading-relaxed text-white/60">
            Revisamos su sitio como lo haría un cliente nuevo, lo comparamos con su competencia real y le decimos qué arreglar primero.
          </p>
          <dl className="mt-10 grid max-w-[480px] grid-cols-3 gap-6">
            <Stat label="Sitios comparados" value={sites && sites.reviewed > 0 ? <CountUp to={sites.reviewed} /> : null} />
            <Stat label="Con WhatsApp" value={share(sites?.whatsapp)} />
            <Stat label="Agenda en línea" value={share(sites?.booking)} />
          </dl>
          <p className="mt-4 text-[13px] text-faro-text-3">Sitios web reales revisados por Faro. Los porcentajes aparecen desde 5 sitios.</p>
        </div>

        <figure className="faro-reveal relative flex min-w-0 flex-1 justify-center py-14 lg:justify-end lg:py-10 lg:pr-6">
          <Phone sites={sites} />
          <div className="m-pop absolute left-0 top-0 lg:top-[18%] flex items-center gap-2.5 rounded-[14px] border border-faro-border bg-[rgba(15,15,15,0.96)] px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
            <span aria-hidden className="m-ping size-2 rounded-full bg-faro-accent" />
            <span className="text-sm">Abrió su diagnóstico</span>
          </div>
          <div className="m-pop m-pop-late absolute bottom-0 right-0 lg:bottom-[18%] rounded-[14px] border border-faro-accent/40 bg-[rgba(15,15,15,0.96)] px-4 py-3 shadow-[0_20px_40px_rgba(0,0,0,0.5)]">
            <p className="text-xs text-faro-text-3">Agente de Dapta</p>
            <p className="mt-0.5 text-sm font-bold text-faro-accent">Lead calificado</p>
          </div>
          <figcaption className="sr-only">Ejemplo ilustrativo del diagnóstico que recibe una empresa, con eventos que registra Faro.</figcaption>
        </figure>
      </div>
    </ScreenSection>
  );
}
