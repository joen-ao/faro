# DECISIONS

- 2026-10-17 03:20 · Orquestación: una sesión orquestadora lanza subagentes (sonnet) implementador y revisor por feature, en vez de `scripts/overnight.sh`. Revisor opus solo para F18 y F19. Motivo: ahorro de uso, instrucción de Joen.
- 2026-10-17 03:20 · `/design` no está instalado como skill en este entorno; el skill de diseño disponible es `impeccable` (diseño frontend). Se usa `impeccable` (equivalente a `frontend-design`) para todas las vistas.
- 2026-10-17 · F00: Next 16.4 + Tailwind v4 (config CSS-first en `globals.css` vía `@theme`; no hay `tailwind.config`). Se quitó `cacheComponents`/`partialPrefetching` del config generado para evitar restricciones en route handlers.
- 2026-10-17 · F00: `@types/node` ^22 (vitest 5 lo exige). shadcn escrito a mano (componentes button/card/badge + `components.json`) sin CLI, mapeado a tokens Faro.
- 2026-10-17 · F00: `resolveMode` = `real` solo si `<SERVICIO>_MODE=real` Y hay credencial (email exige RESEND_API_KEY + EMAIL_FROM); Overpass/Socrata no requieren credencial. Skill `impeccable` consultado solo de forma ligera para la página placeholder.
- 2026-10-17 · F00: e2e usa puerto 3100 con `next start` (build previo) para no chocar con `dev`.
