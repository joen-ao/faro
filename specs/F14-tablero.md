# F14 — Tablero `/app/dashboard`

## Objetivo
Responder "¿qué fuente rinde más por peso invertido?" con números trazables hasta su recibo. Cubre SPEC §7, §8 (panel), §9.4, §10 vista 7, §14 F14.

## Alcance
- Página protegida con `requireAppAccess` (cookie `faro_key` / header `x-app-key`). Toggle "Incluir datos de prueba" por URL `?demo=1`, apagado por defecto.
- KPIs: leads del perfil, CPL global, % calificado (IC 90 %), CPLC; "datos insuficientes" cuando n = 0 o no hay calificados.
- Matriz fuente × canal (heatmap, conmutable CPL / % calificado / CPLC); cada celda abre la lista de leads con su recibo (`GET /api/dashboard/cell`).
- Embudo por fuente, "Pauta vs. fuentes gratuitas" (meta_ads vs. resto), barras CPL vs. CPLC por canal.
- `buildRecommendation(metrics)` pura: solo usa `real`; ganador / empate / datos insuficientes / solo demo.
- Panel de cumplimiento (F09), atribución de fuentes, estados vacío (CTA a `/app/new`), carga (skeleton) y error.

## Reglas
- Real y demo nunca se suman: con el toggle activo el demo es una sección aparte con sello DEMO. Si la BD no tiene filas demo, se usa una BD en memoria efímera con datos demo (no toca la persistente).
- Muestra mínima para recomendar: ≥ 5 leads del perfil y ≥ 1 calificado por fuente; empate si la diferencia de CPLC < 10 %.
- Heatmap: 5 niveles discretos de lima, número siempre visible; AA en ambos extremos.

## Criterios de aceptación
1. Toggle apagado: ningún dato demo/mock en KPIs, matriz ni recomendación.
2. Cada celda del heatmap llega al recibo de sus leads.
3. Legible en 1440 y 390 px sin scroll horizontal de página.
4. Tests: buildRecommendation (4 casos), formateo, toggle off excluye demo, endpoint de celda.
