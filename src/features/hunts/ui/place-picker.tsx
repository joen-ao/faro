"use client";

import { Check, MapPin, Search, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { CITIES, COUNTRIES, cityLabel, countryCities, countryInfo, findCity, huntCities, normalizeCities, withCities, type CityInfo } from "@/features/icp/presets";
import { MAX_CITIES, type HuntCity, type IcpCriteria } from "@/features/icp/schema";
import { cn } from "@/lib/utils";

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Mode = "cities" | "country";

/** Short chip text: "Bogotá", "Bogotá, Medellín +1" or "Colombia (5 ciudades)". */
function chipText(c: IcpCriteria): string {
  const names = huntCities(c).map((x) => cityLabel(x.name));
  if (c.scope === "country") return `${countryInfo(c.country)?.name ?? c.country} (${names.length} ${names.length === 1 ? "ciudad" : "ciudades"})`;
  return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
}

/**
 * Where to search: several preset cities (max 5, searchable, removable chips) or a whole country, which expands to
 * its main preset cities. Free text adds a city outside the presets (no bbox: OSM then searches it by name).
 */
export function PlacePicker({ criteria, onChange }: { criteria: IcpCriteria; onChange: (c: IcpCriteria) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>(criteria.scope === "country" ? "country" : "cities");
  const [q, setQ] = useState("");
  const panelId = useId();
  const selected = huntCities(criteria);
  const full = selected.length >= MAX_CITIES;
  // Sources depend on the country (RUES/REPS only cover Colombia): one country per search.
  const country = criteria.country.toUpperCase();

  const options = useMemo(() => {
    const t = norm(q);
    const taken = new Set(selected.map((s) => findCity(s.name)?.city ?? s.name));
    return CITIES.filter((c) => !taken.has(c.city) && (selected.length === 0 || c.country === country) && (!t || norm(c.label).includes(t) || c.keywords.some((k) => k.includes(t))));
  }, [q, selected, country]);

  const setCities = (list: HuntCity[]) => {
    const first = findCity(list[0]?.name ?? "");
    onChange(normalizeCities({ ...criteria, ...(first ? { country: first.country, language: first.language } : {}), city: list[0]?.name ?? criteria.city, cities: list, scope: "cities" }));
  };
  const add = (c: CityInfo) => {
    if (full) return;
    setCities([...selected, { name: c.city, bbox: c.bbox }]);
    setQ("");
  };
  const addFree = () => {
    const t = q.trim();
    if (!t || full) return;
    const preset = options.find((o) => norm(o.label) === norm(t) || o.keywords.includes(norm(t)));
    if (preset) return add(preset);
    if (selected.some((s) => norm(s.name) === norm(t))) return setQ("");
    setCities([...selected, { name: t }]);
    setQ("");
  };
  const remove = (name: string) => {
    if (selected.length <= 1) return;
    setCities(selected.filter((s) => s.name !== name));
  };
  const pickCountry = (code: string) => onChange(withCities(criteria, countryCities(code), "country"));

  return (
    <div className="contents">
      <button
        type="button"
        data-testid="place-picker"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`faro-step-in group inline-flex h-9 max-w-full items-center gap-2 rounded-[10px] border border-faro-accent/40 bg-faro-surface-2 px-3 text-[14px] text-white transition-colors hover:border-faro-accent ${focusRing}`}
      >
        <MapPin className="size-3.5 shrink-0 text-faro-text-3 transition-colors group-hover:text-faro-accent" aria-hidden />
        <span className="truncate">
          {criteria.scope === "country" ? "País" : selected.length > 1 ? "Ciudades" : "Ciudad"}: <strong className="font-bold">{chipText(criteria)}</strong>
          <span className="ml-1 text-faro-text-3">({criteria.country})</span>
        </span>
      </button>

      {open && (
        <div id={panelId} data-testid="place-panel" className="faro-step-in basis-full rounded-[14px] border border-white/12 bg-faro-surface-2/60 p-3.5 sm:p-4">
          <div role="tablist" aria-label="Dónde buscar" className="inline-flex rounded-[10px] bg-black/40 p-1">
            {(["cities", "country"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                data-testid={`place-mode-${m}`}
                onClick={() => setMode(m)}
                className={cn("h-8 rounded-[8px] px-3.5 text-[13.5px] font-medium transition-colors", focusRing, mode === m ? "bg-faro-surface-3 text-white" : "text-faro-text-3 hover:text-white")}
              >
                {m === "cities" ? "Ciudades" : "País"}
              </button>
            ))}
          </div>

          {mode === "cities" ? (
            <div className="mt-3.5 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2" aria-label="Ciudades elegidas">
                {selected.map((s) => (
                  <span key={s.name} data-testid={`city-chip-${norm(s.name)}`} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-faro-surface-3/70 pr-1.5 pl-3 text-[14px] text-white">
                    {cityLabel(s.name)}
                    {selected.length > 1 && (
                      <button type="button" onClick={() => remove(s.name)} aria-label={`Quitar ${cityLabel(s.name)}`} className={`grid size-6 place-items-center rounded-[6px] text-faro-text-3 transition-colors hover:bg-white/15 hover:text-white ${focusRing}`}>
                        <X className="size-3" aria-hidden />
                      </button>
                    )}
                  </span>
                ))}
                <span className="text-[12px] text-faro-text-3">
                  {selected.length} de {MAX_CITIES}
                </span>
              </div>
              <label className={cn("flex h-10 items-center gap-2 rounded-[10px] border border-white/15 bg-black/30 px-3 focus-within:border-faro-accent", full && "opacity-50")}>
                <Search className="size-4 text-faro-text-3" aria-hidden />
                <span className="sr-only">Buscar ciudad</span>
                <input
                  data-testid="city-search"
                  value={q}
                  disabled={full}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (options.length === 1) add(options[0]);
                      else addFree();
                    }
                  }}
                  placeholder={full ? `Máximo ${MAX_CITIES} ciudades` : "Buscar o escribir una ciudad"}
                  style={{ outline: "none" }}
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-white placeholder:text-faro-text-3 focus-visible:outline-none"
                />
              </label>
              {!full && options.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Ciudades sugeridas">
                  {options.map((c) => (
                    <li key={c.city}>
                      <button
                        type="button"
                        data-testid={`city-option-${norm(c.city)}`}
                        onClick={() => add(c)}
                        className={`inline-flex h-9 items-center rounded-full border border-white/[0.14] px-3.5 text-[13.5px] text-white/85 transition-colors hover:border-faro-accent hover:text-white ${focusRing}`}
                      >
                        + {c.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[12px] leading-snug text-faro-text-3">Cada fuente recorre las ciudades una por una. Un solo país por búsqueda.</p>
            </div>
          ) : (
            <div className="mt-3.5 flex flex-col gap-2.5" role="radiogroup" aria-label="País">
              {COUNTRIES.map((k) => {
                const on = criteria.scope === "country" && criteria.country === k.code;
                const list = countryCities(k.code).map((c) => c.label);
                return (
                  <button
                    key={k.code}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    data-testid={`country-option-${k.code}`}
                    onClick={() => pickCountry(k.code)}
                    className={cn("flex items-start gap-3 rounded-[12px] border p-3 text-left transition-colors", focusRing, on ? "border-faro-accent bg-faro-accent/[0.06]" : "border-white/12 hover:border-white/30")}
                  >
                    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", on ? "border-faro-accent bg-faro-accent text-faro-accent-ink" : "border-white/30")}>
                      {on && <Check className="size-3" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-semibold text-white">{k.name}</span>
                      <span className="block text-[12.5px] leading-snug text-faro-text-3">
                        {list.length > 1 ? `Sus ${list.length} ciudades principales: ${list.slice(0, -1).join(", ")} y ${list[list.length - 1]}` : `Por ahora: ${list[0]}`}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-3.5 flex justify-end">
            <button
              type="button"
              data-testid="place-done"
              onClick={() => setOpen(false)}
              className={`inline-flex h-9 items-center rounded-[10px] bg-white/10 px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-white/15 ${focusRing}`}
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
