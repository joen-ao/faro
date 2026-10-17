# F01 — Modelo de datos + migraciones + seed demo

## Objetivo
Esquema Drizzle completo de SPEC §6 "Modelo de datos", migraciones versionadas que corren en PGlite y Postgres, seed mínimo marcado `is_demo` y utilidades de test. Cubre SPEC §4, §6, §7 (tarifas y separación demo/mock), §8 (`suppression`), §14 (F01).

## Alcance
- `src/db/schema.ts`: 16 tablas (workspaces, icp_profiles, hunts, companies, company_sources, contact_points, fit_assessments, leads, messages, events, qualifications, cost_entries, cost_rates, ad_spend, suppression, api_calls). Enums con `pgEnum`. UUID PK, `created_at`, FKs, índices.
- Únicos: `company_sources(source_channel, external_id)`, `leads.slug`, `suppression.value`, `cost_rates.key`, `leads.company_id`+`hunt_id`.
- Flags: `is_demo` en companies, leads, cost_entries, ad_spend, events, qualifications. `is_mock` en company_sources, qualifications, cost_entries, events, messages, api_calls. Demo/mock nunca entran en totales reales.
- Migraciones en `src/db/migrations` (drizzle-kit), `migrate(db)` en `src/db/migrate.ts` (PGlite y postgres-js), `npm run db:migrate`.
- `src/db/seed.ts` + `npm run db:seed`: workspace/ICP/empresas/leads/cost_entries demo; `cost_rates` por defecto (no demo).
- `src/db/types.ts` (tipos inferidos), `src/db/queries.ts` (`realCostTotals`, excluye demo/mock por defecto), `tests/helpers/test-db.ts`.

## No-alcance
Dedupe (F07), adapters, cálculo de recibos (F-posteriores), UI.

## Interfaces
- `migrate(conn)`; `createTestDb(): Promise<{db, close}>` (PGlite en memoria con migraciones); `seed(db)`; `getCostTotals(db, {includeDemo?: boolean})` -> `{ byCategory, totalUsd }`.
- Tarifas seed (SPEC §7): Anthropic USD/1M tokens in/out, Places por llamada, Apify por resultado, correo, crédito Dapta 0.001, 40 créditos/respuesta, minuto humano 0.42.

## Criterios de aceptación
1. Las migraciones corren en PGlite en memoria sin error y son idempotentes.
2. Se puede insertar una fila válida en cada tabla.
3. Las restricciones únicas listadas rechazan duplicados.
4. Todo lo insertado por `seed` en companies/leads/cost_entries/events/qualifications/ad_spend tiene `is_demo=true`; `cost_rates` no.
5. `getCostTotals` por defecto excluye `is_demo` e `is_mock`; con `includeDemo` los suma.
6. `npm run check` verde.

## Plan de tests
`tests/unit/schema.test.ts` (migración, inserts, únicos), `tests/unit/seed.test.ts` (flags, tarifas), `tests/unit/totals.test.ts`.

## Requisitos del brief
Base de trazabilidad costo -> `cost_entries` por fuente/canal (CPL, CPLC) y separación de datos de prueba.
