# LOOP.md — Protocolo de ingeniería en loop (ejecución nocturna)

Este archivo define **cómo** trabaja el agente autónomo. `SPEC.md` define **qué** construir. Si chocan, gana `SPEC.md`; anota el conflicto en `DECISIONS.md`.

## 1. Modelo de ejecución
- Cada **iteración** es una sesión nueva de Claude Code, sin memoria previa. Todo el estado vive en archivos del repo.
- Una iteración avanza **una sola feature** al siguiente estado y termina. No intentes hacer todo en una iteración.
- El script `scripts/overnight.sh` relanza iteraciones hasta que exista `.loop/DONE`, se alcance el máximo de iteraciones o la hora límite.

## 2. Parámetros
| Parámetro | Valor |
|---|---|
| Máx. iteraciones totales | 60 |
| Máx. turnos por iteración | 120 |
| Tiempo objetivo por iteración | ≤ 45 min |
| Hora límite | 07:30 America/Bogota del sábado 17 oct (verificar con `TZ=America/Bogota date`) |
| Máx. rondas de review por feature | 3 |
| Máx. intentos ante el mismo error | 3, luego `BLOCKED` y pasar a la siguiente |
| Umbral de cobertura de tests en `src/features` y `src/integrations` | ≥ 70 % líneas |
| Viewports de captura | 1440×900 y 390×844 |
| Rama principal | `main` (siempre verde) |

