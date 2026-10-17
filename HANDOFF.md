# HANDOFF — para Joen en la mañana

> El loop nocturno reemplaza este archivo en cada iteración. Estado inicial: solo hay spec, todavía no hay código.

## Pendientes humanos del sábado (en orden)
1. Preguntar a los organizadores cómo recibe leads el agente calificador del entorno de prueba de Dapta, y si tiene número conectado.
2. Revisar `reports/coverage.md` y elegir el ICP principal.
3. Lanzar Meta Ads (~10 USD) antes de las 10:00 hacia la página genérica del ICP.
4. SIM y WhatsApp: máximo 1 hora.
5. Conectar credenciales (ver checklist que deja el loop) y desplegar en Vercel.
6. Activar `SEND_ENABLED=true` solo para el lote real del sábado, antes de las 15:00.

## Progreso del loop nocturno
- 2026-10-17 03:24 · F00 → DONE: Next 16 + Tailwind v4 + Drizzle/PGlite + Vitest + Playwright; check verde; 4 MINOR en review
- 2026-10-17 03:27 · F01 → DONE: 16 tablas Drizzle, migraciones PGlite, seed is_demo; 4 MINOR (ver specs/reviews/F01-r1.md)
- 2026-10-17 03:44 · F02 → DONE: reports/coverage.md real: ICP recomendado dental Bogotá (70 jurídicas verificadas contactables vs 12 restaurantes Bogotá; Miami 336 por verificar)
- 2026-10-17 03:51 · F04 → DONE: RUES por CIIU+cámara, REPS dental, SoQL seguro, filtro jurídico; 4 MINOR (F04-r1)
- 2026-10-17 03:52 · F03 → DONE: Overpass endurecido: caché, rate limit, mirror, raw con lista blanca, email genérico; 4 MINOR (F03-r2)
- 2026-10-17 03:55 · F09 → DONE: Ventanas CO+festivos 2026, supresión, opt-out HMAC con POST, gate correo genérico, /baja; 2 MINOR (F09-r2). Requiere OPTOUT_SECRET en prod
- 2026-10-17 04:01 · F08 → DONE: ICP NL→criteria (Zod), scoring con evidencia y anti-injection, costo IA; mock sin llave. MINOR: legalVerified no persistido → F10 debe bloquear no verificados
- 2026-10-17 04:03 · F07 → DONE: Dedupe NIT/nombre trigram+80m/dominio/teléfono, nunca pierde fuentes, 5k<2s; 3 MINOR (F07-r2)
- 2026-10-17 04:05 · F13 → DONE: Prorrateo exacto, recibo, métricas por canal con Beta 90%, migración automática, demo/mock separados; 7 MINOR (F13-r2). Endpoints sin control de acceso
- 2026-10-17 04:05 · F15 → DONE: Webhook con secreto, http_push con SSRF y SEND_ENABLED, csv_export anti-fórmulas, créditos; requireAppAccess (APP_ACCESS_KEY). 7 MINOR (F15-r2)
- 2026-10-17 04:09 · F05 → DONE: Places API (New) Text Search, field mask mínimo, mock sin llave, costo de lista. MINOR: recordPlacesCost no cableado al hunt; riesgos SKU/caché Google
- 2026-10-17 04:13 · F12 → DONE: /d/[slug] y /d/icp/[icpSlug], widget Dapta aislado o placeholder, opt-out, eventos con dedupe/rate limit, formulario con honeypot; 3 MINOR (F12-r3)
- 2026-10-17 04:22 · F14 → DONE: Tablero: KPIs con IC 90%, matriz fuente×canal trazable a recibos, embudo, pauta vs gratis, recomendación honesta, cumplimiento, toggle demo; 3 MINOR (F14-r2)
