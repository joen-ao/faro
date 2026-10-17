# F08 — ICP desde lenguaje natural + scoring con evidencia

## Objetivo
Convertir una frase ("clínicas dentales en Bogotá…") en `IcpCriteria` validado (SPEC §9.1) y puntuar el encaje 0–100 de cada empresa con criterios cumplidos, evidencia y URL (SPEC §4, §14 F08). Costo de IA registrado (SPEC §7). Sin llave de Anthropic todo corre en mock determinista.

## Alcance
- `src/integrations/anthropic/{types,real,mock,index}.ts`: adapter `completeRaw(prompt)`; `complete<T>(adapter, prompt, zodSchema, {recorder})` valida JSON con Zod, reintenta 1 vez si es malformado/inválido, suma `usage {input_tokens, output_tokens}`. Modo por `resolveMode("anthropic")`; modelo `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`). Cada intento se registra en `api_calls` mediante un `recorder` inyectable.
- `src/features/icp`: `IcpCriteria` (sector, ciiu[], osmTags[], placesTypes[], city, country, bbox?, size?, signals[], exclusions[], language), `parseIcp(prompt, adapter)`, mapeos sector→CIIU/OSM/Places, ejemplos (Bogotá dental, Bogotá restaurantes, Miami restaurantes).
- `src/features/scoring`: `scoreFit(company, criteria, {ai, threshold})` con reglas deterministas (web 20, contacto genérico 20, persona jurídica verificada 20, sector 20, ciudad 10, señales 10; se reescala si el ICP no tiene señales) + IA opcional solo para señales sobre texto web. Un criterio solo es `cumplido` si tiene evidencia y URL; la cita de la IA debe ser subcadena del texto fuente, si no se descarta. Exclusiones → score 0. `meetsThreshold` (default 60).
- Costo: `aiCostUsd(usage, rates)` pura; `recordAiCost` inserta `cost_entries` categoría `ai` (mock → `is_mock=true`, fuera de totales reales). Tarifas de `cost_rates`.
- Endpoints: `POST /api/icp/parse`, `POST /api/leads/[id]/score` (body `{icpProfileId}`), Zod en la frontera, 400 claros.

## No-alcance
UI (F19), fetch/enriquecimiento del sitio (F10; el texto web llega como `raw.websiteText` de la fuente `website`), outreach.

## Criterios de aceptación
1. JSON malformado de la IA → 1 reintento, luego error manejado (`AiValidationError`), nunca excepción cruda.
2. Mock: misma entrada → misma salida y `is_mock=true`; sin red.
3. Todo criterio `cumplido` trae `evidencia` y `url`.
4. `aiCostUsd` correcto; entrada mock no suma en `getCostTotals`.
5. `npm run check` verde; cobertura ≥ 70 % en icp, scoring, anthropic.

## Tests
`tests/unit/f08-*.test.ts`: anthropic (complete/retry/real con cliente falso/mock), icp (parse/presets/endpoint), scoring (reglas, evidencia, exclusiones, IA), cost, servicio con PGlite.
