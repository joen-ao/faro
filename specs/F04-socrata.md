# F04 — Adapter Socrata (RUES + REPS)

## Objetivo
Adapter endurecido de datos.gov.co (Socrata): RUES por CIIU y cámara de comercio, REPS como plugin de salud (dental), solo personas jurídicas, normalizado a un tipo común `SourceCompany`. Cubre SPEC §14 F04 y §8 (solo personas jurídicas, no guardar nombres de personas).

## Alcance
- `src/integrations/types.ts`: `SourceCompany` compartido (nombre, nit, dirección, ciudad, lat/lng, web, teléfono, correo, `externalId` `rues:<nit>` / `reps:<codigo>`, `sourceUrl`, `license` "CC BY-SA 4.0 · datos.gov.co", `isLegalEntity`, `possibleNaturalPerson`, `raw` sin datos personales, `isMock`).
- SoQL seguro: `soql()` escapa comillas; CIIU/NIT/dataset validados por regex; texto libre (cámara, municipio, palabras) sanitizado (sin `%`, `_`, comillas, control). Nunca se interpola texto de usuario sin pasar por estos helpers.
- Paginación `$limit/$offset` (`queryAll`, tope `maxRows`), header `X-App-Token` opcional, rate limit serializado (500 ms), timeout 45 s, reintentos con backoff.
- Caché en memoria acotada (LRU, TTL) que redacta razones sociales de personas naturales / E.U. con apariencia de nombre propio / profesionales independientes. Sin caché a disco.
- Búsquedas: `searchRues({ciiu[], camara})`, `searchReps({municipio, service:'dental'|keywords})` → `{companies, excluded, isMock}`. Excluyen persona natural, profesional independiente y E.U. con nombre propio (`looksLikePersonalName`). Correos solo si son genéricos.
- Registro de llamadas reales vía `onCall` inyectable (forma de `api_calls`).
- Mock con fixtures, `isMock: true`, modo por `SOCRATA_MODE` + `resolveMode`.

## No-alcance
Persistir en DB (F07/F08), geocodificación (RUES/REPS no traen lat/lng), municipio en RUES (no existe; se usa cámara).

## Criterios verificables
1. `ruesWhere`/`repsWhere` rechazan CIIU inválido y neutralizan `'`, `%`, `;`, `--`, `OR 1=1` (test de inyección).
2. Tabla de casos del filtro jurídico: persona natural, E.U. con nombre propio, E.U. comercial, LTDA, S.A.S., profesional independiente, tipoid CC.
3. Paginación con fetch falso: N páginas, corte por `maxRows`, `$offset` correcto.
4. Token en header solo si existe; `onCall` invocado con éxito y error.
5. Caché no contiene razones sociales de personas naturales.
6. Normalización: `externalId`, licencia, `raw` sin campos de representante.
7. `npm run check` verde sin red; cobertura `src/integrations/socrata` ≥ 70 %.

## Plan de tests
`tests/unit/socrata.test.ts` (existente) + `tests/unit/socrata-f04.test.ts` (SoQL, inyección, filtro, paginación, normalización, caché, mock) + `tests/unit/socrata-live.test.ts` (skip salvo `RUN_LIVE=1`).

## Resultado live
(se completa tras ejecutar `RUN_LIVE=1`)
Ejecutado una vez (2026-10-17, `RUN_LIVE=1`, sin token): RUES CIIU 8622 + cámara BOGOTA → 1.445 filas, 1.417 conservadas, 28 descartadas por parecer nombre propio (E.U.). REPS dental (Bogotá, por palabras en nombre) → 241 filas, 150 sedes únicas por `codigoprestador` conservadas (el resto son duplicados de código).
