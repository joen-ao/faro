import { Check } from "lucide-react";

const RULES = [
  ["Solo empresas", "Personas jurídicas. Nunca personas naturales ni nombres de personas."],
  ["Correos genéricos", "info@, contacto@, ventas@. Descartamos los que parecen nombre propio."],
  ["Baja de un clic", "Todo mensaje trae su enlace. Quien se da de baja no vuelve a ser contactado."],
  ["Ventanas horarias", "L–V 7:00–19:00, sábado 8:00–15:00. Nunca domingos ni festivos (Ley 2300)."],
  ["robots.txt", "Lo respetamos en cada sitio, con un User-Agent que dice quiénes somos."],
  ["Atribución", "OpenStreetMap (ODbL) y datos.gov.co (CC BY-SA 4.0), visibles en mapa y tablero."],
];

export function Compliance() {
  return (
    <section id="cumplimiento" aria-labelledby="comp-title" className="scroll-mt-8 border-t border-faro-border bg-faro-surface-1">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="comp-title" className="font-display text-3xl font-bold leading-tight sm:text-4xl">
            Prospectar sin cruzar la línea
          </h2>
          <p className="mt-4 max-w-sm text-faro-text-2">
            Cumplimos la Ley 1581 (habeas data) y adoptamos voluntariamente la Ley 2300. Un máximo de un mensaje por empresa, sin seguimientos automáticos.
          </p>
        </div>
        <ul className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {RULES.map(([t, d]) => (
            <li key={t} className="flex gap-3">
              <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-faro-accent text-faro-accent-ink" aria-hidden>
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              <div>
                <h3 className="font-semibold">{t}</h3>
                <p className="text-sm leading-relaxed text-faro-text-2">{d}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
