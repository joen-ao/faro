# STATUS — Faro

Orden de construcción (SPEC.md §14): F00 → F01 → F02 → F03 → F04 → F07 → F08 → F09 → F13 → F10 → F11 → F12 → F14 → F15 → F16 → F19 → F18 → F05 → F06 → F21 → F20 → F17.

| ID | Feature | Prio | Estado | Rama | Rondas review | Nota |
|---|---|---|---|---|---|---|
| F00 | Scaffold (Next.js, TS, Tailwind, shadcn, Drizzle+PGlite, Vitest, Playwright, check) | P0 | DONE | feat/F00-scaffold | 1 | Next 16 + Tailwind v4 + Drizzle/PGlite + Vitest + Playwright; check verde; 4 MINOR en review |
| F01 | Modelo de datos + migraciones + seed demo | P0 | DONE | feat/F01-modelo-datos | 1 | 16 tablas Drizzle, migraciones PGlite, seed is_demo; 4 MINOR (ver specs/reviews/F01-r1.md) |
| F02 | Prueba de cobertura (reports/coverage.md real) | P0 | DONE | squash | 3 | reports/coverage.md real: ICP recomendado dental Bogotá (70 jurídicas verificadas contactables vs 12 restaurantes Bogotá; Miami 336 por verificar) |
| F03 | Adapter Overpass | P0 | DONE | feat/F03-overpass | 2 | Overpass endurecido: caché, rate limit, mirror, raw con lista blanca, email genérico; 4 MINOR (F03-r2) |
| F04 | Adapter Socrata (RUES/REPS) | P0 | DONE | feat/F04-socrata | 1 | RUES por CIIU+cámara, REPS dental, SoQL seguro, filtro jurídico; 4 MINOR (F04-r1) |
| F05 | Adapter Google Places | P1 | IN_PROGRESS | | 0 | |
| F06 | Enriquecimiento web (robots.txt + Apify) | P1 | TODO | | 0 | |
| F07 | Dedupe y merge multi-fuente | P0 | DONE | feat/F07-dedupe | 2 | Dedupe NIT/nombre trigram+80m/dominio/teléfono, nunca pierde fuentes, 5k<2s; 3 MINOR (F07-r2) |
| F08 | ICP NL + scoring con evidencia | P0 | DONE | feat/F08-icp-scoring | 2 | ICP NL→criteria (Zod), scoring con evidencia y anti-injection, costo IA; mock sin llave. MINOR: legalVerified no persistido → F10 debe bloquear no verificados |
| F09 | Cumplimiento | P0 | DONE | feat/F09-cumplimiento | 2 | Ventanas CO+festivos 2026, supresión, opt-out HMAC con POST, gate correo genérico, /baja; 2 MINOR (F09-r2). Requiere OPTOUT_SECRET en prod |
| F10 | Outreach | P0 | IN_PROGRESS | | 0 | |
| F11 | Registro de respuestas | P0 | TODO | | 0 | |
| F12 | Página de diagnóstico /d/[slug] | P0 | IN_PROGRESS | | 0 | |
| F13 | Motor de costos y Recibo | P0 | DONE | feat/F13-costos-recibo | 2 | Prorrateo exacto, recibo, métricas por canal con Beta 90%, migración automática, demo/mock separados; 7 MINOR (F13-r2). Endpoints sin control de acceso |
| F14 | Tablero | P0/P1 | IN_PROGRESS | | 0 | |
| F15 | Integración Dapta | P1 | DONE | feat/F15-dapta | 2 | Webhook con secreto, http_push con SSRF y SEND_ENABLED, csv_export anti-fórmulas, créditos; requireAppAccess (APP_ACCESS_KEY). 7 MINOR (F15-r2) |
| F16 | Meta Ads | P1 | TODO | | 0 | |
| F17 | WhatsApp vía Dapta | P2 | TODO | | 0 | |
| F18 | Landing + video HyperFrames | P1 | TODO | | 0 | |
| F19 | Búsqueda en vivo con mapa | P1 | IN_PROGRESS | | 0 | |
| F20 | Recomendación + bandit | P2 | TODO | | 0 | |
| F21 | README + HANDOFF | P0 | TODO | | 0 | |
