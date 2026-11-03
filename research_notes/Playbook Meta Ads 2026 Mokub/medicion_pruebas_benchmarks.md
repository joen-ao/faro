# Medición, pruebas/escalado y benchmarks de Meta Ads para generación de leads (estado a nov-2026)

Contexto Mokub: presupuesto de 20.000–50.000 COP/día (USD 5–12) por campaña. Embudo: anuncio → web/página de diagnóstico (con UTMs) → agente de IA en WhatsApp (Dapta) que marca `lead_calificado` true/false → llamada. Faro guarda qué leads fueron calificados.
Etiquetas: **[Verificado]** = documentación oficial de Meta. **[Práctica]** = blog de agencia, proveedor o benchmark. **[Cálculo]** = cálculo estadístico propio con fórmulas estándar.
Fecha de consulta de todas las fuentes: 2 nov 2026.

---

## 1. ¿Cómo se envían hoy a Meta los eventos de lead calificado o de etapa de CRM? (CAPI para CRM, lead_event_source, requisitos de "Conversion leads")

### Takeaway
La optimización por "Conversion Leads" (CAPI para CRM) solo funciona con leads de formularios nativos de Meta (Instant Forms), exige unos 200 leads/mes y una etapa con tasa de conversión de 1–40 %. El embudo actual de Mokub (web → WhatsApp) **no califica**. Para Mokub, lo viable es enviar un evento `QualifiedLead` por la Conversions API web estándar (con fbc/fbp/email/teléfono) o por la CAPI for Business Messaging si usan anuncios click-to-WhatsApp. Ese evento sirve sobre todo para **medir**; con su volumen no da para **optimizar**.

