# DECISIONS

- 2026-10-17 03:20 · Orquestación: una sesión orquestadora lanza subagentes (sonnet) implementador y revisor por feature, en vez de `scripts/overnight.sh`. Revisor opus solo para F18 y F19. Motivo: ahorro de uso, instrucción de Joen.
- 2026-10-17 03:20 · `/design` no está instalado como skill en este entorno; el skill de diseño disponible es `impeccable` (diseño frontend). Se usa `impeccable` (equivalente a `frontend-design`) para todas las vistas.
- 2026-10-17 · F00: Next 16.4 + Tailwind v4 (config CSS-first en `globals.css` vía `@theme`; no hay `tailwind.config`). Se quitó `cacheComponents`/`partialPrefetching` del config generado para evitar restricciones en route handlers.
- 2026-10-17 · F00: `@types/node` ^22 (vitest 5 lo exige). shadcn escrito a mano (componentes button/card/badge + `components.json`) sin CLI, mapeado a tokens Faro.
- 2026-10-17 · F00: `resolveMode` = `real` solo si `<SERVICIO>_MODE=real` Y hay credencial (email exige RESEND_API_KEY + EMAIL_FROM); Overpass/Socrata no requieren credencial. Skill `impeccable` consultado solo de forma ligera para la página placeholder.
- 2026-10-17 · F00: e2e usa puerto 3100 con `next start` (build previo) para no chocar con `dev`.
- 2026-10-17 · F01: enums como `pgEnum`; PK uuid (`defaultRandom`); importes `numeric(14,6)` con `mode:"number"`. `AppDb = PgDatabase<...>` común a PGlite y postgres-js. Migraciones con drizzle-kit en `src/db/migrations`, runner `migrate()` por driver.
- 2026-10-17 · F01: `is_demo` en companies/leads/cost_entries/ad_spend/events/qualifications; `is_mock` en company_sources/qualifications/cost_entries/events/messages/api_calls. `getCostTotals` excluye ambos por defecto (toggle `includeDemo`).
- 2026-10-17 · F01: `cost_rates` por clave única; `dapta_credits_per_ai_reply` guarda 40 en `usd` (es un conteo, unidad "credits/AI reply"). Precios Anthropic/Places/Apify/correo/WhatsApp son valores de lista editables, no verificados.
- 2026-10-17 · F01: `db:migrate`/`db:seed` vía `tsx scripts/db-*.ts` (usa `createDb`: PGlite en `./.pglite` o `DATABASE_URL`) en vez de `drizzle-kit migrate`. Seed idempotente.
- 2026-10-17 · F01: no hay Postgres real disponible sin instalar servicios/cuentas; la compatibilidad con Postgres se basa en el dialecto común de Drizzle (`pg-core`, mismo SQL de migración; sin extensiones). Verificado solo en PGlite.
