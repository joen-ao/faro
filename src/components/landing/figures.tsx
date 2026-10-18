import { formatCount } from "@/features/metrics/landing";
import type { LandingData } from "./data";
import { EMPTY, Usd } from "./ui";

const SOURCES = ["OpenStreetMap", "RUES · datos.gov.co", "REPS · Ministerio de Salud", "Sitios web de las empresas"];

export function SourcesStrip() {
  return (
    <section aria-label="Fuentes" className="mx-auto max-w-[1240px] px-4 pb-16 pt-6 sm:px-6">
      <ul className="flex flex-wrap items-center justify-center gap-x-9 gap-y-3 text-[15px]">
        <li className="w-full text-center text-faro-text-3 sm:w-auto">Fuentes públicas y gratuitas:</li>
        {SOURCES.map((s) => (
          <li key={s} className="font-medium text-white/85">
            {s}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Figure({ value, label, accent }: { value: React.ReactNode; label: string; accent?: boolean }) {
  return (
    <div className="faro-reveal flex flex-col-reverse justify-end">
      <dt className="mt-1.5 text-white/60 max-sm:text-[13px] max-sm:leading-snug">{label}</dt>
      <dd className={`font-display text-4xl font-bold tracking-[-0.03em] sm:text-5xl max-sm:text-[32px] ${accent ? "text-faro-accent" : "text-white"}`}>{value}</dd>
    </div>
  );
}

const Empty = () => <span className="text-2xl font-semibold tracking-normal text-faro-text-3 sm:text-3xl">{EMPTY}</span>;

/** Live band: real totals of the event, or an honest "sin datos aún" per figure. */
export function FiguresBand({ data }: { data: LandingData }) {
  const s = data.stats;
  const ready = s.state === "ready";
  const notes = [
    data.mergedDuplicates !== null && data.mergedDuplicates > 0 ? `${formatCount(data.mergedDuplicates)} duplicados fusionados` : null,
    data.excludedPersons !== null && data.excludedPersons > 0 ? `${formatCount(data.excludedPersons)} personas naturales excluidas al buscar` : null,
  ].filter(Boolean);
  return (
    <section id="resultados" aria-label="Resultados en vivo" className="scroll-mt-6 border-y border-white/[0.08] bg-faro-surface-1">
      <div className="mx-auto max-w-[1240px] px-4 py-14 sm:px-6 max-sm:py-10">
        <dl className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4 max-sm:grid-cols-2 max-sm:gap-x-5 max-sm:gap-y-7">
          <Figure value={ready ? formatCount(s.leadsFound) : <Empty />} label="empresas encontradas en búsquedas reales" />
          <Figure value={ready ? formatCount(s.leadsFit) : <Empty />} label="encajan con el perfil y tienen contacto de empresa" accent />
          <Figure
            value={<Usd value={data.cpl} emptyClassName="text-2xl font-semibold tracking-normal sm:text-3xl" />}
            label="costo por lead del perfil, con recibo"
          />
          <Figure value={data.naturalPersonsContacted === null ? <Empty /> : formatCount(data.naturalPersonsContacted)} label="personas naturales contactadas" />
        </dl>
        <p className="mt-8 text-sm text-faro-text-3 max-sm:mt-6 max-sm:text-[13px]">
          {notes.length ? `${notes.join(" · ")}. ` : ""}Totales del evento, solo datos reales; se actualizan solos.
        </p>
      </div>
    </section>
  );
}
