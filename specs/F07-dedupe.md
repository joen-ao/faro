# F07 — Dedupe y merge multi-fuente

## Objetivo
Un solo `company` por empresa real aunque venga de OSM, RUES y REPS (SPEC §6 "Dedupe", §14 F07), sin perder ninguna `company_source`, con registro de cada par fusionado para la UI "N duplicados fusionados" (la vista la integra F19).

## Alcance (`src/features/dedupe/`)
- `normalize.ts`: `normalizeName` (minúsculas, sin tildes, sin sufijos S.A.S./SAS/LTDA/IPS/E.U./S.A., sin palabras genéricas del sector configurables: clínica, consultorio, odontología, dental, restaurante…), `trigramSimilarity` (estilo pg_trgm, en TS: PGlite no trae la extensión), `haversineMeters`, `normalizePhoneE164` (CO +57, US +1), `domainOf` (sin `www`, ignora dominios compartidos: facebook, instagram, linktr.ee, wa.me, google, sites.google, wixsite…).
- `match.ts` / `dedupe.ts`: reglas. 1) NIT exacto; 2) si no, nombre normalizado con similitud ≥ 0,6 Y (distancia ≤ 80 m | mismo dominio | mismo teléfono E.164). Razones: `nit | name+distance | name+domain | name+phone`.
- `dedupeAndPersist(db, huntId, companies)` → `{inserted, merged, pairs[]}`. Compara también con `companies` ya existentes (mismo flag demo). Índice espacial por celdas de ~100 m + mapas NIT/dominio/teléfono: sin O(n²). Transacción, inserciones por lotes, idempotente por `(source_channel, external_id)`.
- Merge: se conserva una company; se agregan todas las fuentes; campos vacíos (web, NIT, lat/lng, dirección) se completan; nombre/dirección los manda la fuente de mayor prioridad (rues = reps > google_places > osm); `contact_points` (teléfono, correo) sin duplicar.
- Persistencia de pares: `hunts.progress.dedupe = { inserted, merged, pairs[] }` (acumulativo entre ejecuciones; sin tabla nueva). Cada par: empresa conservada, fuente fusionada, razón, similitud, distancia.
- `GET /api/hunts/[id]/duplicates` → `{ merged, pairs }`.

## No-alcance
UI (F19), creación de `leads` (F08), fusión transitiva de clusters ya persistidos.

## Criterios verificables
1. Mismo NIT → fusión (`nit`). "Clínica Dental Sonrisas SAS" vs "SONRISAS CLINICA DENTAL S.A.S" a 40 m → fusión.
2. Mismo nombre a 2 km → NO. Cadena con mismo nombre y distinta sede → NO salvo mismo teléfono/dominio.
3. Dominio facebook.com compartido no cuenta.
4. Todas las fuentes se conservan; contact_points sin duplicados; segunda corrida inserta 0.
5. 5.000 empresas sintéticas < 2 s (matching).
6. `npm run check` verde; cobertura `src/features/dedupe` ≥ 70 %.