### Cited Findings
- [Verificado] El objetivo Conversion Leads "is currently only compatible with Facebook/Instagram's Lead Ads (Instant Forms)" (es compatible solo con los Lead Ads de Facebook/Instagram). Requisitos: generar **al menos 200 leads al mes**, que la etapa a optimizar tenga una **tasa de conversión entre 1 % y 40 %**, que esa etapa ocurra **dentro de los 28 días** posteriores al lead, y que los datos se suban **al menos una vez al día**. Tiempo estimado: unas 3–4 semanas de implementación con desarrollador (menos de 1 día con Zapier u otro partner), 1–2 días de verificación de datos por Meta y una fase de aprendizaje de 2–4 semanas — [Meta Developers: Conversions API for CRM Integration](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration.md)
- [Verificado] Payload exigido: `action_source: "system_generated"`; `user_data.lead_id` (ID de lead de Meta de 15–17 dígitos, que llega en el campo `leadgen_id` del webhook) más al menos un parámetro de cliente hasheado (em/ph); `custom_data.event_source: "crm"` y `custom_data.lead_event_source: "<nombre del CRM>"`. Sin `lead_event_source` y `event_source` el evento no se reconoce para Conversion Leads. `event_name` es libre (es el nombre de la etapa en el CRM). Los payloads web los acepta la CAPI y aparecen en Events Manager, pero **no se reconocen** para esta integración — [Meta Developers: Implementing the CRM integration](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration)
- [Verificado] Operación: enviar cada cambio de etapa (no una foto del estado), incluido el lead crudo. Hay que mandar **al menos 2 etapas del embudo, idealmente 3**; "solo Sale no basta". Lotes de hasta 1.000 eventos, y si hay un error se descarta el lote entero. Se puede hacer backfill de hasta 7 días. `event_time` debe ser posterior a la creación del lead. Los eventos aparecen en Events Manager en cerca de 1 hora — [Meta Developers: CRM integration FAQ](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/faq); [implementación](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration)
- [Verificado, con contradicción] El FAQ habla de lead ads nativos "Instant Forms or Website Forms", mientras que la página principal dice "solo Instant Forms". No queda claro si "Website Forms" se refiere a formularios web genéricos; en ningún caso es la landing propia de Mokub — [FAQ](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/faq) vs. [página principal](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration.md)
- [Práctica, cita datos de Meta] Según una prueba A/B de Meta con 1.031 anunciantes (28 jul–11 ago 2025), Conversion Leads logró en promedio un **costo por lead de calidad 21 % menor**. Zapier reporta un 15 % con otro corte. Los dos son datos de partners, no de una página de Meta — [Make: Meta Conversions API for CRM](https://www.make.com/en/blog/meta-make-conversions-api-for-crm); [Zapier: Meta guide to better lead quality](https://zapier.com/blog/meta-guide-to-better-lead-quality/)
- [Verificado] **Offline Conversions API (OCAPI):** se discontinuó en mayo de 2025, cuando venció la versión v16.0 de Graph API. Meta pide migrar a la Conversions API normal; los eventos offline se siguen enviando por ahí con `action_source` (por ejemplo `physical_store` o `system_generated`) — [Meta Marketing API changelog v20.0](https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version20.0). [Práctica] Hay fuentes que dan el 14 de mayo de 2025 y otras el 1 de mayo; Jon Loomer recoge un caso aislado y no confirmado de caída del 70 % en eventos aceptados tras migrar — [Jon Loomer](https://www.jonloomer.com/qvt/offline-conversions-api-deprecation-delayed/); [Zapier help](https://ob-zapier.helpjuice.com/changes-impacting-facebook-offline-conversions-users)
- [Verificado] **CAPI for Business Messaging** (sirve si Mokub usa anuncios click-to-WhatsApp): `action_source: "business_messaging"` y `messaging_channel: "whatsapp"`. En WhatsApp con click ID se envía `user_data.whatsapp_business_account_id` + `ctwa_clid`; sin click ID se exige `page_id` más un dato de cliente hasheado. Entre los eventos soportados están **`LeadSubmitted` y `QualifiedLead`** (además de Purchase, OrderCreated y otros). La página solo describe **optimización por Purchase** para click-to-WhatsApp/Messenger; para los demás eventos no dice que sirvan para optimizar (asumir que solo reportan hasta confirmarlo). Atribuye a interacciones con el anuncio de los últimos 7 días — [Meta Developers: Conversions API for Business Messaging](https://developers.facebook.com/documentation/ads-commerce/conversions-api/business-messaging)
- [Práctica] El `ctwa_clid` viene en el `referral` del primer mensaje entrante, Meta lo valida y no se puede fabricar, y el evento debe estar dentro de los últimos 7 días. Según Zernio, `Lead` se rechaza en business_messaging; hay que usar `LeadSubmitted` — [AWS End User Messaging docs](https://docs.aws.amazon.com/id_id/social-messaging/latest/userguide/conversions-api.html); [Zernio CTWA docs](https://docs.zernio.com/platforms/whatsapp/ctwa)

### Inferences
- Con USD 5–12/día, Mokub no llega a 200 leads/mes por campaña, y su embudo no usa Instant Forms. **Conversion Leads no aplica hoy.** Solo aplicaría si probaran una campaña con Instant Form (que Dapta o Faro conectarían por `lead_id`) y juntaran volumen entre campañas.
- Ruta recomendada para el embudo actual (web → WhatsApp):
  1. Pixel + CAPI web con eventos `Lead` o `Contact` deduplicados con `event_id` en la página de diagnóstico.
  2. Faro guarda `fbc` (a partir de `fbclid`), `fbp`, UTMs, email y teléfono al iniciar el diagnóstico o el WhatsApp.
  3. Cuando Dapta marca `lead_calificado=true`, Faro envía por CAPI un evento personalizado `QualifiedLead` (o el estándar `Lead` con `custom_data.lead_status`) con `action_source: "website"` (o `"system_generated"`), el `event_time` real, `fbc`, `fbp`, `em` y `ph` hasheados y `external_id`.
  4. En Events Manager se crea una conversión personalizada sobre ese evento para **reportar el costo por lead calificado** por anuncio.
- Con anuncios click-to-WhatsApp, Faro/Dapta podrían enviar `QualifiedLead` por CAPI for Business Messaging usando `ctwa_clid`. Hoy debe tratarse como medición, no como objetivo de optimización.
- Optimizar directamente por `QualifiedLead` requiere unos 50 eventos/semana por conjunto de anuncios (ver sección 4). Con 10–30 % de calificados y un presupuesto de USD 5–12/día no se alcanza. Lo práctico es optimizar por un evento de más volumen (Lead o inicio de conversación) y **decidir manualmente** con el costo por lead calificado.

### Gaps
- Sin dato confiable sobre si, a nov-2026, Meta permite Conversion Leads con leads de sitio web o de click-to-WhatsApp. La documentación es contradictoria ("Website Forms").
- La página de Business Messaging no confirma si `QualifiedLead` puede usarse como evento de optimización de anuncios.
- Sin cambios oficiales de 2026 a Conversion Leads; solo un blog sin verificar habla de "endurecimiento".

---

## 2. Medición: Pixel + CAPI, EMQ, atribución (cambios 2025–2026), UTMs, tasa de calidad y por qué el CPL engaña

### Takeaway
Desde el **12 de enero de 2026**, Meta dejó de devolver las ventanas de atribución de 7 y 28 días por vista. Quedan 1d click, 7d click, 28d click, 1d engaged-view y 1d view, y la configuración por defecto es 7d click + 1d view. Para Mokub la métrica de decisión debe ser el **costo por lead calificado** (CPL / tasa de calificación), medido en Faro con UTMs y comparado con lo que reporta Meta.

### Cited Findings
- [Verificado] Ads Insights API: desde el 12 ene 2026 las ventanas `7d_view` y `28d_view` "will no longer be returned" (dejan de devolverse). Siguen disponibles 1-day click, 7-day click, 28-day click, 1-day engaged view y 1-day view. Los campos únicos (`unique_actions`) y los desgloses horarios quedan limitados a 13 meses de historial, el desglose por frecuencia a 6 meses, y los totales se mantienen 37 meses — [Meta for Developers blog, 16 oct 2025](https://developers.facebook.com/blog/post/2025/10/16/ads-insights-api-metric-availability-updates/)
- [Práctica] Varias fuentes indican que el cambio también afectó a Ads Manager y que el default sigue siendo 7d click + 1d view. Se habla de caídas del 15–30 % en conversiones reportadas para cuentas que usaban ventanas de vista largas, cifra que no se pudo verificar — [Dataslayer](https://dataslayer.ai/blog/meta-ads-attribution-window-removed-january-2026); [Supermetrics docs](https://docs.supermetrics.com/docs/facebook-ads-new-historical-limitations-attribution-window-and-metric-removals-january-12-2026.md); [PPC Land](https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/)
- [Verificado] Configuración redundante: enviar los mismos eventos por Pixel y por CAPI. Para deduplicar, ambos deben usar el mismo `event_name` y llevar `event_id` (o `external_id` + `fbp`). EMQ (Event Match Quality) es una puntuación "out of 10" (sobre 10) que solo existe para eventos web. Parámetros de cliente de alta calidad: email, IP, nombre y teléfono. Los valores de `fbp`/`fbc` hay que refrescarlos con regularidad, y se recomienda enviar eventos en tiempo real o casi — [Meta Developers: CAPI best practices](https://developers.facebook.com/docs/marketing-api/conversions-api/best-practices)
- [Práctica] Email y teléfono son las señales más fuertes. La falta de `fbc` es la causa más común de EMQ estancado en 3,0–4,5. `fbp`, `fbc`, IP y user agent **no** se hashean; email y teléfono se normalizan (teléfono en E.164, por ejemplo +57…) y se pasan por SHA-256 — [CustomerLabs](https://customerlabs.com/blog/improve-your-event-match-quality-from-ok-to-great/); [WeltPixel](https://www.weltpixel.com/blogs/news/meta-event-match-quality-emq-guide); [Usercentrics](https://usercentrics.com/knowledge-hub/improve-meta-event-match-quality-score/)
- [Práctica] WordStream/LocaliQ 2025 (EE. UU.): la tasa de conversión de campañas de leads **bajó** de 8,67 % a 7,72 % mientras el CPL subió 21 %, a USD 27,66. Es decir, el volumen barato no garantiza calidad — [PPC Land sobre WordStream 2025, 9 sep 2025](https://ppc.land/facebook-ad-costs-jump-21-as-lead-campaigns-struggle-while-traffic-ads-thrive/)
- [Práctica] En B2B SaaS, los Lead Ads (Instant Form) dan un CPL más bajo (USD 80–220 de mediana) que la landing (USD 120–380), pero una conversión a SQL **35–55 % menor**. Es el ejemplo típico de un CPL bajo que esconde un costo por lead calificado alto. Son datos autodeclarados de agencia, sin metodología pública — [GrowthSpree, 22 may 2026](https://www.growthspreeofficial.com/blogs/meta-ads-benchmarks-2026-b2b-saas-b2b-cpm-cpc-cpl-vertical)

### Inferences
- Fórmula de decisión: **CPQL (costo por lead calificado) = Gasto / Leads calificados = CPL / tasa de calificación.** Ejemplo: un anuncio A con CPL de 15.000 COP y 10 % de calificados tiene un CPQL de 150.000 COP; un anuncio B con CPL de 30.000 COP y 40 % de calificados tiene un CPQL de 75.000 COP. B es el doble de eficiente aunque su CPL sea el doble.
- UTMs: usar `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}` con los parámetros dinámicos de Meta, más `fbclid`. Faro debe guardar UTMs y `fbclid` en la sesión del diagnóstico y llevarlos al registro de WhatsApp para atribuir cada lead calificado al anuncio, sin depender de la ventana de Meta. (Los parámetros dinámicos `{{campaign.name}}` son una función conocida de Ads Manager; no se volvió a verificar su documentación.)
- Con la ventana de 7 días por vista eliminada, conviene comparar siempre "lo que Meta reporta (7d click + 1d view)" con "lo que Faro ve por UTM". Las brechas grandes indican conversiones por vista, problemas de deduplicación o fallas de tracking.

### Gaps
- No se encontró un documento oficial de Meta de 2025–2026 sobre otros cambios de atribución en Ads Manager, como la redefinición de clics vs. "engaged-view" o modelos incrementales. Sin dato confiable.
- Sin escala oficial de EMQ por rangos ("pobre/aceptable/buena/excelente") en las fuentes consultadas.

---

## 3. Tamaños de muestra mínimos antes de juzgar CTR, CVR, tasa de calificación y CPA con presupuesto bajo

### Takeaway
Para detectar diferencias **grandes** (por ejemplo, CTR 1,0 % vs. 1,5 %) se necesitan unas **7.700 impresiones por variante**. Para diferencias de +20 % relativo hacen falta más de 40.000. Comparar CVR exige cientos de clics y comparar tasas de calificación unas decenas de leads. Con menos de 10 conversiones por variante, el CPA tiene una incertidumbre de alrededor de ±60 %.

### Cited Findings
- [Cálculo] Fórmula para comparar dos proporciones (α = 0,05 bilateral, potencia del 80 %): **n por variante = (1,96 + 0,84)² × [p₁(1−p₁) + p₂(1−p₂)] / (p₁ − p₂)²** — referencia: [Evan Miller, sample size calculator](https://www.evanmiller.org/ab-testing/sample-size.html)
  - CTR 1,0 % vs. 1,5 % (+50 % relativo): unas **7.700 impresiones por variante**.
  - CTR 1,0 % vs. 1,2 % (+20 %): unas **42.600 impresiones por variante**.
  - CVR landing→lead 5 % vs. 10 %: unos **430 clics por variante**. CVR 5 % vs. 7,5 %: unos **1.470 clics por variante**.
  - Tasa de calificación 20 % vs. 40 %: unos **78 leads por variante**.
- [Cálculo] Intervalo de Wilson al 95 % (útil con conteos pequeños) — referencia: [Wikipedia: Binomial proportion confidence interval](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval)
  - 15 clics sobre 1.000 impresiones (CTR 1,5 %): IC de **0,91 % a 2,46 %**.
  - 3 calificados de 10 leads (30 %): IC de **10,8 % a 60,3 %**, que en la práctica no permite concluir nada.
- [Cálculo] CPA ≈ gasto / conteo de conversiones, con el conteo tratado como Poisson. IC exacto al 95 %: con 10 conversiones el rango es 4,8–18,4 (el CPA real puede estar entre −46 % y +108 % del observado); con 30, 20,2–42,8 (alrededor de ±35 %); con 50, 37,1–65,9 (alrededor de ±27 %).
- [Práctica] Ninguna guía oficial de Meta da tamaños de muestra mínimos. Guías de terceros dicen que la herramienta A/B de Meta (Experiments) declara ganador con alrededor del 95 % de confianza, que la duración recomendada es de 7–30 días y que se debe revisar la "potencia estimada" (≥80 %). Esto no se verificó en documentación de Meta — [GrowWithSakib](https://growwithsakib.com/meta-ads-ab-testing/); [AdAdvisor docs](https://adadvisor.ai/docs/learn/ab-testing). [Práctica] TikTok sí recomienda oficialmente un presupuesto con potencia ≥80 % en sus split tests — [TikTok Ads Help](https://ads.tiktok.com/help/article/split-test-best-practices)
- [Práctica] Detener un test en cuanto "se ve" un ganador ("peeking") infla los falsos positivos — [Kameleoon](https://www.kameleoon.com/blog/stopping-ab-tests-too-early)

### Inferences
- Traducido a dinero, con supuestos tomados de los benchmarks de Colombia de la sección 5 (de baja confianza): CPM de ~USD 2–4 y CTR de ~1 %, lo que da un CPC de ~USD 0,20–0,40.
  - 7.700 impresiones cuestan unos USD 15–30 por variante. **Probar ganchos o creativos por CTR sí es factible** con USD 5–12/día (2–6 días por variante).
  - 430 clics cuestan unos USD 90–170 por variante: comparar la CVR de la landing toma de 2 a 4 semanas.
  - 78 leads por variante para comparar calidad: sin dato confiable de CPL en Colombia, pero con un CPL de USD 3–10 serían USD 230–780 por variante. **No es factible como test formal.** La calidad se monitorea de forma acumulada y bayesiana.
- Reglas operativas sugeridas para Mokub:
  1. Juzgar CTR y hook rate tras unas **3.000–8.000 impresiones** por anuncio. Solo se pausa por CTR si el límite superior de Wilson queda por debajo del CTR del líder.
  2. No juzgar CVR ni CPL antes de unos **100 clics** por anuncio, ni el CPA antes de **gastar 2–3 veces el CPA objetivo** sin conversión.
  3. Juzgar la tasa de calificación con un enfoque bayesiano: Beta(1 + calificados, 1 + no calificados) y P(B > A). Actuar si P > 90 %, aceptando que con menos de 20 leads la decisión es débil.
- **Bandits frente a A/B:** el reparto automático de Meta entre anuncios de un mismo conjunto (Advantage+ creative/delivery) ya funciona como un bandit. Explota pronto y casi no da presupuesto a los perdedores, así que no sirve para *aprender* la causa. El A/B formal (Experiments) reparte 50/50 y sí permite inferir, pero cuesta el doble de tiempo. Con presupuestos chicos conviene un **enfoque mixto**: testear creativos de forma "orgánica" en un conjunto de prueba (3–5 anuncios), aceptar el sesgo del bandit y validar con A/B formal solo las hipótesis grandes (ángulo de oferta, landing vs. WhatsApp directo).

### Gaps
- Sin documentación oficial de Meta (2025–2026) sobre umbrales de potencia o duración mínima de Experiments.
- Sin dato confiable de CPL por lead calificado en Colombia para estimar el costo de los tests de calidad.

---

## 4. Reglas de escalado y fase de aprendizaje: ¿qué dice Meta sobre las ediciones significativas? ¿Qué hacen los practicantes?

### Takeaway
La regla "50 eventos de optimización en 7 días para salir de aprendizaje" y la lista de ediciones significativas vienen de Meta, pero el Help Center no se pudo leer y la cifra se cita aquí desde terceros. El "20 %/día" es una heurística de practicantes, **no una regla oficial**. Con USD 5–12/día, casi cualquier optimización por leads quedará en "Learning Limited".

### Cited Findings
- [Práctica, atribuida a Meta] Un conjunto de anuncios sale de la fase de aprendizaje con unos **50 eventos de optimización en 7 días**; si no los alcanza, queda en "Learning Limited" — [AdManage](https://admanage.ai/blog/facebook-ads-learning-phase-guide); [Jetfuel 2026](https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/). El artículo oficial ([Meta Business Help Center: About the learning phase](https://www.facebook.com/business/help/112167992830700)) no devolvió contenido legible, así que **no se pudo verificar textualmente**.
- [Práctica] Ediciones que reinician el aprendizaje: cualquier cambio de segmentación o de creativo, agregar un anuncio nuevo, pausar 7 días o más, cambiar la estrategia de puja o el evento de optimización, y cambios de presupuesto "significativos" — [AdManage](https://admanage.ai/blog/facebook-ads-learning-phase-guide); [Webtonic](https://www.webtonic.io/blog/campaign-re-entered-learning-phase-causes)
- [Práctica] Umbral de presupuesto: lo más citado es que cambios de **alrededor del 20 % o más** pueden reiniciar el aprendizaje. Algunos recomiendan no pasar del 10 %/día en conjuntos que aún están aprendiendo, y otros dicen que subir hasta un 15–20 % no lo reinicia. No es una regla oficial — [GoMarble](https://gomarble.ai/blog/meta-ads-learning-phase-understanding); [Cometly](https://www.cometly.com/post/facebook-ads-learning-phase-optimization)
- [Práctica, sin verificar] Un blog afirma que tras la actualización "Andromeda" de abril de 2026 más ediciones reinician el aprendizaje y la salida tarda 7–14 días. No hay confirmación de Meta — citado en resultados de búsqueda vía [AdAdvisor](https://adadvisor.ai/docs/learn/learning-phase).
- [Práctica] En presupuestos de startup se sugiere optimizar por un evento más frecuente (más arriba en el embudo) y consolidar conjuntos para acercarse a los 50 eventos — [Stackmatix](https://www.stackmatix.com/blog/ad-learning-phase-small-budgets)

### Inferences
- Cálculo: 50 eventos/semana con USD 35–84/semana exigen un CPA de USD 0,70–1,70. Eso es imposible para leads B2B y solo es plausible para "inicio de conversación" o "landing view". **Aceptar "Learning Limited"** o consolidar en 1 campaña con 1 conjunto de anuncios en lugar de varias.
- Reglas sugeridas para Mokub (heurísticas, no oficiales):
  1. **Pausar perdedores** cuando cumplan el umbral de la sección 3 y queden peor que el líder: CTR por debajo del 50 % del líder tras más de 5.000 impresiones, o gasto mayor a 2× el CPQL objetivo sin ningún lead calificado.
  2. **Escalar en vertical** con subidas de ≤20 % cada 3–4 días, solo con un CPQL estable durante 7 días. Se recomienda no editar más de una vez cada 3–7 días.
  3. **Escalar en horizontal** duplicando el ganador en un conjunto nuevo (otra audiencia u otra ubicación) en lugar de subir mucho el presupuesto de uno solo. Con presupuesto bajo, el horizontal fragmenta la señal; preferir el vertical hasta unos 100.000 COP/día.
  4. Agrupar los cambios: añadir creativos nuevos en lotes semanales, no de a uno.

### Gaps
- Sin texto oficial verificable de Meta con el porcentaje exacto de presupuesto que constituye una "edición significativa". Sin dato confiable.
- No se pudo confirmar la "actualización Andromeda" de abril de 2026 en fuentes de Meta.

---

## 5. Benchmarks recientes (CTR, CPC, CPM, CPL, CVR) para B2B, tecnología y servicios profesionales, con foco en LATAM y Colombia

### Takeaway
Los benchmarks globales y de EE. UU. de 2025–2026 ubican las campañas de leads en un CTR de ~2,6 %, un CPC de ~USD 1,9, una CVR de ~7,7 % y un CPL de ~USD 28 (todas industrias). En B2B/SaaS el CPL es mucho mayor (USD 80–380). Para Colombia solo hay datos de **un proveedor (Superads)**: CPM promedio de ~USD 3,2 (alrededor del 15 % del global) y CPC de USD 0,16–0,20 en varias industrias. **No hay dato confiable de CPL ni de CVR B2B para Colombia ni LATAM.**

### Cited Findings
- [Práctica, confianza media] **WordStream/LocaliQ 2025.** Campañas de EE. UU., abr 2024–jun 2025, más de 1.000 campañas, medianas por métrica, publicado el 8 sep 2025:
  - Leads: CTR 2,59 %, CPC USD 1,92, CVR 7,72 %, CPL USD 27,66 (+21 % interanual).
  - Tráfico: CTR 1,71 %, CPC USD 0,70.
  - Finance & Insurance tiene el CPC de tráfico más alto (USD 1,22).
  - No hay categoría "Business Services" en el resumen.
  - Fuente: [PPC Land, 9 sep 2025](https://ppc.land/facebook-ad-costs-jump-21-as-lead-campaigns-struggle-while-traffic-ads-thrive/). El original ([WordStream](https://www.wordstream.com/blog/facebook-ads-benchmarks-2025)) devolvió 403.
- [Práctica, confianza baja-media] **GrowthSpree** (agencia B2B SaaS), 22 may 2026, sin metodología pública:
  - CPM B2B SaaS de USD 12–18 (mediana).
  - CTR: imagen 0,9–1,4 %, video 1,3–2,1 %, Reels 2,1–3,4 %, Lead Ads 1,4–2,2 %.
  - CPC de USD 1,4–4,2 según formato.
  - CPL: Lead Ads USD 80–220, landing USD 120–380, reserva directa en calendario USD 180–420.
  - Costo por SQL de USD 400–1.200 para ACV de USD 5–30k.
  - Fuente: [GrowthSpree](https://www.growthspreeofficial.com/blogs/meta-ads-benchmarks-2026-b2b-saas-b2b-cpm-cpc-cpl-vertical)
- [Práctica, confianza baja] **Superads** (más de USD 3B de gasto en miles de cuentas, medianas; la página no aclara si el periodo es jul 2025–jul 2026 o nov 2025–oct 2026). Fuente: [Superads Colombia CPM](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/colombia); [Superads CPC global](https://www.superads.ai/facebook-ads-costs/cpc-cost-per-click/software-and-it-services/colombia).
  - **CPM Colombia, todas las industrias:** media de ~USD 3,20 frente a ~USD 20,58 global, con un mínimo de USD 1,70 (may 2026) y un pico anómalo de USD 13,06 (jul 2026).
  - **CPC global:** media de ~USD 1,05, con un mínimo de USD 0,77 en jul 2026.
  - **CPC global de Consulting:** ~USD 1,49 (42 % sobre la línea base).
  - **CPC en Colombia según snippets de búsqueda de páginas de Superads:**
    - Finance: ~USD 0,20.
    - Fitness: ~USD 0,18.
    - Real Estate: ~USD 0,16.
    - Las páginas de Software/IT y Consulting para Colombia no cargaron el filtro de país, así que **no hay dato de CPC Colombia para software ni consultoría**.
- [Práctica, confianza baja] Agregadores 2026: el CTR de Meta ronda 1,4–2,2 % según la fuente, y el CTR de B2B 0,7–1,1 %. Para SaaS/software se citan un CPC de USD 3,00 y un CTR de 0,60 % (AdRiseLab, vía agregador) — [Flighted](https://www.flighted.co/blog/meta-ads-performance-benchmarks-by-industry); [ContentStudio](https://contentstudio.io/blog/meta-ads-benchmarks); [Webtonic](https://www.webtonic.io/blog/click-through-rate-statistics)
- [Práctica] Stackmatix (2026) tiene una tabla de CPM por país con LATAM, pero el contenido no se pudo extraer — [Stackmatix](https://stackmatix.com/blog/facebook-ads-cpm-by-country-2026)

### Inferences
- Rangos de partida para Colombia en B2B/tecnología, **deducidos y no medidos**. Tasa de referencia de ~4.100 COP por USD, la que implica el contexto (20.000–50.000 COP ≈ USD 5–12). El CPC es una derivación propia (CPM / 1.000 / CTR).

  | Métrica | Rango | En COP | Base |
  |---|---|---|---|
  | CPM | USD 2–5 | ~8.000–20.000 | Superads; B2B probablemente arriba del promedio |
  | CTR | 0,8–1,5 % | — | Benchmarks B2B globales |
  | CPC | USD 0,15–0,60 | — | Derivación propia |

- Para CVR y CPL de Colombia: **sin dato confiable**. Hay que medirlos en las primeras 2–4 semanas y fijar como referencia interna el CPQL de Faro.
- Los benchmarks de EE. UU. de CPL (USD 28 general, USD 80–380 B2B SaaS) no se trasladan a Colombia por la diferencia de CPM de 5–6 veces. Además, el ticket de Mokub (estudio de IA, servicios) se parece más a "servicios profesionales" que a SaaS.

### Gaps
- Sin datos públicos verificables de 2025–2026 de CPL, CVR o CTR para B2B/tecnología/servicios profesionales en Colombia o LATAM. Tampoco se encontraron reportes de Gupta Media, AdAmigo, Swydo, Databox, Varos, Triple Whale ni Revealbot/Bïrch con corte LATAM o Colombia.
- El reporte original de WordStream 2025 no se pudo leer (403), así que faltan las cifras por industria de servicios profesionales.
- Los datos de Superads tienen inconsistencias de periodo y moneda y son de un único proveedor.
