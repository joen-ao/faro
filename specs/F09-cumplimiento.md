# F09 — Cumplimiento

## Objetivo
Hacer cumplir SPEC §8 en código: solo personas jurídicas, solo correos genéricos, supresión, ventanas de envío (Ley 2300 adoptada voluntariamente), 1 mensaje por empresa, opt-out de un clic, atribución y métricas del panel.

## Alcance (`src/features/compliance/`)
- `email.ts`: `isGenericEmail` (movido desde coverage, que lo reexporta), `looksLikePersonalEmail` (nombre.apellido@, inicial+apellido, nombres comunes), `isLegalEntity(name, hint?)` heurístico → `{legal, verified}`; sin naturaleza jurídica queda "por verificar".
- `windows.ts` + `src/config/holidays-co-2026.ts`: `checkSendWindow(date, country)` → `{allowed, reason, nextAllowedAt}`. CO (America/Bogota): L–V 7:00–19:00, sáb 8:00–15:00, nunca domingo ni festivo. EE. UU.: solo correo, sin ventana horaria.
- `suppression.ts`: `isSuppressed(db,{email|domain|phone})`, `suppress(db,value,reason)` (idempotente; infiere tipo).
- `optout.ts`: `createOptOutToken(leadId, contact?)` / `verifyOptOutToken` (HMAC-SHA256, `OPTOUT_SECRET`, default solo-dev con aviso, comparación en tiempo constante); `applyOptOut(db, token)` suprime contactos del lead, lead → `opted_out`, evento `opt_out`.
- `evaluate.ts`: `evaluateOutreach(lead, contact, now, opts)` → `{allowed, simulated, blocks[{rule,message}]}`; reglas: `natural_person`, `personal_email`, `suppressed`, `outside_window`, `already_contacted`, `channel_not_allowed` (US), `sender_missing`; `SEND_ENABLED=false` → "simulado" (no bloquea, marca `simulated`).
- `metrics.ts`: `computeComplianceMetrics(rows)` pura + `queryComplianceMetrics(db)`: naturales contactadas (debe ser 0), % remitente identificado, opt-outs respetados, bloqueados por horario.
- `GET /api/optout/[token]` y página `/baja/[token]` (móvil primero, tokens SPEC §10), `src/components/attribution.tsx` (OSM ODbL + datos.gov.co CC BY-SA 4.0).

## No-alcance
Panel visual (F14), envío real, robots.txt (F08).

## Criterios de aceptación
1. Domingo, festivos (12 oct, 2 nov, 16 nov, 8 dic, 25 dic 2026), sábado 15:01 y lunes 6:59 bloqueados con `nextAllowedAt` correcto; sábado 15:00 y lunes 7:00 permitidos.
2. Tabla de casos de regex de nombres/genéricos pasa.
3. Token manipulado o firmado con otro secreto es rechazado; token válido suprime y es idempotente.
4. `/baja/[token]` confirma al instante; token inválido muestra error sin suprimir.
5. `npm run check` (cobertura compliance ≥ 70 %) y `npm run e2e:smoke` verdes; capturas 1440 y 390.
