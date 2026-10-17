# F05 — Adapter Google Places API

## Objetivo
Fuente P1 del "Encontrar" (SPEC §4/§8/§14): dado un ICP (tipo de negocio + ciudad/bbox) devolver empresas normalizadas a `SourceCompany` usando **solo la Places API (New) oficial** (Text Search). Nunca scraping de Google Maps.

## Alcance
- `real.ts`: `POST https://places.googleapis.com/v1/places:searchText`, headers `X-Goog-Api-Key` y `X-Goog-FieldMask` mínimo (`places.id, displayName, formattedAddress, location, websiteUri, nationalPhoneNumber, internationalPhoneNumber, types, businessStatus` + `nextPageToken`). Cuerpo: `textQuery` (tipo + ciudad), `locationRestriction.rectangle` si hay bbox, `pageSize`, `pageToken`. Paginación limitada por `maxPages` (default 2). 403/429/otros errores → `PlacesError` con status, sin reintentos (cada llamada cuesta).
- Normalización: `externalId=places:<id>`, `sourceUrl=https://www.google.com/maps/place/?q=place_id:<id>`, licencia "Google Places API — términos de Google Maps Platform", teléfono internacional, `raw` con allow-list (id, types, businessStatus). No se guardan reseñas ni nombres de personas. Lugares `CLOSED_PERMANENTLY` se descartan.
- Conteo de llamadas: `onApiCall` inyectable (un registro por llamada → `api_calls`, `costUsd` 0). `recordPlacesCost(db, ...)`: lee `cost_rates.places_per_call` y escribe un `cost_entry` categoría `data`, `rate`=valor de lista, `usd`=0, evidencia "cubierto por tier gratuito".
- `mock.ts`: fixture sintética marcada `isMock` (y `is_demo` al persistir). `index.ts`: `getGooglePlaces(env)` con `resolveMode("google_places")`: sin `GOOGLE_PLACES_API_KEY` → mock.

## No-alcance
Dedupe (F07), persistencia de empresas, Place Details, fotos, reseñas, UI.

## Criterios verificables
1. Request: método POST, URL, headers de llave y field mask exactos, cuerpo con `textQuery` y rectángulo.
2. Paginación: usa `nextPageToken` y se detiene en `maxPages`.
3. Normalización correcta; cerrados descartados; sin llave → mock `isMock`.
4. 403 y 429 lanzan `PlacesError` y se registran en `onApiCall` con error.
5. `recordPlacesCost`: quantity=llamadas, rate=0.032, usd=0, categoría `data`.
6. Cobertura de `src/integrations/google-places` ≥ 70 %; `npm run check` verde sin red ni llave.
