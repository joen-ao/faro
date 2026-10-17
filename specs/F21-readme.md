# F21 — README del repo público

## Objetivo
Que un tercero entienda Faro, sus fuentes y sus supuestos de costo, y lo corra en local en 5 minutos. Cubre SPEC §14 F21 (P0).

## Alcance
- `README.md` en español: qué es Faro y cómo cubre el reto (requisito → feature → estado), arquitectura (stack, diagrama Mermaid, adapters y `*_MODE`, modelo de datos), fuentes y licencias con atribuciones, modelo de costo y tarifas, cumplimiento, cómo correr, capturas, resultados de cobertura, estructura del repo, cómo se construyó y limitaciones.
- Cada comando del README se verifica desde cero en un worktree limpio (sin `.pglite`).
- NIT de F13: `GET /api/metrics/receipt/[leadId]` y `/api/metrics/matrix` usan `requireAppAccess`; `/api/metrics/public` sigue pública.

## No-alcance
`HANDOFF.md`, `specs/STATUS.md` y `.loop/` (los escribe el orquestador).

## Aceptación
1. Los comandos documentados funcionan sin llaves (modo mock/demo).
2. Las capturas enlazadas existen en `artifacts/screens/`.
3. Las cifras de cobertura coinciden con `reports/coverage.md`; las tarifas con `DEFAULT_COST_RATES`.
4. Tests de los endpoints cubren 401 sin clave y 200 con clave. `npm run check` verde.
