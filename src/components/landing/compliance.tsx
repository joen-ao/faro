import { Check } from "lucide-react";
import { sendWindowPolicy } from "@/features/compliance/windows";

const WINDOW_LEY_2300 = ["Ventanas horarias", "L–V 7:00–19:00, sábado 8:00–15:00. Nunca domingos ni festivos (Ley 2300)."];
const WINDOW_EXTENDED = ["Horario de envío", "Todos los días entre 8:00 y 20:00 (hora Colombia), nunca de noche. Un solo mensaje por empresa."];

const BASE_RULES = [
  ["Solo empresas", "Excluimos personas naturales y no guardamos nombres de personas. Las empresas de OSM y Places se marcan «por verificar»."],
  ["Correos genéricos", "info@, contacto@, ventas@. Descartamos los que parecen nombre propio."],
  ["Baja de un clic", "Todo mensaje trae su enlace. Quien se da de baja no vuelve a ser contactado."],
  ["robots.txt", "Lo respetamos en cada sitio, con un User-Agent que dice quiénes somos."],
  ["Atribución", "OpenStreetMap (ODbL) y datos.gov.co (CC BY-SA 4.0), visibles en mapa y tablero."],
];

export function Compliance() {
  const strict = sendWindowPolicy() === "ley2300";
  const RULES = [...BASE_RULES.slice(0, 3), strict ? WINDOW_LEY_2300 : WINDOW_EXTENDED, ...BASE_RULES.slice(3)];
  return (
    <section id="cumplimiento" aria-labelledby="comp-title" className="scroll-mt-8 border-t border-faro-border bg-faro-surface-1">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 id="comp-title" className="font-display text-3xl font-bold leading-tight sm:text-4xl">
            Prospectar sin cruzar la línea
          </h2>
          <p className="mt-4 max-w-sm text-faro-text-2">
            {strict
              ? "Diseñado para cumplir la Ley 1581 (habeas data) y con la Ley 2300 adoptada de forma voluntaria. Un máximo de un mensaje por empresa, sin seguimientos automáticos."
              : "Diseñado para cumplir la Ley 1581 (habeas data). Un máximo de un mensaje por empresa, sin seguimientos automáticos y siempre con baja de un clic."}
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
