# F02 — Prueba de cobertura de fuentes

## Objetivo
`npm run coverage:sources` consulta datos REALES (OSM/Overpass y datos.gov.co/Socrata) para 3 ICP —(a) clínicas odontológicas Bogotá, (b) restaurantes Bogotá, (c) restaurantes Miami— y escribe `reports/coverage.md` con números honestos para elegir el ICP principal de demo (SPEC §3). Cubre SPEC §14 F02 y la parte de verificación de F03/F04.

## Alcance
- Clientes mínimos `src/integrations/overpass` y `src/integrations/socrata` (types/real/mock/index), con User-Agent `Faro-30XHackathon/0.1`, timeout, reintentos con backoff, mirror de Overpass, caché a disco `.cache/` y rate limit. F03/F04 los endurecen.
- Overpass: tags OSM + bbox, `nwr`-equivalente con `node` + `way`, `out center tags`. Dental: `amenity=dentist` ∪ `healthcare=dentist`; restaurantes: `amenity=restaurant`.
- Socrata: SoQL (`$select/$where/$limit/$group`). RUES `c82u-588k` (CIIU 8622 odontología, 5611 restaurantes; cámara BOGOTA; estado ACTIVA; excluye PERSONA NATURAL). REPS `c36g-9fc2` (Bogotá, IPS, tipoid NI; dental por nombre odont/dental).
- Métricas puras y testeadas (`src/features/coverage`): normalización de nombre, % web/teléfono/correo, % persona jurídica, solapamiento por nombre normalizado, render del reporte.
- Muestras reales mínimas en `fixtures/` con atribución, sin nombres de personas.

## No-alcance
Persistencia en DB, dedupe real (F07), geocodificación, Google Places.

## Criterios de aceptación
1. El script corre contra las APIs reales y escribe `reports/coverage.md` con: conteo por fuente, %web/%tel/%correo, %jurídica, solapamiento, latencia, fecha/hora, atribuciones y recomendación razonada con números.
2. Si una fuente falla tras reintentos, el reporte lo dice y no inventa cifras.
3. RUES no expone teléfono/correo/web/municipio: el reporte lo declara (N/D), no 0%.
4. `npm run check` verde sin red (tests con fixtures).

## Plan de tests
`tests/unit/coverage-metrics.test.ts`, `overpass.test.ts` (query builder + parseo con fixture), `socrata.test.ts` (URL SoQL, filtro jurídico, parseo).
