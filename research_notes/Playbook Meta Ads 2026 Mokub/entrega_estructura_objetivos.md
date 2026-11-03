# Meta Ads 2026: sistema de entrega, estructura de cuenta y objetivos para lead gen B2B con presupuesto bajo (Mokub)

> Fecha de corte: 2 nov 2026. Etiquetas: **[Verificado]** = documento o anuncio oficial de Meta (o cita directa de Meta reportada por prensa especializada; se indica cuando es de segunda mano). **[Práctica]** = consenso de practicantes/agencias. Si no hay fuente fiable: "sin dato confiable".
> Limitación metodológica: las páginas del Meta Business Help Center (facebook.com/business/help/...) no se pudieron leer completas con las herramientas disponibles (renderizan solo el título). Las reglas de learning phase citadas abajo provienen de los fragmentos indexados de esas páginas en el buscador, no del texto completo. Conviene que alguien las abra en un navegador y confirme la redacción.

## 1. Sistema de entrega actual: Andromeda, GEM, Lattice y Advantage+ (qué cambió en 2025–2026)

### Takeaway
Andromeda es la etapa de *retrieval* (preselección) del pipeline de anuncios de Meta: decide qué anuncios llegan siquiera a la subasta, usando sobre todo señales del propio creativo. GEM (ranking) y Lattice (consolidación de modelos) actúan después. Consecuencia práctica, confirmada por Meta desde 2025: la palanca principal pasó de la segmentación fina a la diversidad creativa, con estructura simple y Advantage+ (audiencia, ubicaciones, presupuesto de campaña) activado por defecto.

### Cited Findings

