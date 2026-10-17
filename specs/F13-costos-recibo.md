# F13 — Motor de costos y Recibo de lead

## Objetivo
Registrar cada centavo en `cost_entries`, prorratear costos compartidos sin perder ni inventar centavos, y exponer (a) el **recibo de lead** línea por línea y (b) las métricas por fuente y canal (CPL, CPLC, % calificado con intervalo creíble 90 %). Cubre SPEC §4, §7, §10 vista 4, §11 (`/api/metrics/*`), §14 F13.

## Alcance
- `src/features/metrics`: `recordCost` (Zod), `prorateSharedCost`, constructores por categoría (Places con valor de lista, Dapta, humano, pauta por UTM), `getLeadReceipt`, `getChannelMetrics`, `getPublicMetrics`, `betaCredibleInterval`.
- Endpoints `GET /api/metrics/receipt/[leadId]`, `/matrix`, `/public`.
- UI `src/components/lead-receipt.tsx` + página interna `/app/dev/receipt?demo=1` (datos DEMO etiquetados).

## No-alcance
Tablero completo (F14), captura de gasto de pauta en UI, llamadas a servicios externos.

## Reglas de cálculo
- Prorrateo: en micro-USD enteros; `floor(total/n)` a cada lead y el residuo al último; la suma es exacta (1 USD / 3 = 0.333333 + 0.333333 + 0.333334).
- Tier gratuito: `rate` = tarifa de lista, `usd` = cobrado (0). El recibo muestra valor de lista = `quantity × rate` y la marca "cubierto por tier gratuito" cuando `usd = 0` y lista > 0. El total es lo cobrado.
- Dapta = respuestas IA × créditos/respuesta × USD/crédito (`cost_rates`, si no, env). Humano = minutos × tarifa. Pauta = Σ `ad_spend` de la campaña ÷ leads con evento cuyo `utm.utm_campaign` coincide.
- Embudo: `fit` = `fit_score ≥ umbral` del ICP (60 si no hay); contactado = mensaje `sent|delivered`; respondió = evento `reply|widget_chat|form_submit`; calificado = `qualifications.qualified`. Canal de contacto del lead = canal de su primer mensaje enviado, o `dapta_widget` si hubo eventos de widget.
- CPL = costo / fit; CPLC = costo / calificados (`null` si 0 → "datos insuficientes"). % calificado = calificados / fit con Beta(1+k, 1+n−k), IC 90 % (cuantiles 5 % y 95 %).
- Real vs demo: por defecto solo real (excluye `is_demo` e `is_mock`). Con `includeDemo` el resultado trae `demo` en un bloque aparte, nunca sumado a `real`.

## Criterios de aceptación
1. 1 USD entre 3 leads suma exactamente 1.000000; el recibo suma igual que `cost_entries` del lead.
2. `getChannelMetrics` por defecto no incluye demo/mock; con `includeDemo` aparecen separados; costo total real = `getCostTotals`.
3. CPLC `null` con 0 calificados; Beta(k=0,n=10) ≈ [0.005, 0.24].
4. Sin N+1: agregaciones SQL (4–5 consultas fijas).
5. Recibo legible en 1440 y 390 px, total en lima `#CBE850`, etiqueta DEMO.

## Tests
`tests/unit/metrics-*.test.ts`: beta (valores conocidos), prorrateo, recibo, canales/demo, público, endpoints. Cobertura ≥ 70 % en `src/features/metrics`.
