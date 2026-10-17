# F20 — Recomendación automática + bandit Thompson (modo simulación etiquetado)

## Objetivo
Sugerir cómo repartir el próximo presupuesto entre fuentes (`source_channel`) con Thompson sampling, y mostrar cómo aprendería el sistema en una simulación SIEMPRE etiquetada. Cubre SPEC §10 vista 7 y §14 F20. P2.

## Modelo
- Brazos = fuentes de `metrics.real.bySource` (nunca demo). Un brazo es elegible con ≥ 5 leads del perfil (`MIN_FIT`).
- Recompensa = leads calificados por dólar. Cada muestra: `θ ~ Beta(1+k, 1+n−k)` (k calificados, n del perfil; misma Beta de F13) dividido entre el costo observado por lead del perfil `max(cpl, 0.01)` (piso para fuentes gratuitas, evita infinitos). Valor = θ / costo.
- `recommendNextBudget(metrics, budgetUsd, seed)`: Monte Carlo de 10.000 muestras con PRNG con semilla (mulberry32; Beta vía Gamma de Marsaglia–Tsang). `P(mejor)` = fracción de muestras donde la fuente gana; el reparto es proporcional a P(mejor) (asignación de Thompson), en centavos por residuo mayor, suma exacta = presupuesto.
- Datos insuficientes: < 2 fuentes elegibles o < 3 calificados en total → `status: "insufficient"`, sin reparto ni probabilidades.

## Simulación
`simulateBandit(arms, rounds, seed)`: episodios sintéticos con tasas y costos supuestos; cada ronda reparte con Thompson y observa resultados simulados. Devuelve `kind: "simulation"`, `label: "SIMULACIÓN"`; no recibe datos reales ni produce un `NextBudget`.

## UI
Tarjeta "Dónde invertir el próximo dólar" en `/app/dashboard` (solo bloque real): reparto real si hay datos, o "Datos insuficientes". Toggle "Ver simulación" cambia a la simulación con sello SIMULACIÓN y borde punteado; nunca se muestran mezcladas.

## Aceptación
Tests: determinismo con semilla, mejor brazo recibe más, insuficiente sin reparto, simulación etiquetada y separada, 10.000 muestras < 50 ms. `npm run check` y `e2e:smoke` verdes; capturas 1440 y 390.
