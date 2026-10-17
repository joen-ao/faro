# F19 — Búsqueda en vivo con mapa (pantalla estrella) + Nuevo perfil

## Objetivo
SPEC §9.1, §10 vistas 2-4, §11: del texto libre al mapa en vivo. Orquestar la búsqueda por lotes (< 60 s por request, progreso en `hunts.progress`, reanudable) y mostrarla: puntos que aparecen, clusters, contadores por fuente, duplicados fusionados, lista filtrable, drawer de lead.

## Alcance
- `src/features/hunts/`: `types`, `geojson` (leads → FeatureCollection), `counters`, `filters`, `batch` (cursor/plan), `service` (crear hunt, `runBatch`, `getStream`, detalle de lead), `demo` (hunt demo sembrado), `estimates` (estimado por fuente, tomado de `reports/coverage.md`).
- API: `POST /api/hunts` (workspace + `icp_profiles` + `hunts` con `progress.sources`), `POST /api/hunts/[id]/run?source=osm|rues|reps&cursor=N` (un lote de 200: fuente → `dedupeAndPersist` → `leads` → `scoreFit` determinista sin IA → `fit_assessments`), `GET /api/hunts/[id]/stream?since=<ms>` (**polling JSON incremental**, no SSE: funciona en Vercel serverless sin conexiones largas; el cliente sondea cada 1,2 s), `GET /api/hunts/[id]/leads/[leadId]` (drawer), `GET /api/hunts/estimate`.
- UI: `/app/new` (conversación, ejemplos clicables, animación de estructurado, chips editables, tarjetas por fuente real/mock, botón "Lanzar búsqueda"); `/app/hunts/[id]` (MapLibre + CARTO Dark Matter, capa GeoJSON con clusters, panel lateral / bottom sheet en 390 px, lista virtualizada, duplicados, línea de tiempo, drawer). `/app/hunts/demo` siembra y abre el hunt demo (2.000 puntos sintéticos en Bogotá, marcado DEMO, `is_demo`).

## No-alcance
Enriquecimiento web y mensajes (F10), recibo real (F13: aquí un recibo mínimo desde `cost_entries`), autenticación.

## Contratos
- `StreamPoint {id, lat|null, lng|null, status: found|fit|contacted|qualified, source, name, score}`; respuesta `{status, cursor, hasMore, points[], updates[], counters{total, bySource}, sources{state,fetched,total,cursor,isMock,log[]}}`.
- `cursor` = offset en la lista de la fuente; la lista es determinista y cacheada (Overpass: caché de disco; Socrata: LRU). Un lote repetido es idempotente (dedupe por `(canal, external_id)`, lead único por `(company, hunt)`).
- RUES/REPS no traen coordenadas: cuentan y aparecen en la lista ("sin ubicación"), no en el mapa.

## Criterios verificables
1. Tests: cursor/lotes y reanudación (un lote repetido no duplica), GeoJSON, contadores, filtros; 2.000 puntos → GeoJSON < 50 ms.
2. Hunt demo: ≥ 2.000 puntos, cuatro estados, DEMO visible; mapa fluido, clusters a bajo zoom, atribución OSM siempre visible.
3. Búsqueda real "dentistas en Bogotá" trae puntos reales de OSM (conteo abajo).
4. Capturas 1440×900 y 390×844 de new, hunt y drawer; `npm run check` y `e2e:smoke` verdes.

## Verificación real
(se completa al verificar)