## 3. Archivos de estado (crear si no existen)
- `specs/STATUS.md`: tabla `ID | Feature | Prio | Estado | Rama | Rondas review | Nota`. Estados: `TODO`, `SPEC`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`, `BLOCKED`.
- `.loop/PROGRESS.log`: una línea por iteración: `fecha | iteración | feature | de→a | resumen | siguiente paso`.
- `HANDOFF.md`: lo que Joen debe hacer en la mañana (credenciales, decisiones, cómo probar). **Actualizarlo en cada iteración.**
- `DECISIONS.md`: decisiones técnicas con su porqué (1–3 líneas cada una).
- `specs/reviews/Fxx-rN.md`: resultado de cada review.

## 4. Algoritmo de cada iteración
1. **Orientarse (≤ 5 min).** Leer `CLAUDE.md`, `SPEC.md`, este archivo, `specs/STATUS.md`, las últimas 20 líneas de `.loop/PROGRESS.log` y `HANDOFF.md`. Correr `git status` y `TZ=America/Bogota date`.
2. **Chequeo de parada.** Si pasó la hora límite, o todas las P0 y P1 están `DONE`/`BLOCKED` y las P2 intentadas: ir al paso 9 y crear `.loop/DONE`.
3. **Elegir trabajo.** Si hay una feature `IN_REVIEW` o `IN_PROGRESS`, continuarla. Si no, la primera `TODO` según el orden de `SPEC.md §14`.
4. **Sub-spec (si no existe).** Escribir `specs/Fxx-nombre.md` (máx. 1 página): objetivo, alcance y no-alcance, interfaces y tipos, criterios de aceptación verificables, plan de tests, notas de UI y requisitos del brief que cubre. Estado → `SPEC`, commit en `main`.
5. **Implementar.** `git switch -c feat/Fxx-nombre` (o retomar la rama). Implementar con TDD donde aplique. Integraciones siempre con `types.ts` + `real.ts` + `mock.ts`. Vistas: **usar `/design`** (o `frontend-design` si no existe), aplicar los tokens de `SPEC.md §10` y tomar capturas con Playwright en `artifacts/screens/Fxx-*.png`. Commits pequeños.
6. **Puertas de calidad (deben pasar).** `npm run check` = typecheck + lint + unit tests + build. Más `npm run e2e:smoke` si la feature toca UI. Si algo falla, corregir; tras 3 intentos con el mismo error → `BLOCKED` con diagnóstico en `HANDOFF.md`.
7. **Code review por feature.** Estado → `IN_REVIEW`. Lanzar el subagente `reviewer` (`.claude/agents/reviewer.md`) **con contexto limpio**, pasándole solo: el sub-spec, `git diff main...HEAD`, las capturas y la checklist de §5. Guardar el resultado en `specs/reviews/Fxx-rN.md`.
   - Si hay hallazgos `BLOCKER` o `MAJOR`: corregir, volver al paso 6 y nueva ronda (máx. 3).
   - `MINOR` y `NIT`: corregir si es barato; si no, anotarlos en `HANDOFF.md`.
   - Tras 3 rondas con `BLOCKER` abierto: no hacer merge; `BLOCKED` con explicación.
8. **Merge.** `git switch main && git merge --no-ff feat/Fxx-nombre`. Correr `npm run check` en `main`; si falla, revertir el merge. Estado → `DONE`.
9. **Cerrar iteración.** Actualizar `specs/STATUS.md`, `.loop/PROGRESS.log`, `HANDOFF.md` y `README.md` si cambió algo visible. Commit `chore(loop): iteración N`. Terminar la sesión.

## 5. Checklist del reviewer (severidades: BLOCKER, MAJOR, MINOR, NIT)
1. **Spec:** ¿cumple todos los criterios de aceptación del sub-spec y no contradice `SPEC.md`?
2. **Corrección:** bugs, casos borde, errores no manejados, condiciones de carrera, prorrateos de costo mal calculados.
3. **Datos reales vs. mock:** ¿algo mock o demo se presenta como real o se mezcla en totales? (BLOCKER)
4. **Cumplimiento (§8 del spec):** personas naturales, correos con nombre propio, ventanas de envío, supresión, robots.txt, atribución, scraping de Google Maps. (Cualquier violación = BLOCKER)
5. **Seguridad:** secretos en código o logs, webhooks sin verificación de secreto, inyección (SQL, HTML en mensajes), SSRF en el fetch de sitios (bloquear IPs privadas), `SEND_ENABLED` respetado. (BLOCKER)
6. **Tests:** ¿cubren los criterios? ¿hay tests que no prueban nada?
7. **UI/UX** (si aplica): fidelidad a tokens de Dapta, jerarquía visual, estados vacíos, de carga y de error, responsive en 390 px, accesibilidad (foco, contraste, labels) y que no parezca una plantilla genérica. Revisar las capturas.
8. **Mantenibilidad:** tipos estrictos, sin `any` injustificado, nombres claros, sin código muerto.
9. **Rendimiento:** mapa con 2.000 puntos sin bloquearse, requests < 60 s, sin N+1.
10. **Trazabilidad:** ¿los números del tablero se pueden seguir hasta `cost_entries`?

## 6. Guardrails (no negociables)
- **Nunca** enviar mensajes reales (correo, WhatsApp, formularios). `SEND_ENABLED` debe quedar `false`.
- **Nunca** gastar dinero ni crear cuentas en servicios externos. Sin llave → modo `mock`.
- **Sí** se permite llamar APIs públicas sin llave (Overpass, datos.gov.co) con rate limit y caché, para datos reales y la prueba de cobertura.
- **Nunca** hacer `git push`, deploy, ni modificar archivos fuera del repo. Nunca leer `~/.ssh`, llaveros ni `.env` de otros proyectos.
- **Nunca** commitear secretos. `.env.local` en `.gitignore`.
- **Nunca** scraping de Google Maps ni de redes sociales. Nunca guardar nombres de personas.
- No borrar ni reescribir el historial de git. No `--force`.
- Si una decisión es del usuario (ICP final, nombre, cuenta de Meta), no adivinar: dejar la opción configurable y anotarla en `HANDOFF.md`.
- Si `/design` o `/hyperframes` no están disponibles, usar alternativas (`frontend-design`; demo animada en React) y anotarlo.

## 7. Al terminar (`.loop/DONE`)
`HANDOFF.md` debe tener, en este orden:
1. Resumen de 5 líneas: qué funciona, qué está en mock y qué está bloqueado.
2. Resultados de `reports/coverage.md` y recomendación de ICP.
3. Checklist de conexión, uno por servicio, con pasos exactos y la variable de entorno: Supabase, Vercel, Anthropic, Google Places, Apify, Resend y dominio (SPF/DKIM), Dapta (widget, Flow Studio → `/api/webhooks/dapta`, modo push o CSV), Meta Ads (UTM, carga de gasto), WhatsApp (opcional).
4. Cómo probar todo en local en 5 comandos.
5. Riesgos abiertos y hallazgos `MINOR` pendientes.
6. Guion sugerido de la demo de 3 minutos con las pantallas existentes.
