# IA aplicada a la pauta en Meta Ads (2025–2026) y errores frecuentes en cuentas pequeñas

Notas de investigación para el playbook de Mokub/Faro. Fecha de corte: 2 nov 2026. Etiquetas: **[Verificado]** = fuente oficial de Meta o earnings call; **[Práctica]** = practicante, proveedor de software o prensa. Se marca **(ANTIGUO)** lo anterior a nov 2025. Varias páginas (emarketer, jonloomer.com, Help Center de Meta) bloquearon la descarga (403 o cuerpo vacío): esas cifras vienen de resúmenes de búsqueda y se marcan como "no leído en primario".

---

## 1. ¿Qué anunció Meta sobre anuncios generados/automatizados con IA y Advantage+ en 2025–2026?

### Takeaway
Meta va hacia "producto + presupuesto → anuncio completo". El plan lo publicó el WSJ en junio de 2025 y Meta no lo confirmó por escrito con esa fecha. En 2026 llegaron piezas concretas: (a) Advantage+ supera USD 75.000 M de run-rate anual (Q2 2026); (b) conectores oficiales de IA para Ads (servidor MCP + Ads CLI) desde el 29 abr 2026, con lo creado en PAUSADO por defecto y reglas de administrador para limitar a los agentes (16 jul 2026); (c) en Cannes 2026, un sistema creativo de IA de punta a punta con flujo de aprobación creativa. No encontré confirmación de que la automatización total "a finales de 2026" ya esté disponible para todos.

