import { formatCount } from "@/features/metrics/landing";
import { describeSendWindow, type SendWindowSetting } from "@/features/compliance/windows";
import { cn } from "@/lib/utils";
import { EMPTY, Eyebrow, ScreenSection } from "./ui";

const ICON = { width: 28, height: 28, viewBox: "0 0 24 24", fill: "none", stroke: "#cbe850", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const Icons = {
  building: (
    <svg aria-hidden {...ICON}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  message: (
    <svg aria-hidden {...ICON}>
      <path d="M4 4h16v12H5.2L4 17.2z" />
      <path d="M8 9h8" />
    </svg>
  ),
  clock: (
    <svg aria-hidden {...ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  link: (
    <svg aria-hidden {...ICON}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  ),
};

export function Compliance({
  naturalPersonsContacted,
  excludedPersons,
  sendWindow,
}: {
  naturalPersonsContacted: number | null;
  excludedPersons: number | null;
  sendWindow: SendWindowSetting;
}) {
  const excluded = excludedPersons !== null && excludedPersons > 0 ? ` ${formatCount(excludedPersons)} registros excluidos hasta hoy.` : "";
  const items = [
    { icon: Icons.building, t: "Solo empresas", d: `Personas naturales y correos personales quedan fuera desde la búsqueda.${excluded}` },
    { icon: Icons.message, t: "Un mensaje por empresa", d: "Sin secuencias ni insistencia. Baja en un clic, respetada para siempre." },
    {
      icon: Icons.clock,
      t: "Horario de envío",
      d: describeSendWindow(sendWindow),
    },
    { icon: Icons.link, t: "Fuentes citadas", d: "Cada dato muestra de dónde viene y su licencia: ODbL y CC BY-SA 4.0. Respetamos robots.txt en cada sitio." },
  ];
  const zero = naturalPersonsContacted === 0;
  return (
    <ScreenSection id="cumplimiento" labelledBy="comp-title">
      <div className="mx-auto w-full max-w-[1240px] px-4 py-24 sm:px-6 max-sm:py-16">
        <div className="faro-reveal flex flex-col gap-8 md:flex-row md:items-end md:justify-between md:gap-16">
          <div className="min-w-0 flex-1">
            <Eyebrow>Cumplimiento</Eyebrow>
            <h2 id="comp-title" className="mt-4 font-display text-4xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-[64px]">
              Prospección que respeta la ley.
            </h2>
            <p className="mt-5 max-w-lg leading-relaxed text-white/60">Diseñado para cumplir la Ley 1581 (habeas data). Un máximo de un mensaje por empresa, sin seguimientos automáticos.</p>
          </div>
          <div className="md:text-right max-sm:flex max-sm:items-end max-sm:gap-4">
            <p
              className={cn(
                "m-zero font-display font-bold leading-[0.85] tracking-[-0.06em]",
                naturalPersonsContacted === null ? "py-4 text-3xl tracking-normal text-faro-text-3" : "text-[96px] sm:text-[140px] lg:text-[200px] max-sm:text-[80px]",
                zero ? "text-faro-accent" : naturalPersonsContacted !== null && "text-faro-warn",
              )}
            >
              {naturalPersonsContacted === null ? EMPTY : formatCount(naturalPersonsContacted)}
            </p>
            <p className="mt-3 text-white/60 max-sm:mt-0 max-sm:pb-2">personas naturales contactadas</p>
          </div>
        </div>
        <ul className="mt-16 max-sm:mt-10 grid grid-cols-1 border-t border-white/[0.12] sm:grid-cols-2 lg:mt-[72px] lg:grid-cols-4">
          {items.map((it, i) => (
            <li key={it.t} style={{ ["--d" as string]: `${300 + i * 140}ms` }} className="m-up border-b border-white/[0.12] py-8 sm:pr-8 max-sm:grid max-sm:grid-cols-[28px_1fr] max-sm:items-center max-sm:gap-x-3 max-sm:py-5">
              {it.icon}
              <h3 className="mt-5 max-sm:mt-0 font-display text-xl font-semibold max-sm:text-lg">{it.t}</h3>
              <p className="mt-2.5 leading-relaxed text-white/60 max-sm:col-span-2 max-sm:mt-2 max-sm:text-[15px]">{it.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </ScreenSection>
  );
}
