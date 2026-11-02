# F29 · Copiloto de pauta con IA: crear, medir por anuncio, recomendar y aprender

**Prioridad:** P1. **Depende de:** F28 (API de Meta), F13 (costos), F15 (calificación Dapta), F20 (bandit).
**Base de conocimiento:** `docs/research/meta-ads-playbook-2026.md` (capítulos 2–4). Cuando este spec cita una regla ("R-x"), el umbral sale de la tabla 4.1/4.2 del playbook.

## Objetivo
Que Faro maneje la pauta de Mokub como un profesional, con Claude como copiloto:
1. **Crear con IA**: a partir de un brief corto, Claude propone 3–5 anuncios de ángulos distintos. El equipo los edita y aprueba, y Faro crea 1 campaña con 1 conjunto y N anuncios, todo en pausa.
2. **Medir por anuncio, hasta el lead calificado**: métricas de Meta por anuncio (gasto, impresiones, clics, CTR, frecuencia) cruzadas con lo que solo Faro sabe (leads, `calificado` de Dapta, bajas). La métrica de decisión es el **CPQL** (costo por lead calificado).
3. **Recomendar y ajustar**: un motor de reglas deterministas (playbook §4) evalúa a diario. Lo que **baja gasto** se puede automatizar; lo que **sube gasto o cambia la estrategia** siempre pide aprobación humana. Todo queda en un registro de auditoría con opción de revertir.
4. **Aprender**: cada semana se calculan con estadística (Wilson y Beta) qué ángulos y formatos rinden. Claude redacta los aprendizajes con su evidencia y nivel de confianza, y las siguientes propuestas parten de ellos.

## Principios (no negociables)
- **La IA propone, el código decide los límites.** Los umbrales, topes y permisos son código y configuración, nunca salida del modelo. Claude no llama a Meta directamente: solo produce JSON que se valida con Zod.
- **Ningún aprendizaje sin datos suficientes.** Bajo el umbral mínimo (playbook cap. 7) se muestra "datos insuficientes", nunca una conclusión.
- **Nada mock como real:** las propuestas, recomendaciones y aprendizajes del modo mock llevan la marca DEMO y no tocan Meta.
- **Topes duros (playbook §4):**
  - todo se crea en PAUSED;
  - máximo 1 cambio de presupuesto por campaña cada 24 h;
  - el copiloto nunca reactiva lo que pausó un humano;
  - presupuesto ≤ `ADS_MAX_DAILY_BUDGET_COP`;
  - activar requiere `ADS_SPEND_ENABLED` (F28).

## Fase A · Crear con IA y medir por anuncio
- **Brief** (`/app/ads/copilot` → "Nueva campaña"): servicio del catálogo (Oferta, F-oferta), destino (mokub.co o `/d/icp/*`), presupuesto diario, ubicación, público en palabras y notas.
- **Generación** `proposeAds(brief, ctx)`:
  - `ctx` = catálogo de servicios + `knowledge.ts` + los 5 aprendizajes confirmados más recientes. `knowledge.ts` es un extracto curado del playbook: ángulos, frases prohibidas, reglas de copy y formatos.
  - Sale JSON validado: `{variants: [{angle, format_hint, hook, primaryText, headline, description, cta, hypothesis}]}`, con 3–5 variantes y ángulos distintos.
  - El costo de IA se registra en `cost_entries` (categoría `ai`).
- **Linter de políticas** (código, no IA). Bloquea:
  - promesas de resultado: "garantizado", "duplica", "x10", porcentajes sin fuente;
  - "reemplaza a tu equipo";
  - atributos personales: "¿Eres…?", "¿Tienes…?";
  - precios distintos a los del catálogo;
  - longitudes que Meta no acepta.
  - Muestra el motivo de cada bloqueo y el equipo puede editar el texto.