### Cited Findings
- **(ANTIGUO, jun 2025) [Práctica, prensa citando al WSJ]** Meta busca que, para finales de 2026, las marcas puedan crear y segmentar anuncios por completo con IA. La marca aportaría una imagen del producto y un presupuesto, y la IA generaría imagen, video y texto, elegiría la audiencia y personalizaría en tiempo real (p. ej., por geolocalización). Algunas marcas temen perder control y que el resultado no se sienta hecho por humanos. — [Campaign Asia](https://www.campaignasia.com/article/meta-aims-to-fully-automate-ad-creation-with-ai-by-2026/502831); [MediaPost](https://www.mediapost.com/publications/article/406315/); [Quartz](https://qz.com/gateway/meta-fully-automate-ai-advertising-2026-1851783320)
- **[Práctica]** No encontré ninguna fuente de 2026 que confirme si la meta de fin de 2026 se cumplió o cambió: sin dato confiable sobre el estado actual.
- **[Verificado: earnings call Q2 2026, 29 jul 2026, vía resúmenes de prensa]** Las soluciones de punta a punta de Advantage+ superaron USD 75.000 M de run-rate anual. Ingresos publicitarios: USD 59.400 M (+27 %). Las mejoras de ranking de anuncios elevaron un 8,3 % los clics y un 15,7 % las conversiones en Facebook. Meta Business Agent ya opera de forma global en WhatsApp y Messenger y atiende a más de 1 M de negocios por semana. — [MarketBeat, 29 jul 2026](https://www.marketbeat.com/instant-alerts/meta-platforms-q2-earnings-call-highlights-2026-07-29/); [MediaPost](https://www.mediapost.com/publications/article/416925/)
  - Un resumen de un tercero dice que Advantage+ es el 33 % de los ingresos totales: no verificado.
- **[Verificado, Meta for Business, 29 abr 2026, actualizado 16 jul 2026]** "Meta ads AI connectors": un servidor MCP y un Ads CLI que conectan la cuenta con un agente de IA para reportes, gestión de campañas ("crear y editar anuncios, conjuntos y campañas en lenguaje natural"), catálogo y diagnóstico de señales. El MCP no requiere credenciales de desarrollador ni código. En la actualización de julio, los administradores con control total del portafolio pueden fijar reglas del servidor MCP que limitan lo que hacen los agentes, por ejemplo cambiar presupuestos o actualizar catálogos. — [Meta for Business: Meta ads AI connectors](https://www.facebook.com/business/news/meta-ads-ai-connectors)
- **[Práctica, guía técnica que cita la documentación de Meta]** El MCP vive en `https://mcp.facebook.com/ads` y el CLI se instala con `pip install meta-ads-cli` (Python 3.12+).
  - Expone 29 herramientas: 5 de gestión (crear campaña, conjunto y anuncio; actualizar entidad; activar entidad), insights con "anomaly signal", benchmarks, "opportunity score", etc.
  - Usa OAuth de Meta Business con 3 niveles de permiso por cuenta: solo lectura, lectura/escritura y lectura/escritura/financiero.
  - Lo creado por cualquiera de las dos vías queda en estado PAUSED y un humano debe activarlo. Los flags `--no-input`/`--force` no anulan esto.
  - No menciona límites de gasto ni rate limits.
  - Fuente del post oficial de lanzamiento: developers.facebook.com/blog/post/2026/04/29/introducing-ads-cli/. — [mcp.directory, may 2026](https://mcp.directory/blog/meta-ads-cli-mcp)
- **[Práctica]** Otra fuente informa que el 21 jul 2026 Meta abrió el servidor MCP a cualquier desarrollador con una app de Meta. — [Relevant Audience](https://www.relevantaudience.com/meta/meta-ads-mcp-open-to-developers/)
- **[Práctica, Campaign, Cannes Lions jun 2026]** Meta anunció una solución creativa de IA de punta a punta: aprende la identidad y el tono de la marca a partir de anuncios existentes, genera variaciones y las prueba. WPP es el primer socio piloto. En Ads Manager llegan mejor texto dentro de imagen, traducción y un **flujo de aprobación creativa integrado**. — [Campaign](https://campaignlive.com/article/meta-launches-complete-ai-creative-ad-ecosystem/1962693)
- **[Práctica, eMarketer sobre los IAB NewFronts 2026, no leído en primario]**
  - Meta prueba voz en off generada por IA para imágenes y videos existentes. La traducción de voz en off ya cubre el texto superpuesto en imágenes.
  - En la beta, los anunciantes que usaron generación de video con IA en la mayoría de los anuncios de una campaña vieron en promedio +10 % de CTR y +8 % de CVR (cifra de Meta).
  - Solo el 22 % de los consumidores ve con buenos ojos la IA en anuncios. El 60 % busca señales claras de IA en imágenes y videos, y el 30 % pide etiquetas.
  - [eMarketer](https://www.emarketer.com/content/meta-ramps-up-genai-powered-ad-creation-marketers-weigh-consumer-trust)
- **[Práctica, fuente secundaria débil, jun 2026]** Afirma que Advantage+ es la opción por defecto para campañas nuevas, que la segmentación detallada manual se está retirando y que Meta exige divulgar el uso de imágenes o copy generados con IA. No pude verificarlo en una fuente oficial: tratar con cautela. — [Nutech Digital](https://nutechdigital.com/?p=277678)
- **[Práctica]** Meta también lanzó un "Meta AI business assistant" dentro de Ads Manager y Business Support Home, que da recomendaciones de campaña y ayuda a resolver problemas de cuenta. — [Retail Dive](https://www.retaildive.com/news/meta-streamlines-ai-use-brands-new-business-agent-creative-tools/802255)

### Inferences
- Meta mismo diseñó su MCP con dos guardrails: entidades creadas en **PAUSED** y **reglas de administrador** para limitar cambios de presupuesto. Esto valida la política de Faro (bajar gasto = automático; subir = aprobación humana) y conviene replicarla en Faro aunque se use la Marketing API directa.
- Para Mokub (USD 5–12/día), lo más valioso de "Meta IA" es lo creativo (variaciones, video desde imágenes, traducción). La automatización de segmentación ya la hace Advantage+ por defecto.

### Gaps
- No pude leer el post oficial del developer blog ni la nota del newsroom de Cannes 2026. Faltan el texto exacto, la lista de mercados y la disponibilidad en Colombia y en español.
- No hay dato confiable sobre los rate limits del MCP ni sobre si las "MCP server rules" admiten topes numéricos de presupuesto o solo permisos sí/no.
- No hay dato confiable sobre el requisito de divulgación de IA en anuncios en Colombia.

---

## 2. ¿Qué usos de IA tienen evidencia de mejorar resultados y cuáles son hype?

### Takeaway
La evidencia más sólida es para **creatividades generadas o variadas por IA**: experimentos de campo académicos con aumentos de CTR de entre ~17 % y 19 %, que caen si el anuncio "se nota IA" o se etiqueta. La fuente de las cifras de Meta (+10 % CTR / +8 % CVR) es Meta misma. Para agentes que operan la cuenta solos no encontré evidencia controlada, y sí reportes de riesgo (cuentas restringidas).

### Cited Findings
- **[Práctica, cita de un estudio académico; fuente secundaria]** Un estudio de NYU y Emory en Google Display Network encontró que los anuncios totalmente generados con IA tuvieron un CTR un 19 % mayor que los de expertos humanos (de 3,73 % a 4,44 %). Con la etiqueta "generado por IA", el CTR estimado cayó a 2,56 %. No es Meta. — [Dataiads (resumen)](https://www.dataiads.io/en/blog/impact-of-visual-generative-ai-on-advertising-effectiveness-2025)
- **[Práctica, fuente secundaria]** Un estudio de Columbia, Harvard, CMU y TU Munich en Japón, con más de 500 M de impresiones, reportó 0,76 % de CTR para anuncios de IA frente a 0,65 % para los humanos. El engagement bajó cuando el usuario notaba que era IA. Las fuentes dan fechas contradictorias (2025 vs 2026). — [segwise.ai](https://segwise.ai/blog/ai-ad-generators-2026-performance-marketer-guide.md)
- **[Práctica]** Las cifras de "~12 % más de CTR para anuncios de IA en Meta, Google y TikTok" vienen de reportes de proveedores sin metodología clara: tratarlas como hype. — (mismo resumen de búsqueda; sin fuente primaria)
- **[Verificado vía prensa]** Beta de video con IA de Meta: +10 % CTR y +8 % CVR en promedio. — [eMarketer](https://www.emarketer.com/content/meta-ramps-up-genai-powered-ad-creation-marketers-weigh-consumer-trust)
- **[Verificado vía prensa]** Las mejoras de ranking y entrega (la IA de Meta, no la del anunciante) explican +15,7 % de conversiones en Facebook en Q2 2026. — [MarketBeat](https://www.marketbeat.com/instant-alerts/meta-platforms-q2-earnings-call-highlights-2026-07-29/)
- **[Práctica]** Agentes en la cuenta: durante 2025 varios operadores de agencias reportaron restricciones permanentes de cuenta tras conectar Claude o Codex a la Marketing API mediante conectores no oficiales (p. ej., el caso de Cody Schneider). Meta nunca lo confirmó. Un practicante (Francis Teo, vía PPC Land) dijo que los conectores son "worthless" mientras Meta no aclare esto oficialmente. — [mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp)
- **[Práctica]** Coste oculto de los agentes vía MCP: un perfil de 58 herramientas consumió ~55.000 tokens de entrada en una sesión (medición de Ads Uploader). Las escrituras vía MCP son síncronas, con latencia de segundos, así que no sirven para pujas en tiempo real. — [mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp)
- **[Práctica]** Usos con valor claro según los practicantes: reportes y detección de anomalías (Meta incluye la herramienta "anomaly signal" en su MCP), análisis comparativo de creatividades y reglas de stop-loss. Ver sección 3. — [mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp)

### Inferences
- Para Faro, el orden de valor probado es: (1) generar muchas variantes creativas y de copy distintas, que "no parezcan IA genérica" y se revisen antes de publicar; (2) reportes y anomalías explicadas en lenguaje simple; (3) reglas de stop-loss. La operación autónoma de presupuesto y estructura es la parte con menos evidencia y más riesgo.
- Usar la vía oficial (MCP/CLI de Meta o una app propia con revisión de la Marketing API) reduce el riesgo de restricción frente a conectores no oficiales.

### Gaps
- No encontré un estudio controlado y revisado por pares hecho específicamente en Meta Ads con creatividades de IA.
- No encontré datos que comparen agentes de IA autónomos con humanos en gestión de cuentas: sin dato confiable.
- No encontré análisis de etiquetado y tagging creativo con IA (tipo Motion) con datos de impacto. Sin fuente leída.

---

## 3. Ejemplos concretos de reglas automatizadas (condición, umbral, acción, ventana)

### Takeaway
Las reglas de los practicantes combinan **un mínimo de gasto** (para no juzgar con poca data), **una ventana de varios días** y **la comparación contra un punto de equilibrio o contra la propia cuenta o campaña**. Las de pausa o reducción se automatizan. Las de aumento suelen ser pequeñas (~15 %/día) y llevan un piso de rendimiento.

### Cited Findings
**Límites de las reglas nativas de Meta [Práctica, guía que resume el Help Center; actualizada 11 mar 2026]** — [Cropink](https://cropink.com/meta-automated-rules)
- Hasta 250 reglas por cuenta publicitaria, contando activas y pausadas (también lo dice [Netpeak](https://netpeak.us/blog/how-to-set-up-automated-rules-in-meta-ads/)).
- Solo una condición de cada tipo por regla: dos umbrales sobre la misma métrica requieren dos reglas.
- No se pueden mezclar niveles (campaña y conjunto) en una regla.
- No se pueden aplicar a anuncios de temas sociales, elecciones o política.
- Cada condición puede usar un rango de tiempo distinto. Ejemplo: "Current time is between" + umbral de impresiones + ventana de 7 días.
- Las reglas sirven también para programar acciones, como apagar una campaña en un día fijo. — [Madgicx](https://madgicx.com/answers/how-to-schedule-ads-in-meta-ads-manager)

**Bïrch (antes Revealbot) [Práctica, página sin fecha]** — [bir.ch](https://bir.ch/birch-course/advanced-tips-for-automated-rules)

| Regla | Condición | Ventana | Guardrail | Acción |
|---|---|---|---|---|
| Caída del 25 % en tasa de conversión | CVR(hoy+ayer) < 75 % del CVR(hace 2–3 días) | Comparación de períodos personalizados | Gasto > USD 10 en ambos períodos | **Solo notificar**, 1 vez/día; el humano decide |
| Subir presupuesto por ranking | ROAS de compra en el top 25 % de su campaña | Últimos 3 días | ROAS ≥ 1,2 | +15 % de presupuesto, diario |
| Comparar con la campaña | ROAS del conjunto < ROAS promedio de su campaña | — | — | Bajar presupuesto (monto no indicado) |
| Tendencia semanal | ROAS esta semana vs semana pasada | 7 vs 7 días | — | Monitorear o alertar |

**Madgicx [Práctica]** — [Madgicx Academy](https://academy.madgicx.com/lessons/introduction-madgicx-automations); [Madgicx roadmap](https://roadmap.madgicx.com/changelog/11186)
- Stop-loss: pausar el conjunto si gastó USD 500 en los últimos 3 días y su ROAS está entre los 10 peores de la cuenta.
- Stop-loss básico: acción "Pause Ad for Today" con disparador en coste por clic saliente.
- Fatiga: frecuencia > 4 en los últimos 7 días (incluido hoy), con CTR en caída. La acción es **etiquetar el anuncio**, no pausarlo.
- Consejo: Madgicx ofrece 7 plantillas tácticas y 24 estratégicas, pero sus media buyers **no recomiendan activarlas todas**, porque la cuenta queda "sobre-gestionada". Conviene empezar con pocas.

**Otras herramientas [Práctica]**
- TheOptimizer: stop-loss de CPA a 3 días que evalúa cada día por separado (no el promedio móvil) y pausa solo si **los 3 días** superan el umbral. El umbral recomendado es el **CPA de equilibrio**, no el CPA objetivo. — [TheOptimizer](https://theoptimizer.io/docs/automation/rule-templates)
- TikTok (aplica igual a Meta): las reglas se evalúan por intervalos, así que la métrica puede pasarse del umbral antes de que la regla actúe. Recomiendan poner el umbral **por debajo** del valor real. — [TikTok Ads Help](https://ads.tiktok.com/resources/help/article/faqs-for-automated-rules)

### Inferences
Reglas candidatas para Faro con USD 5–12/día, adaptadas de los ejemplos anteriores. Son una propuesta, no datos:
- **Auto (baja gasto):** pausar el anuncio si gasto ≥ 1,5–2× el CPL objetivo y 0 leads en los últimos 3 días.
- **Auto (baja gasto):** pausar o alertar si la frecuencia es > 3–4 en 7 días y el CTR cae más de un 25 % frente a los días 4–7 previos.
- **Auto:** tope diario de gasto a nivel de cuenta, más una alerta si el gasto del día supera en un 20 % lo esperado a esa hora.
- **Requiere aprobación:** subir presupuesto como máximo ~15–20 % y como máximo 1 vez cada 3–7 días, solo si el CPL de los últimos 7 días está por debajo del objetivo y hay al menos un mínimo de conversiones.
- Siempre exigir un mínimo de gasto o de impresiones antes de juzgar. Con USD 5/día, una ventana de 1 día casi nunca tiene datos suficientes.

### Gaps
- No pude leer la página oficial del Help Center sobre automated rules (frecuencia de evaluación, p. ej. "cada 30 min" o "una vez al día"): sin dato confiable verificado.
- No encontré ejemplos con umbrales publicados por Foxwell, CTC o Motion.

---

## 4. Guardrails recomendados para que software o agentes de IA cambien cuentas

### Takeaway
El consenso, empezando por el diseño del propio Meta, es: permisos mínimos, creación en PAUSED con activación humana, reglas que limitan cambios de presupuesto, ediciones agrupadas y espaciadas (≤ 1 por 24 h en presupuesto o audiencia) para no reiniciar el aprendizaje, y alertas antes que acciones en las reglas de "subir".

### Cited Findings
- **[Verificado]** Los administradores del portafolio pueden fijar reglas del servidor MCP para limitar lo que hacen los agentes (p. ej., cambiar presupuestos o actualizar catálogos). Actualización del 16 jul 2026. — [Meta for Business](https://www.facebook.com/business/news/meta-ads-ai-connectors)
- **[Práctica, describe la documentación de Meta]** Permisos por niveles (lectura / escritura / financiero); se recomienda elegir el más estrecho. Las entidades creadas quedan en PAUSED y un humano las activa. — [mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp)
- **[Práctica]** Un Client Partner de Meta (Brody K., vía PPC Land) aconseja recordarle al agente la fase de aprendizaje. La fuente sugiere un system prompt que limite las ediciones de presupuesto o audiencia a **1 cada 24 h**. Es un consejo, no una regla de Meta. — [mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp)
- **[Práctica]** La fase de aprendizaje requiere ~50 eventos de optimización por conjunto en 7 días. Se reinicia con ediciones significativas: cambio de presupuesto mayor a ~20 % de una vez, cambio del evento de optimización, de segmentación, de creatividades o de estrategia de puja. Agregar anuncios puede reiniciarla parcial o totalmente. Las fuentes discrepan en el porcentaje exacto y en si la ventana es fija o móvil. — [AdManage](https://admanage.ai/blog/facebook-ads-learning-phase-guide); [GoMarble](https://www.gomarble.ai/blog/meta-ads-learning-phase-understanding)
- **[Práctica]** Que un conjunto quede en "Learning Limited" suele indicar un presupuesto muy bajo, una audiencia muy estrecha o un tracking que no reporta todas las conversiones. — [AdManage](https://admanage.ai/blog/facebook-ads-learning-phase-guide)
- **[Práctica]** Bïrch: las reglas de "caída" solo **notifican**, y el humano pausa o ajusta. Las de aumento llevan un piso de ROAS (≥ 1,2). — [bir.ch](https://bir.ch/birch-course/advanced-tips-for-automated-rules)
- **[Práctica]** Madgicx: no activar todas las automatizaciones a la vez ("over-managed"). — [Madgicx Academy](https://academy.madgicx.com/lessons/introduction-madgicx-automations)
- **[Práctica]** Riesgo de bloqueo: los conectores no oficiales se asociaron (sin confirmación de Meta) a restricciones permanentes de cuenta en 2025. — [mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp)
- **[Práctica]** Riesgo de cumplimiento: si Meta exige divulgar la IA en anuncios (no verificado), una creatividad publicada sin revisión puede violar políticas. — [Nutech Digital](https://nutechdigital.com/?p=277678)

### Inferences (diseño propuesto para el copiloto de Faro)
- **Lista blanca de acciones automáticas:** pausar un anuncio o conjunto, bajar presupuesto, apagar en un horario y enviar alertas.
- **Acciones con aprobación humana:** subir presupuesto, activar entidades nuevas (Meta ya las crea en PAUSED), cambiar el evento de optimización u objetivo, publicar creatividades o copy nuevos (revisión de marca y políticas) y cualquier acción con permiso financiero.
- **Topes duros (hard caps):**
  - Límite de gasto de la cuenta (account spending limit), configurado por un humano.
  - Presupuesto diario máximo por campaña, p. ej. USD 12.
  - Tope de aumento del 20 % por propuesta.
  - Como máximo 1 cambio de presupuesto o audiencia cada 24 h por conjunto (≥ 72 h para juzgar).
- **Registro de auditoría:** cada acción guarda quién o qué la hizo (agente o humano), el valor antes y después, la métrica y la ventana que la justificaron, el ID de la propuesta y su aprobación, y un botón de "revertir".
- **Riesgo de optimizar la métrica equivocada:** el agente debe optimizar por el CPL o el coste por lead calificado (dato del CRM o de WhatsApp), no por el CTR ni el CPC.
- **Kill switch:** un botón que pausa todo, más la regla de que un agente nunca reactiva lo que pausó un humano.

### Gaps
- No encontré documentación de Meta que especifique la sintaxis o la granularidad de las "MCP server rules" (por ejemplo, si permiten un tope numérico de presupuesto).
- No encontré casos documentados y con fuente de sobregasto por IA en Meta en 2026 (sin dato confiable).

---

## 5. Errores frecuentes en cuentas pequeñas (< USD 20/día) y cómo evitarlos

### Takeaway
Con USD 5–12/día es imposible juntar ~50 conversiones por semana por conjunto, así que los errores típicos son estructurales: dividir el presupuesto, editar y juzgar demasiado pronto, y optimizar para la métrica barata equivocada. La solución es consolidar (1 campaña, 1 conjunto amplio, 3–5 anuncios distintos), elegir un evento de optimización alcanzable y medir el lead real.

### Cited Findings
- **[Práctica, 2026]** Repartir de más: tener diez campañas pequeñas con un presupuesto que apenas sostendría dos es de los errores estructurales más comunes, porque cada conjunto queda sin eventos suficientes para optimizar. — resultados de búsqueda de [segwise.ai (2026)](https://segwise.ai/blog/how-to-manage-meta-ads-guide) / [AdAdvisor (2026)](https://adadvisor.ai/blog/how-to-run-facebook-ads-on-a-tight-budget-in-2026). La atribución exacta entre ambas no está verificada.
- **[Práctica, 2026]** Ajustar la campaña a los 3 días es de las formas más rápidas de desperdiciar un presupuesto pequeño, porque cada cambio reinicia el aprendizaje. — [AdAdvisor](https://adadvisor.ai/blog/how-to-run-facebook-ads-on-a-tight-budget-in-2026)
- **[Práctica, proveedor]** El mínimo diario de Meta es USD 1, pero un proveedor afirma que probar en serio requiere USD 30–50/día. Es una referencia de vendedor, no un dato oficial. — [Extuitive](https://extuitive.com/articles/meta-ads-minimum-budget-for-testing)
- **[Práctica]** Aprendizaje: ~50 eventos en 7 días y reinicio con cambios de presupuesto mayores a ~20 %, segmentación o creatividades. "Learning Limited" se debe a presupuesto bajo, audiencia estrecha o tracking deficiente. — [AdManage](https://admanage.ai/blog/facebook-ads-learning-phase-guide)
- **[Práctica, Jon Loomer, 26 may 2026]** El post "7 Common Meta Ads Mistakes Agencies Make" existe pero no se pudo leer (403). En su Pubcast, Loomer sostiene que el reparto desigual del presupuesto entre anuncios no es un problema y que la solución casi siempre es crear anuncios nuevos y realmente distintos, no microgestionar. — [Jon Loomer (archivo)](https://www.jonloomer.com/tag/meta-advertising-general/page/2/)
- **[Práctica]** El tracking deficiente (conversiones sub-reportadas) es una causa frecuente de "Learning Limited" y lleva a juzgar mal. — [AdManage](https://admanage.ai/blog/facebook-ads-learning-phase-guide)
- **(ANTIGUO, HBR 2011) [Práctica / académico]** Velocidad de seguimiento: las empresas que contactaban al lead en la primera hora tenían ~7 veces más probabilidad de calificarlo que las que tardaban más (Oldroyd et al.). — [HBR, "The Short Life of Online Sales Leads", mar 2011](https://hbr.org/2011/03/the-short-life-of-online-sales-leads)

### Inferences (guía para Mokub, no son datos)
- **Demasiados conjuntos o campañas:** usar 1 campaña y 1 conjunto amplio (Advantage+), con 3–5 creatividades distintas.
- **Editar a diario:** como máximo 1 cambio cada 3–7 días y agrupar las ediciones.
- **Juzgar antes de tiempo:** decidir solo con un mínimo de gasto, p. ej. ≥ 2–3× el CPL objetivo, o con 7 días de datos.
- **Optimizar por clics o tráfico baratos:** con USD 5–12/día, optimizar para "leads" o "conversaciones de WhatsApp/Messenger" en vez de "compras". Es un evento alcanzable que sigue siendo un resultado de negocio.
- **"Promocionar publicación" (boost):** da menos control de objetivo y ubicaciones. Es mejor crear la campaña en Ads Manager o vía API con el objetivo correcto. No encontré fuente 2025–26 leída que lo respalde.
- **Sin tracking:** configurar Pixel y Conversions API, o un evento de conversación de WhatsApp, antes de gastar.
- **Mala landing:** debe tener una sola llamada a la acción, cargar rápido en móvil y mantener la promesa del anuncio. No hay fuente leída.
- **Respuesta lenta al lead:** Faro/Dapta debería responder por WhatsApp en minutos.

### Gaps
- No encontré fuentes de 2025–26 leídas en primario sobre boosting, landing pages ni objetivo equivocado en cuentas pequeñas. Las inferencias anteriores sobre esos puntos son buenas prácticas sin cita verificada.
- Las páginas de AdEspresso, Social Media Examiner, Foxwell, CTC y Motion no se consultaron por el límite de búsquedas.
- Sin dato confiable sobre el CPL típico de servicios B2B o de IA en Colombia.
