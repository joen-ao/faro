import { cn } from "@/lib/utils";

export const ATTRIBUTIONS = [
  { id: "osm", label: "© colaboradores de OpenStreetMap", license: "ODbL", href: "https://www.openstreetmap.org/copyright" },
  { id: "datos-gov", label: "Datos abiertos de datos.gov.co", license: "CC BY-SA 4.0", href: "https://creativecommons.org/licenses/by-sa/4.0/deed.es" },
] as const;

/** Reusable data-source attribution (OSM ODbL + datos.gov.co CC BY-SA 4.0). SPEC §8. */
export function Attribution({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <p data-testid="attribution" className={cn("text-xs leading-relaxed text-faro-text-3", className)}>
      {compact ? "Fuentes: " : "Datos de fuentes públicas: "}
      {ATTRIBUTIONS.map((a, i) => (
        <span key={a.id}>
          {i > 0 && " · "}
          <a href={a.href} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-2 hover:text-white focus-visible:text-white">
            {a.label} ({a.license})
          </a>
        </span>
      ))}
    </p>
  );
}