- **Crear** (extiende F28):
  - `createPausedCampaign` acepta N creativos;
  - `url_tags` = `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_content={{ad.id}}`, para que cada lead quede atribuido a su anuncio;
  - se guarda `ad_variants` (ad_id ↔ ángulo, hipótesis, texto, brief_id).
- **Métricas por anuncio:**
  - `getAdInsights` (level=ad, por día: spend, impressions, clicks, inline_link_clicks, frequency, actions) → tabla `ad_insights`;
  - corre en el mismo cron de F28;
  - `adPerformance(db, range)` une `ad_insights` + eventos (`utm_content`) + `qualifications` (no demo, no mock) y calcula CTR de enlace, CPL, tasa de calificación, CPQL e intervalos (Wilson para CTR, Beta para calificación).
- **API:** `META_API_VERSION` pasa a `v25.0` (el playbook advierte la retirada de versiones; nada de ASC/AAC).

## Fase B · Recomendaciones y piloto automático con candado
- **Motor de reglas** `evaluateRules(perf, settings, history)`: funciones puras, una por regla. Primera tanda:
  - **Automatizables (bajan gasto o solo alertan):**
    - R-stoploss: gasto ≥ 2× `cplCap` y 0 leads en 3 días;
    - R-calidad: gasto ≥ 2× `cpqlCap` y 0 calificados;
    - R-ctr: CTR < 50 % del líder, límite superior de Wilson < líder, ≥5.000 impresiones;
    - R-fatiga: frecuencia 7 d > 3 y caída de CTR ≥ 20 % → alerta;
    - R-cpql-alto: CPQL 7 d > 1,5× tope → −20 % de presupuesto, sin bajar de 20.000;
    - R-sobregasto;
    - R-rechazo: `effective_status` DISAPPROVED o WITH_ISSUES → alerta.
  - **Con aprobación:**
    - R-escalar: +≤20 %, ≥7 días desde el último cambio y ≥5 calificados en 14 días;
    - R-activar;
    - R-nuevos-creativos: cuando hay fatiga, propone variantes con IA;
    - R-cambiar-meta: ≥10–15 leads/semana durante 2 semanas.
- **Recomendaciones** (tabla `ad_recommendations`): regla, entidad, acción, evidencia (JSON con métricas, ventana y n), `requires_approval`, estado (`proposed`, `applied`, `dismissed`, `expired`) y `applied_by` (`autopilot` o `human`).
- **Configuración** (`app_settings.ads_copilot`): `{mode: "recommend" | "autopilot", cplCap, cpqlCap, maxChangesPerDay: 1}`. Por defecto `recommend` y topes sin definir, en cuyo caso las reglas que dependen de topes no corren y se avisa.
- **Ejecución** `applyRecommendation(id, actor)`:
  - vuelve a verificar los topes duros y que la entidad no haya cambiado desde la recomendación;
  - llama a F28 (`setCampaignStatus`, `setAdStatus` y `updateCampaignBudget`, nuevos);
  - escribe en `ad_actions` (antes y después, actor, recomendación, resultado);
  - el piloto automático solo ejecuta acciones cuyo efecto es **pausar o bajar presupuesto**;
  - "Revertir" crea la acción inversa, pero si la inversa sube gasto, pide aprobación.
- **Cron diario** (después del sync): evalúa reglas, aplica las automatizables si `mode=autopilot` y deja el resto como propuestas.
- **Interruptor de pánico:** "Pausar todo" pausa todas las campañas de la cuenta creadas por Faro, sin candado.

## Fase C · Aprendizajes
- **Cron semanal (lunes):**
  - agrupa el rendimiento por `angle`, `format_hint` y `hook` (desde `ad_variants`);
  - calcula diferencias con intervalos y etiqueta la confianza: `insuficiente` / `baja` / `media` / `alta`, según los tamaños de muestra del playbook (CTR ~7.700 impresiones por brazo, calificación ~78 leads, etc.);
  - Claude redacta 1–3 frases por hallazgo, **solo** a partir del JSON de estadísticas; no puede citar cifras que no estén en ese JSON (se valida que cada número del texto aparezca en la evidencia).
