# F03 — Adapter Overpass/OSM

## Objetivo
Fuente gratuita #1 del "Encontrar" (SPEC §4/§14): dado un ICP (`criteria.tags[]` + bbox o ciudad) devolver empresas OSM normalizadas a un tipo común `SourceCompany`, con licencia y URL de fuente visibles, y registrar cada llamada real en `api_calls` (costo 0).

## Alcance
- `types.ts`: `SourceCompany`, `OverpassCriteria`, `OverpassAdapter`, `ApiCallLogger`.
- `real.ts`: query por tags (`k=v`, `k` o `k=*`) → `node`+`way` con `out center tags`; bbox explícito o ciudad conocida (tabla de bbox; ciudad desconocida → `area["name"=...]`); caché a disco con TTL (`.cache/overpass`); cola con 1 request concurrente e intervalo mínimo; reintentos con backoff, mirror, timeout, User-Agent `Faro-30XHackathon/0.1`; log por intento vía `onApiCall` inyectable.
- Normalización: nombre, dirección, lat/lng, ciudad, web, teléfono E.164 (país por defecto CO, sin inventar dígitos), email, `external_id=osm:node/123`, `url_fuente=https://www.openstreetmap.org/node/123`, licencia "ODbL 1.0 © OpenStreetMap contributors", `raw`.
- `mock.ts`: fixture real enmascarada, `isMock=true`. `index.ts`: selección con `resolveMode("overpass")`.
- `persistOverpassResults(db, huntId, companies)`: inserta `companies` + `company_sources` (canal `osm`, sin dedupe, idempotente por `(canal, external_id)`; mock → `is_mock` e `is_demo`).

## No-alcance
Dedupe (F07), `contact_points`, fit con IA, geocodificación, UI.

## Criterios verificables
1. La query contiene `node`/`way` por filtro, bbox/área y `out center tags`.
2. Teléfonos `+57 601 234 5678`, `(1) 2345678`, `3101234567`, `+1 305 555 0100` → E.164; basura → `undefined`.
3. `external_id`/`url_fuente`/licencia correctos para node y way.
4. Una segunda búsqueda idéntica sale de caché (sin fetch); TTL vencido refetch.
5. Fallo del primario → reintentos con backoff y luego mirror; fallo total → error y `api_calls` con `error`.
6. Con `OVERPASS_MODE=mock` el adapter es mock y marcado `isMock`; el mock no registra llamadas reales.
7. Dos requests simultáneas nunca se solapan (concurrencia 1).
8. Cobertura de `src/integrations/overpass` ≥ 70 % líneas; `npm run check` verde sin red.

## Plan de tests
`tests/unit/overpass.test.ts` (query, parseo, mirror, modo), `overpass-adapter.test.ts` (teléfono, normalización, caché/TTL, reintentos, cola, api_calls, persistencia en PGlite memoria). Test vivo `tests/live/overpass.live.test.ts` con `RUN_LIVE=1` (skip por defecto).

## Verificación en vivo
(pendiente)
