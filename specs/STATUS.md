# STATUS — Faro

Orden de construcción (SPEC.md §14): F00 → F01 → F02 → F03 → F04 → F07 → F08 → F09 → F13 → F10 → F11 → F12 → F14 → F15 → F16 → F19 → F18 → F05 → F06 → F21 → F20 → F17.

| ID | Feature | Prio | Estado | Rama | Rondas review | Nota |
|---|---|---|---|---|---|---|
| F00 | Scaffold (Next.js, TS, Tailwind, shadcn, Drizzle+PGlite, Vitest, Playwright, check) | P0 | DONE | feat/F00-scaffold | 1 | Next 16 + Tailwind v4 + Drizzle/PGlite + Vitest + Playwright; check verde; 4 MINOR en review |
| F01 | Modelo de datos + migraciones + seed demo | P0 | DONE | feat/F01-modelo-datos | 1 | 16 tablas Drizzle, migraciones PGlite, seed is_demo; 4 MINOR (ver specs/reviews/F01-r1.md) |
| F02 | Prueba de cobertura (reports/coverage.md real) | P0 | DONE | squash | 3 | reports/coverage.md real: ICP recomendado dental Bogotá (70 jurídicas verificadas contactables vs 12 restaurantes Bogotá; Miami 336 por verificar) |
| F03 | Adapter Overpass | P0 | DONE | feat/F03-overpass | 2 | Overpass endurecido: caché, rate limit, mirror, raw con lista blanca, email genérico; 4 MINOR (F03-r2) |
| F04 | Adapter Socrata (RUES/REPS) | P0 | DONE | feat/F04-socrata | 1 | RUES por CIIU+cámara, REPS dental, SoQL seguro, filtro jurídico; 4 MINOR (F04-r1) |
| F05 | Adapter Google Places | P1 | DONE | feat/F05-google-places | 2 | Places API (New) Text Search, field mask mínimo, mock sin llave, costo de lista. MINOR: recordPlacesCost no cableado al hunt; riesgos SKU/caché Google |
| F06 | Enriquecimiento web (robots.txt + Apify) | P1 | DONE | feat/F06-enriquecimiento-web | 2 | Fetch directo con robots/SSRF/guard Maps-redes, correos genéricos estrictos, redacción de nombres, Apify mock con prorrateo; 2 MINOR (sufijos con apellido en isGenericEmail) |
| F07 | Dedupe y merge multi-fuente | P0 | DONE | feat/F07-dedupe | 2 | Dedupe NIT/nombre trigram+80m/dominio/teléfono, nunca pierde fuentes, 5k<2s; 3 MINOR (F07-r2) |
| F08 | ICP NL + scoring con evidencia | P0 | DONE | feat/F08-icp-scoring | 2 | ICP NL→criteria (Zod), scoring con evidencia y anti-injection, costo IA; mock sin llave. MINOR: legalVerified no persistido → F10 debe bloquear no verificados |
| F09 | Cumplimiento | P0 | DONE | feat/F09-cumplimiento | 2 | Ventanas CO+festivos 2026, supresión, opt-out HMAC con POST, gate correo genérico, /baja; 2 MINOR (F09-r2). Requiere OPTOUT_SECRET en prod |
| F10 | Outreach | P0 | DONE | feat/F10-outreach | 2 | Mensajes IA con remitente/baja/dirección, canal email>form asistido, cola atómica con idempotency key, ventanas, SEND_ENABLED=false→simulated; 4 MINOR (F10-r2) |
| F11 | Registro de respuestas | P0 | IN_PROGRESS | | 0 | |
| F12 | Página de diagnóstico /d/[slug] | P0 | DONE | feat/F12-diagnostico | 3 | /d/[slug] y /d/icp/[icpSlug], widget Dapta aislado o placeholder, opt-out, eventos con dedupe/rate limit, formulario con honeypot; 3 MINOR (F12-r3) |
| F13 | Motor de costos y Recibo | P0 | DONE | feat/F13-costos-recibo | 2 | Prorrateo exacto, recibo, métricas por canal con Beta 90%, migración automática, demo/mock separados; 7 MINOR (F13-r2). Endpoints sin control de acceso |
| F14 | Tablero | P0/P1 | DONE | feat/F14-tablero | 2 | Tablero: KPIs con IC 90%, matriz fuente×canal trazable a recibos, embudo, pauta vs gratis, recomendación honesta, cumplimiento, toggle demo; 3 MINOR (F14-r2) |
| F15 | Integración Dapta | P1 | DONE | feat/F15-dapta | 2 | Webhook con secreto, http_push con SSRF y SEND_ENABLED, csv_export anti-fórmulas, créditos; requireAppAccess (APP_ACCESS_KEY). 7 MINOR (F15-r2) |
| F16 | Meta Ads | P1 | DONE | feat/F16-meta-ads | 2 | UTM builder, fbclid→meta_ads, carga de gasto manual/CSV con clave demo separada, CPL meta_ads real; 1 MINOR |
| F17 | WhatsApp vía Dapta | P2 | DONE | feat/F17-whatsapp | 2 | WhatsApp vía Dapta: CSV de secuencias tras WHATSAPP_ENABLED, solo teléfonos de empresa CO, webhook con secreto, STOP suprime; 3 MINOR |
| F18 | Landing + video HyperFrames | P1 | DONE | feat/F18-landing | 1 | Landing estilo Dapta + video HyperFrames local (1,2 MB, rotulado demostración); Lighthouse móvil 94–96/100, desktop 100/100; MINOR aplicados |
| F19 | Búsqueda en vivo con mapa | P1 | IN_REVIEW | | 0 | |
| F20 | Recomendación + bandit | P2 | DONE | feat/F20-bandit | 2 | Thompson sampling por fuente con P(mejor), datos insuficientes honestos, simulación siempre etiquetada; 2 MINOR (F20-r2) |
| F21 | README + HANDOFF | P0 | TODO | | 0 | |