**Andromeda: qué es y fechas**
- [Verificado] 2 dic 2024: Meta presenta Andromeda en Engineering at Meta como motor de *retrieval* de anuncios personalizado, co-diseñado en hardware, software y ML (NVIDIA Grace Hopper), que reduce decenas de millones de anuncios candidatos a unos pocos miles. — [Engineering at Meta, 2 dic 2024](https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/)
- [Verificado, citado por Jon Loomer] Blog de Meta de marzo 2025: Andromeda ("introduced in 2024") permite modelos de retrieval 10.000x más complejos y reporta +8% en calidad de anuncios; lo vincula a que los anunciantes suben más variedad creativa. — [Jon Loomer, 19 ago 2025, act. 15 dic 2025](https://www.jonloomer.com/meta-andromeda/)
- [Verificado, citado por Jon Loomer] Blog de Meta de abril 2025: el foco se movió "from niche targeting to creative diversification as the best lever". — [Jon Loomer, 19 ago 2025](https://www.jonloomer.com/meta-andromeda/)
- [Verificado, de segunda mano] Llamada de resultados Q2 2025 (Susan Li, CFO): mejoras de Andromeda dieron ~4% más conversiones en Feed y Reels móvil de Facebook; mejoras de GEM ~5% en Instagram y ~3% en Facebook Feed/Reels. No pude confirmarlo contra la transcripción original. — [Mobile Dev Memo, Q2 2025](https://mobiledevmemo.com/meta-q2-2025-earnings-2mm-advertisers-using-genai-creative-ai-infrastructure-improvements/)
- [Verificado, de segunda mano] Q3 2025: Lattice desplegado en anuncios de apps, casi +3% de conversiones; Meta citó un +14% de "ads quality" atribuido a Andromeda en Q3 2025. — [AdExchanger, nov 2025](https://www.adexchanger.com/platforms/metas-q3-was-a-net-win-disguised-as-a-loss); [PPC Land, oct/nov 2026](https://ppc.land/meta-says-andromeda-lifted-facebook-conversions-2-4-since-2025/)
- [Verificado, de segunda mano] 2023: Lattice consolidó ~100 modelos de ranking/recomendación. 13 oct 2026: post de GEM con +18,9% de conversiones. 21 oct 2026 (Q3 2026): Meta atribuye +1,4% de conversiones en Facebook a mejoras de Andromeda. 28 oct 2026: post técnico de "segunda generación" de Andromeda: puntúa *todos* los anuncios elegibles a >1.000 millones de anuncios/segundo por servidor GPU (~100x vs 2024), arquitectura mixture-of-experts, y "has delivered a 2.4% increase in conversions on Facebook" desde 2025. Julio 2026: Meta dijo a inversores que desplegó su primer modelo generativo en retrieval. — [PPC Land, publicado tras el 28 oct 2026](https://ppc.land/meta-says-andromeda-lifted-facebook-conversions-2-4-since-2025/). Advertencia de PPC Land: el 2,4% no tiene línea base ni método publicados; no existe ningún ajuste ni reporte de Andromeda en Ads Manager.
- [Verificado, de segunda mano] En el post de oct 2026 Meta afirma que rediseñó el matching de reglas de segmentación para GPU "preserving the full fidelity" de la segmentación; un anuncio que el retrieval no preselecciona nunca entra a la subasta. — [PPC Land](https://ppc.land/meta-says-andromeda-lifted-facebook-conversions-2-4-since-2025/)

**Implicaciones para creativo y segmentación**
- [Práctica] La diversidad útil es de concepto/ángulo (problema-solución, testimonio, demo), formato (video corto/largo, estático, carrusel) y persona; ajustes menores de copy o color no cuentan como diversidad. La segmentación "se mueve al anuncio": ad sets amplios y que el creativo hable al cliente deseado. — [Jon Loomer, ago 2025](https://www.jonloomer.com/meta-andromeda/)
- [Práctica] Meta dejó de recomendar el tope de "no más de 6 anuncios por ad set" (Loomer lo ubica en febrero, probablemente 2025, y cree que se relaciona con Andromeda, aunque Meta no lo dijo). Loomer recomienda como mínimo más de 2–3 anuncios por ad set. — [Jon Loomer](https://www.jonloomer.com/meta-andromeda/). Contraste: en su guía de Advantage+ (jun 2025) Loomer dice que Meta sigue *desaconsejando* más de 6 por ad set en Advantage+ Sales (límite duro: 50). — [Jon Loomer, 23 jun 2025](https://www.jonloomer.com/advantage-plus-campaign/). Las dos afirmaciones del mismo autor no encajan del todo; el número óptimo no está fijado oficialmente.
- [Práctica] Andromeda no garantiza resultados: si el rendimiento es malo, la causa suele ser el creativo o la oferta. — [Jon Loomer](https://www.jonloomer.com/meta-andromeda/)

**Advantage+ campaign setup (el que reemplazó la elección manual vs ASC)**
- [Verificado, de segunda mano] Feb 2025: Meta prueba un setup simplificado que elimina la elección inicial entre campaña automatizada y manual; Advantage+ pasa a ser la opción por defecto para objetivos Ventas, App y Clientes potenciales (Leads). Meta anunció Advantage+ leads campaigns y reportó en pruebas iniciales ~10% menos costo por lead calificado con Advantage+ activado (dato de Meta, no independiente). — [Social Media Today, feb 2025](https://www.socialmediatoday.com/news/meta-advantage-plus-ad-updates-february-2025/739472/); [Search Engine Land](https://searchengineland.com/meta-advantage-campaign-setup-leads-campaigns-451713) (403 al abrir; resumen vía buscador)
- [Verificado] 29 may 2025: Meta extiende el setup simplificado de Advantage+ para Ventas y App (blog de desarrolladores, 3 jun 2025). — [Meta for Developers, 3 jun 2025](https://developers.facebook.com/blog/post/2025/06/03/advantage-plus-campaign-experience-for-sales-and-app/). Fecha exacta de despliegue para Leads: sin dato confiable.
- [Verificado] Documentación de Marketing API: `OUTCOME_LEADS` crea campañas Advantage+ leads (estado `ADVANTAGE_PLUS_LEADS`). El estado Advantage+ depende de tres palancas: (1) ubicaciones Advantage+ (sin exclusiones a nivel campaña; sí a nivel cuenta), (2) presupuesto a nivel campaña, (3) audiencia Advantage+ (o solo geo, o segmentación "relajada"). Si alguna palanca está `DISABLED`, la campaña deja de ser Advantage+. API v24.0: ya no se crean ASC; v25.0: falla la creación de ASC/AAC en todas las versiones; v26.0: campañas ASC/AAC legacy bloqueadas para edición. — [Meta for Developers, Advantage+ Campaign Experience](https://developers.facebook.com/docs/marketing-api/advantage-campaigns) (sin fecha de página; consultado nov 2026)
- [Práctica] Detalle de controles en el setup unificado: presupuesto de campaña Advantage+ activado por defecto (al usarlo, cost cap/bid strategy y programación pasan a nivel campaña); "audience controls" (ubicaciones, edad mínima, exclusión de custom audiences, idiomas) son restricciones duras; "suggestions" (custom audiences, lookalikes, edad, género, intereses) son solo pistas que la IA puede ampliar. Cambiar a presupuesto por ad set con un solo ad set NO desactiva Advantage+; con varios ad sets sí. La mayoría de personalizaciones de ubicaciones lo desactivan. "Turning Advantage+ off should be the exception, not the rule." ASC fue discontinuado (no solo renombrado a Advantage+ Sales). — [Jon Loomer, 23 jun 2025](https://www.jonloomer.com/advantage-plus-campaign/)
- [Práctica] Específico de Leads: la IA puede encontrar leads baratos de 65+ años de baja calidad (si pasa, poner edad máxima como control en vez de sugerencia); si se usa objetivo Leads con meta Link Clicks o Landing Page Views, quitar Audience Network. — [Jon Loomer, jun 2025](https://www.jonloomer.com/advantage-plus-campaign/)
- [Verificado] La página de Performance Marketing de Meta recomienda combinar ad sets y minimizar cambios durante el aprendizaje para que la IA aprenda rápido. — [Meta, Performance Marketing](https://www.facebook.com/business/ads/performance-marketing) (fragmento indexado)

**Cambios 2026**
- [Verificado, de segunda mano] Lo único confirmado con fecha en 2026 son los posts técnicos (GEM 13 oct; Andromeda v2 28 oct) y las cifras de las llamadas de resultados; ninguno introduce un control nuevo para anunciantes. — [PPC Land](https://ppc.land/meta-says-andromeda-lifted-facebook-conversions-2-4-since-2025/)
- Afirmaciones NO verificadas: (a) "en febrero 2026 Meta fusionó los flujos manual y Advantage+ en una sola interfaz" — solo lo dice [1ClickReport](https://www.1clickreport.com/blog/meta-advantage-plus-campaign-setup-2026); (b) umbrales de conversiones rebajados (Shopping 50→25/semana, App 35→15), "Advantage+ Leads" como producto aparte, "Predictive Budget Allocation" — solo en [Benly, ene/mar 2026](https://benly.ai/learn/meta-ads/advantage-plus-updates-2026), blog de proveedor sin fuentes ni fechas, que además sigue hablando de "Advantage+ Shopping" cuando la API ya bloqueó ASC. Tratar como sin dato confiable.

### Inferences
- Para Mokub, en la práctica: dejar automatizado audiencia (Advantage+ con controles mínimos: país/países, edad mínima ~24–25, idioma), ubicaciones Advantage+, y mejoras creativas *revisadas* una por una (sin dato confiable sobre qué mejoras convienen en B2B; revisar que no deformen el mensaje). Controlar manualmente: oferta, creativos (la verdadera "segmentación"), evento de optimización, geografía, exclusiones de clientes/leads existentes y, si aparecen leads basura, Audience Network.
- Como el retrieval puntúa anuncios por sus señales, 3–6 creativos conceptualmente distintos (no variaciones) dentro del mismo ad set es más útil que varios ad sets con intereses distintos.

### Gaps
- Texto oficial del blog de Meta de marzo/abril 2025 sobre Andromeda: solo visto a través de Loomer.
- URL exacta del post de Engineering at Meta del 28 oct 2026 y del post de GEM del 13 oct 2026: no obtenidas.
- Cambios oficiales a Advantage+ en 2026 (UI, controles nuevos, eliminación de opciones de detailed targeting): sin dato confiable.
- Recomendación oficial de Meta sobre mejoras creativas (creative enhancements) por defecto en 2026: sin dato confiable.

## 2. Estructura de cuenta para USD 5–12/día por campaña y fase de aprendizaje

### Takeaway
Con USD 5–12/día, la estructura defendible es 1 campaña → 1 ad set amplio → 3–6 anuncios conceptualmente distintos, con presupuesto de campaña Advantage+ (que con un solo ad set equivale al presupuesto por ad set). El umbral de ~50 eventos de optimización por semana por ad set es oficial; a este presupuesto solo se alcanza con eventos muy baratos, así que "aprendizaje limitado" es casi seguro si se optimiza por lead. Meta dice que eso no es una penalización.

### Cited Findings

**Learning phase (reglas oficiales; fragmentos indexados)**
- [Verificado] Un ad set sale del aprendizaje tras ~50 eventos de optimización desde el último cambio significativo; Meta sugiere esperar a ~50 eventos antes de fiarse del costo por evento (p. ej. para fijar cost cap). — [Meta Business Help, "Last Significant Edit"](https://www.facebook.com/business/help/942374239243867); [Meta Business Help, "About the learning phase"](https://www.facebook.com/business/help/112167992830700/)
- [Verificado] Cambio significativo: pausar el ad set, o cambiar evento de optimización, audiencia o creativo; cambios de estrategia de puja y de presupuesto "pueden" contar según su tamaño. — [Meta Business Help, "Last Significant Edit"](https://www.facebook.com/business/help/942374239243867) (fragmento indexado). Umbral exacto de presupuesto: Meta no da un porcentaje en el fragmento visible; practicantes citan ~20% por ajuste ([JetFuel, 2026](https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/); [GoMarble](https://www.gomarble.ai/blog/meta-ads-learning-phase-understanding)), otros lo listan sin umbral. Conflicto no resuelto → tratar el 20% como [Práctica].
- [Verificado] Editar detalles de campaña, ad set o anuncio puede reiniciar el aprendizaje o provocar re-revisión del anuncio. — [Meta Business Help, "Edit your ad"](https://www.facebook.com/business/help/2169779963333459)
- [Verificado] "Learning limited": el ad set es improbable que llegue a ~50 eventos en la semana posterior al último cambio significativo. "Learning limited isn't a penalty"; indica que el presupuesto no se gasta con eficiencia porque el sistema no puede optimizar con la configuración actual. — [Meta Business Help Centre, "About learning limited"](https://en-gb.facebook.com/business/help/269269737396981)
- [Práctica] Soluciones que Meta y practicantes suelen listar para learning limited: combinar ad sets/campañas, ampliar audiencia, subir presupuesto, optimizar por un evento más frecuente (más arriba en el embudo), y no tocar el ad set. — [Cometly](https://www.cometly.com/post/how-to-improve-facebook-ads-learning-phase); [Stackmatix](https://www.stackmatix.com/blog/ad-learning-phase-small-budgets) ("el evento de optimización es la palanca más importante con presupuesto chico"). La lista oficial completa no se pudo leer (gap).
- [Práctica] Si el CPA combinado está en objetivo, no matar un ad set solo por la etiqueta "learning limited". — [JetFuel, 2026](https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/)

**Estructura y consolidación**
- [Verificado] Meta recomienda combinar ad sets y minimizar cambios. — [Meta Performance Marketing](https://www.facebook.com/business/ads/performance-marketing)
- [Práctica] Una campaña por objetivo, apoyarse en defaults de Advantage+, rara vez varios ad sets para segmentar. — [Jon Loomer, ago 2025](https://www.jonloomer.com/meta-andromeda/)
- [Práctica] Consenso 2026: consolidación, 1–3 ad sets por campaña con segmentación amplia; con presupuesto chico, presupuesto de campaña. Algunas cuentas B2B/lead gen reportan mejor resultado con estructuras manuales (opinión minoritaria). — resumen de [Madgicx](https://madgicx.com/answers/which-media-buying-strategies-work-on-meta), [GrowthSpree, B2B SaaS 2026](https://www.growthspreeofficial.com/blogs/meta-ads-campaign-structure-b2b-saas-2026), [Segwise 2026](https://segwise.ai/blog/how-to-manage-meta-ads-guide)
- [Práctica] Con presupuesto de campaña Advantage+ y un solo ad set, el comportamiento es igual al de presupuesto por ad set. — [Jon Loomer, jun 2025](https://www.jonloomer.com/advantage-plus-campaign/)

**Presupuesto mínimo vs costo por resultado**
- [Práctica] Fórmula usada: presupuesto diario mínimo ≈ (CPA objetivo × 50) ÷ 7. — atribuida a Revealbot, vía [resultados de búsqueda de Aimerce/Podvector](https://www.aimerce.ai/blogs/is-10-a-day-enough-to-get-purchases-on-meta-ads)
- Mínimos técnicos de Meta: se repite USD 1/día (impresiones) y USD 5/día (clics/conversiones), atribuido al Help Center, pero solo lo encontré en fuentes de terceros que se contradicen ([PodVector](https://podvector.ai/articles/ads/scaling-and-diagnosis/meta-ads-minimum-daily-budget-official) vs [TryVizup 2026](https://www.tryvizup.com/blog/meta-ads-minimum-budget-requirements-2026)). En Colombia los mínimos se fijan en COP y varían. → sin dato confiable.

### Inferences
- Aritmética para Mokub (USD 5–12/día ≈ USD 35–84/semana; tasa COP/USD a nov 2026 no verificada): salir del aprendizaje exige costo por evento ≤ USD 0,70–1,70. Eso es realista para *landing page views* o *link clicks*, quizá para conversaciones de mensajería en LATAM, y casi imposible para leads web de un servicio B2B de USD 3.000+ (CPL de referencia en LATAM B2B: sin dato confiable).
- Recomendación de estructura: 1 campaña por mercado/idioma prioritario (empezar con Colombia), 1 ad set amplio, 3–6 anuncios de ángulos distintos (dolor, demo del agente de WhatsApp, caso/testimonio, oferta del diagnóstico, founder hablando a cámara). No separar por intereses ni por país dentro de USD 5–12/día. Separar países solo cuando cada uno tenga su propio presupuesto viable.
- Ritmo de cambios: añadir creativos nuevos en bloque (p. ej. cada 1–2 semanas) en vez de goteo diario; subir presupuesto en pasos ≤20% (regla de practicantes) y evaluar por semana, no por día.
- Aceptar "learning limited" si el costo por llamada calificada es aceptable; el criterio de negocio es costo por diagnóstico/llamada, no la etiqueta.

### Gaps
- Texto completo oficial de las recomendaciones de "learning limited" y de los umbrales de presupuesto que cuentan como cambio significativo.
- Si en 2026 Meta cambió el umbral de 50 eventos para Leads (rumor de rebaja solo para Shopping/App, sin fuente fiable).
- Mínimos de presupuesto oficiales en COP por evento de optimización.

## 3. Objetivos y metas de optimización para lead gen B2B de servicios high-ticket (LATAM)

### Takeaway
Para Mokub a USD 5–12/día, la elección realista es empezar optimizando un evento frecuente (landing page views o conversaciones de WhatsApp) y medir la calidad aguas abajo; pasar a optimizar leads/eventos de conversión del sitio solo cuando el volumen semanal lo permita, y a "conversion leads" (señal de CRM vía Conversions API) cuando haya cientos de leads/mes. Los formularios instantáneos dan volumen barato pero de baja calidad salvo que se configuren para mayor intención y se devuelva la calidad a Meta.

### Cited Findings

**Tráfico (link clicks vs landing page views)**
- [Práctica] Si se usa el objetivo Leads con meta Link Clicks o Landing Page Views, quitar Audience Network (tráfico de baja calidad). — [Jon Loomer, jun 2025](https://www.jonloomer.com/advantage-plus-campaign/)
- Diferencia LPV vs link click (LPV exige que cargue la página con el píxel): definición estándar de Meta; no obtuve la página oficial en esta sesión → sin cita verificada.

**Leads: formularios instantáneos, website, conversion leads**
- [Verificado, de segunda mano] La meta "Conversion leads" (optimizar por leads que avanzan en el CRM) requiere enviar estados del CRM a Meta vía Conversions API for CRM; la documentación de Meta la señala compatible con Lead Ads (formularios instantáneos). Sin integración, se optimiza solo por volumen. — [Meta for Developers, Conversion Leads Integration](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration); [Click Here Digital](https://www.clickheredigital.com/insights/meta-shift-to-lead-optimization)
- [Verificado, cifras de Meta] Conversion leads: −15% costo por lead de calidad y +44% conversiones de calidad (cifra inicial de Meta); pruebas A/B posteriores: −21% costo por lead de calidad en formularios instantáneos y −9,5% en formularios web vs la meta estándar "Leads". — [Meta Business News, Instant Forms](https://projecter.workplace.com/business/news/create-more-valuable-leads-than-ever-with-metas-instant-forms) (espejo); [Make, Meta CAPI for CRM](https://www.make.com/en/blog/meta-make-conversions-api-for-crm); [Zapier, guía de Meta](https://zapier.com/de/blog/meta-guide-to-better-lead-quality/). Fechas exactas de los estudios: sin dato confiable (probablemente 2023–2025; posiblemente desactualizado).
- [Verificado, de segunda mano] Herramientas de calidad en formularios instantáneos: verificación de teléfono por SMS, exigir email de trabajo, lógica condicional en preguntas (y formularios de "mayor intención" con pantalla de revisión). — [Zapier](https://zapier.com/de/blog/meta-guide-to-better-lead-quality/); [Meta Business News](https://projecter.workplace.com/business/news/create-more-valuable-leads-than-ever-with-metas-instant-forms)
- [Práctica] Guía de Datahash: ~250 leads/mes como mínimo para que conversion leads aprenda; capturar el Lead ID de Meta en cada lead para casar estados. — [Datahash, Meta CAPI for CRM](https://support.datahash.com/portal/en/kb/articles/meta-capi-for-crm)
- [Práctica] Con formularios instantáneos el volumen es una mala señal; optimizar por calidad. — [EasyInsights, 2026](https://easyinsights.ai/blog/lead-gen-shifts-profitable-meta-ads-2026/)

**Mensajería / WhatsApp (click-to-WhatsApp)**
- [Verificado, cifras de Meta/WhatsApp] Optimizar anuncios click-to-WhatsApp por "leads" en vez de por conversaciones: caso Nutryfit −12% costo por lead; promedio −24% costo por lead (cifras de Meta). Ruta descrita por WhatsApp Business: objetivo Engagement → Messaging apps → WhatsApp → meta de rendimiento "Leads". — [WhatsApp Business, lead generation SMB](https://whatsappbusiness.com/resources/resource-library/lead-generation-strategies-smb-whatsapp/)
- [Práctica, en conflicto] Una agencia afirma que con objetivo `OUTCOME_LEADS` en WhatsApp la única meta es CONVERSATIONS, y que para optimizar por eventos posteriores hay que ir a Sales con eventos CAPI; y que optimizar por inicio de chat atrae "gente que conversa, no compradores". Contradice parcialmente la ruta de WhatsApp Business. Verificar en Ads Manager. — [CustomerLabs](https://www.customerlabs.com/blog/why-meta-algorithm-chases-chatters-not-buyers-for-ctwa-ads)
- [Práctica] Guías 2026: en Leads con WhatsApp, la meta por defecto es "Maximizar número de conversaciones"; medir éxito por leads calificados o agendas, no por chats iniciados; tratar el chat como paso de calificación. — [ChatMaxima, 2026](https://chatmaxima.com/blog/2026-click-to-whatsapp-ads-playbook/); [Enrich Labs, 2026](https://www.enrichlabs.ai/blog/whatsapp-advertising-complete-guide-2026)

**Engagement-to-messaging, Sales/conversiones, llamadas**
- Engagement → conversaciones: sin datos fiables específicos de B2B en esta investigación más allá de lo de WhatsApp.
- Sales con evento de conversión personalizado (p. ej. "llamada agendada" o "lead calificado" enviado por CAPI): práctica mencionada por CustomerLabs; no encontré guía oficial de Meta para servicios B2B. Sin dato confiable sobre volúmenes mínimos.
- Anuncios de llamada (calls): no cubierto; sin dato confiable.

**Benchmarks**
- CPL B2B de USD 40–650+ según industria/canal (multicanal, EE. UU., no Meta-LATAM). — [Prospeo 2026](https://prospeo.io/s/lead-generation-services-cost). CPL de Meta para B2B en Colombia/LATAM: sin dato confiable.

### Inferences
Escalera propuesta para Mokub (inferencia, combina las fuentes anteriores con la aritmética de la sección 2):
1. **Fase 0 (sin datos, 20–50 mil COP/día):** dos opciones viables con aprendizaje real:
   - (a) Leads o Tráfico → meta *Landing page views* hacia la página de diagnóstico, sin Audience Network; el píxel + CAPI registran `Lead` (envío del diagnóstico) y `Contact` (clic a WhatsApp) para acumular datos.
   - (b) Click-to-WhatsApp → meta *conversaciones* (o "Leads" en mensajería si está disponible), dejando que el agente IA califique. Encaja mejor con el embudo de Mokub, pero Meta optimizará por gente que escribe, no por compradores. El filtro tiene que estar en el creativo (precio "desde USD 3.000", "para empresas") y en el agente.
   Recomendación: empezar con (b) si el agente de WhatsApp ya está estable y registra calificación; si no, (a).
2. **Fase 1 (≥ ~10–15 leads o chats calificados/semana):** cambiar a meta *Leads* en el sitio (evento `Lead`) o a "Leads" en mensajería, aceptando learning limited; o subir presupuesto en una sola campaña consolidada en vez de abrir más.
3. **Fase 2 (cientos de leads/mes, CRM con estados):** enviar etapas (calificado, llamada agendada, propuesta) vía Conversions API y optimizar por conversion leads (en formularios instantáneos) o por evento personalizado de "lead calificado" en Sales/Leads web. A este presupuesto (USD 150–360/mes) es poco probable llegar a ~250 leads/mes, así que esta fase depende de escalar inversión.
- Formularios instantáneos para un servicio de USD 3.000+: solo con formulario de mayor intención, preguntas de calificación (tamaño de empresa, presupuesto, cargo), email de trabajo/verificación SMS y seguimiento inmediato por WhatsApp. Si no, lo esperable son leads baratos y fríos.
- En B2B, el sesgo de la IA hacia usuarios 65+ o de baja intención se corrige con controles de edad mínima, exclusión de Audience Network y creativos que autoselecionan (precio, "para dueños de PyME"), más que con intereses.

### Gaps
- Metas de optimización exactas disponibles en Nov 2026 para Leads + WhatsApp en Colombia (conflicto entre fuentes).
- Si "conversion leads" ya está disponible para leads de sitio web y mensajería en 2026 (Zapier sugiere que sí para formularios web; la documentación de desarrolladores solo menciona Instant Forms).
- Benchmarks de CPL, costo por conversación y costo por LPV para B2B en Colombia/LATAM 2026.
- Guía oficial de Meta sobre presupuesto mínimo por evento de optimización.
