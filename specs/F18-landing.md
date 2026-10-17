# F18 — Landing estilo Dapta + video demo

## Objetivo
Landing pública `/` que explica Faro en 30 s: hero con la pregunta del reto, video demo, cómo funciona, pauta vs. fuentes gratuitas con números reales y bloque de cumplimiento. Cubre SPEC §0, §8, §10 vista 1, §14 F18.

## Alcance
- `src/app/page.tsx` (server component) con secciones en `src/components/landing/*`.
- Números desde `getPublicMetrics` (mismo código que `/api/metrics/public`), llamado server-side; si falla o no hay datos reales → "Aún no hay datos del evento". Nunca demo/mock como real.
- `src/features/metrics/landing.ts`: `buildLandingStats(metrics | null)` puro → `{ state: "empty" | "ready", ... }` con formato USD, CPL pauta vs gratuitas y comparación solo si ambos CPL existen.
- Video: `public/demo/faro-demo.mp4` (+ `poster.jpg`) compuesto con HyperFrames (fuente en `video/faro-demo/`). `<video preload="none" muted playsInline controls poster>`; rotulado "Demostración con datos de ejemplo".
- Footer: atribuciones OSM (ODbL) y datos.gov.co (CC BY-SA 4.0), "Integrado con Dapta" (texto), "Proyecto del 30X Hackathon".

## No-alcance
`/app/new` (F19), registro de usuarios, analítica.

## Criterios de aceptación
1. H1 exacto "¿Dónde están tus próximos clientes y cuánto te cuestan?", CTA lima → `/app/new`.
2. Sin datos reales la sección muestra el estado vacío honesto; con datos, los números salen de la DB real.
3. Video < 8 MB H.264, lazy, con poster y controles; sin scroll horizontal en 390 px.
4. Lighthouse performance y accesibilidad ≥ 90 (mobile y desktop).
5. Contraste AA, foco visible, `prefers-reduced-motion` respetado.

## Tests
- Vitest `tests/unit/landing-stats.test.ts` (vacío, solo gratuitas, ambos, formato).
- e2e `tests/e2e/landing.spec.ts` (H1, CTA, video lazy con poster, estado vacío, atribuciones, capturas 1440/390).

## Resultados Lighthouse
(se completan al medir)
