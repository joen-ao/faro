# F23 · Faro solo con login (sin acceso de evaluador)

**Prioridad:** P0 · **Cubre:** acceso al panel y a toda API que gaste o escriba.

## Objetivo
Ya ganamos el 30X Hackathon: el acceso de evaluador de un clic (solo lectura) sobra. Faro se usa solo con la clave del equipo (`APP_ACCESS_KEY`), y ninguna ruta que gaste dinero (IA, Apify, envíos) queda abierta.

## Cambios
- Quitar `evaluatorToken`, `evaluatorMayDo`, `EVALUATOR_WRITES` e `isEvaluator` de `src/lib/app-access.ts`; un token de evaluador antiguo ya no entra (401).
- Borrar `POST /api/auth/evaluator` y el bloque "Entrar como evaluador" de `/app/login`.
- Proteger con `requireAppAccess` las rutas que estaban abiertas y gastan IA: `POST /api/icp/parse`, `POST /api/leads/[id]/score`.
- Siguen públicas a propósito: landing `/`, `/d/*` (diagnóstico del prospecto), `/baja/*`, `/api/optout/*`, `/api/events`, `/api/contact`, `/api/health`, `/api/metrics/public`, webhooks (secreto propio) y `/api/cron/*` (secreto `CRON_SECRET`).
- README: quitar "Para evaluadores"; explicar el acceso con clave.

## Criterios de aceptación
1. `/app/*` sin cookie → `/app/login`; con clave correcta → entra.
2. La página de login no ofrece entrar sin clave.
3. Token derivado de evaluador → 401 en cualquier API.
4. `/api/icp/parse` y `/api/leads/[id]/score` sin clave → 401.
5. Tests unitarios y e2e actualizados (sin pruebas de evaluador).