- **Tabla `ad_learnings`:** afirmación, evidencia, n, confianza, periodo y estado (`vigente` / `reemplazado`).
- La generación (Fase A) recibe los aprendizajes vigentes con confianza ≥ media.

## UI · `/app/ads/copilot`
Pestañas:
- **Resumen:** gasto, CPL, tasa de calificación, CPQL, alertas y acciones de la semana.
- **Anuncios:** tabla por anuncio con ángulo, CTR, CPL, calificados, CPQL, "datos suficientes sí/no" y estado.
- **Recomendaciones:** botones de aprobar o descartar, con la evidencia desplegable.
- **Aprendizajes.**
- **Nueva campaña:** brief → variantes editables → linter → crear en pausa.
- **Configuración:** modo, topes y botón de pánico.

Diseño con los tokens de F14 y F28, responsive a 390 px, sin scroll horizontal.

## Datos (migraciones)
- `ad_variants` (id, ad_id, campaign_id, brief_id, angle, format_hint, hook, primary_text, headline, description, cta, hypothesis, created_at, is_demo)
- `ad_insights` (ad_id, campaign_id, date, spend_local, currency, usd, impressions, clicks, link_clicks, frequency, conversations; único por ad_id+date)
- `ad_recommendations`, `ad_actions` y `ad_learnings`, con los campos de arriba y `is_demo`.

## No-alcance (F30+)
- Píxel y API de Conversiones (`QualifiedLead` de vuelta a Meta).
- Anuncios de WhatsApp (CTWA).
- Subida de imágenes y videos como archivo (por ahora, URL https).
- Formularios instantáneos y conversion leads.
- Nuevos países.
- Edición de audiencias avanzadas.
- Pruebas A/B formales con Experiments.

## Criterios de aceptación
1. En mock, un brief produce de 3 a 5 variantes con ángulos distintos, validadas, marcadas DEMO y sin tocar Meta. Una variante con "resultados garantizados" o un precio fuera del catálogo queda bloqueada por el linter con su motivo.
2. Crear con N variantes envía 1 campaña, 1 conjunto y N anuncios PAUSED, con `url_tags` que llevan `{{ad.id}}`, y guarda N filas en `ad_variants`.
3. El sync guarda `ad_insights` por anuncio y día sin duplicar. `adPerformance` atribuye los leads por `utm_content` y los calificados por `qualifications` reales: 2 leads, 1 calificado y 40.000 COP de gasto dan CPQL = 40.000 COP. Lo demo y lo mock nunca entran.
4. Cada regla tiene tests con datos justo por debajo y justo por encima del umbral. Bajo el mínimo de datos no se recomienda nada.
5. Piloto automático: ejecuta R-stoploss (pausar) pero **nunca** R-escalar. Respeta 1 cambio por campaña cada 24 h y no reactiva lo que pausó un humano. Cada acción queda en `ad_actions`.
6. Los aprendizajes con muestra insuficiente muestran "datos insuficientes". Un texto de Claude con una cifra que no está en la evidencia se rechaza.
7. Todos los endpoints exigen `requireAppAccess`; los crons exigen `CRON_SECRET`; el token nunca aparece en respuestas ni registros.
8. Capturas a 1440×900 y 390×844 sin scroll horizontal; los estados vacío, de carga y de error están diseñados.

## Tests
- `copilot-propose`: validación, linter, mock y costo de IA.
- `copilot-performance`: atribución por anuncio y CPQL.
- `copilot-rules`: tabla de casos por regla.
- `copilot-apply`: candados, piloto automático, auditoría y revertir.
- `copilot-learnings`: estadística, etiquetas de confianza y verificación de cifras.
- `copilot-endpoints`.
- Un e2e de la página.

## Orden de implementación
Fase A → B → C, cada una con su `npm run check` verde y commit propio en `feat/F29-copiloto-pauta`.
