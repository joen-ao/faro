# F00 — Scaffold

## Objetivo
Base ejecutable del proyecto: Next.js + TS estricto + Tailwind + shadcn, tokens Dapta, Drizzle + PGlite, patrón de entorno/integraciones, Vitest, Playwright y puerta `npm run check`. Cubre SPEC §6, §10 (tokens), §12, §13, §14 (F00).

## Alcance
- App Router, `src/`, alias `@/*`, TS strict, ESLint.
- `src/styles/tokens.css` (tokens SPEC §10) conectado a Tailwind; Poppins + DM Sans con `next/font`; modo oscuro por defecto.
- shadcn/ui (`components.json`, `button`, `card`, `badge`) adaptado a tokens.
- `src/db/client.ts` (PGlite en `./.pglite` si `DATABASE_URL` vacío; si no, postgres), `drizzle.config.ts`, schema placeholder.
- `src/lib/env.ts` (Zod, variables de SPEC §12) + `resolveMode(service)`.
- `GET /api/health` y página `/` placeholder.
- Vitest + cobertura v8; Playwright (1440x900, 390x844) + smoke con capturas.
- `.env.example` idéntico al bloque de SPEC §12; README inicial.

## No-alcance
Modelo de datos completo (F01), landing real (F18), adapters (F03+), `coverage:sources` real (F02).

## Interfaces
- `getEnv(): Env` (Zod, defaults seguros: `SEND_ENABLED=false`, modos mock).
- `type Service = "anthropic"|"overpass"|"socrata"|"google_places"|"apify"|"email"`; `resolveMode(service, env?) -> "real"|"mock"`: cae a `mock` si falta credencial requerida (overpass/socrata no requieren).
- `GET /api/health -> { status:"ok", sendEnabled:boolean, modes:Record<Service,"real"|"mock">, dapta:string }` sin secretos.
- `db` desde `@/db/client`.

## Criterios de aceptación
1. `npm run check` (typecheck && lint && test && build) pasa.
2. `npm run dev` sirve `/` y `/api/health` responde JSON sin secretos.
3. Sin llaves: anthropic/google_places/apify/email = mock; overpass/socrata = real; `sendEnabled=false`.
4. `.env.example` coincide con SPEC §12.
5. `npm run e2e:smoke` pasa y genera `artifacts/screens/F00-home-1440.png` y `F00-home-390.png`.
6. Cliente DB abre PGlite local y ejecuta `select 1`.

## Plan de tests
Unit: env (defaults, parseo de booleanos, resolveMode con/sin credencial, modo forzado mock), health route, db client (PGlite en memoria). E2E: smoke de `/` en dos viewports con capturas.

## Notas de UI
Fondo negro, acento lima `#CBE850`, Poppins para títulos, DM Sans para texto, radios 10/16 px, contraste AA, 390 px sin scroll horizontal. Textos en español.
