# Playbook de Meta Ads 2026 para Mokub

En 2025 y 2026 Meta cambió la forma en que reparte anuncios. Su motor de preselección (Andromeda) elige qué anuncios llegan a la subasta sobre todo por las señales del propio creativo. Advantage+ (audiencia, ubicaciones y presupuesto de campaña) es ahora la configuración por defecto. La segmentación detallada se volvió una sugerencia, no un límite. Para Mokub, con 20.000–50.000 COP/día por campaña (≈ USD 5–12), eso lleva a una estructura concreta: **1 campaña → 1 conjunto amplio → 3–6 anuncios conceptualmente distintos**. Hay que optimizar por un evento que se repita lo suficiente (visitas a la página de diagnóstico o conversaciones de WhatsApp) y decidir con el **costo por lead calificado (CPQL)** que mide Faro, no con el CPL que reporta Meta. El umbral oficial de ~50 eventos por semana por conjunto no se alcanza con leads B2B a este presupuesto: hay que aceptar "aprendizaje limitado" y no tratarlo como falla. Desde el 29 abr 2026 Meta ofrece conectores oficiales de IA (servidor MCP y Ads CLI). Crean todo en pausa y permiten reglas de administrador que limitan a los agentes, un diseño que coincide con la política de Faro: puede bajar gasto solo y necesita aprobación humana para subirlo. No hay benchmarks confiables de CPL, CVR ni tasa de calificación para B2B en Colombia o LATAM, así que las primeras cuatro semanas sirven para construir la línea base propia.

**Convenciones.** **[Verificado]** = documento oficial de Meta o texto legal (si llegó de segunda mano, se indica). **[Práctica]** = consenso de practicantes, proveedores o prensa. **[Inferencia]** = conclusión propia de los investigadores, sin fuente directa. **[Cálculo]** = cálculo propio con fórmulas estándar. "Sin dato confiable" = las notas no tienen una cifra sólida. Fecha de corte: 2 nov 2026. Tasa de referencia ≈ 4.100 COP/USD, implícita en el brief y no verificada.

**Limitación de origen.** Las páginas del Meta Business Help Center (fase de aprendizaje, cambios significativos, reglas automatizadas, fatiga creativa) no se pudieron leer completas durante la investigación. Lo que se cita de ellas viene de fragmentos indexados o de terceros que las citan. Alguien debería abrirlas en un navegador y confirmar la redacción antes de convertir esas reglas en código.

---

## 1. Resumen ejecutivo

1. **La diversidad creativa reemplazó a la segmentación como palanca principal.** Meta lo dijo explícitamente en 2025: el foco pasó "de la segmentación de nicho a la diversificación creativa" [Verificado] ([Meta for Business](https://www.facebook.com/business/news/the-creative-advantage-unlocking-the-power-of-diversification-with-meta-andromeda)). Qué hacer: 3–6 anuncios por conjunto que cambien ángulo, formato y primer cuadro, no solo el copy.
2. **Advantage+ es el default para Leads, y la API ya no crea campañas ASC/AAC.** API v24.0 dejó de crearlas, v25.0 falla al intentarlo y v26.0 bloquea la edición de las legacy [Verificado] ([Meta for Developers](https://developers.facebook.com/docs/marketing-api/advantage-campaigns)). Qué hacer: Faro debe construir sobre `OUTCOME_LEADS` / Advantage+ y nunca sobre ASC.
3. **"Aprendizaje limitado" es casi seguro y no es una penalización.** Meta lo describe así explícitamente [Verificado] ([Meta Help](https://en-gb.facebook.com/business/help/269269737396981)). Salir del aprendizaje exige un costo por evento ≤ USD 0,70–1,70 [Cálculo]. Qué hacer: consolidar en un solo conjunto, optimizar un evento alcanzable y juzgar por CPQL.
4. **La métrica de decisión es CPQL = CPL ÷ tasa de calificación, no el CPL.** Un anuncio con el doble de CPL puede salir a mitad de CPQL [Cálculo]. Qué hacer: Faro atribuye cada `lead_calificado` de Dapta al anuncio con UTMs, `fbclid` o `ctwa_clid`.
5. **La atribución se acortó el 12 ene 2026.** Desaparecieron las ventanas de 7 y 28 días por vista; el default sigue en 7d clic + 1d vista [Verificado] ([Meta for Developers, 16 oct 2025](https://developers.facebook.com/blog/post/2025/10/16/ads-insights-api-metric-availability-updates/)). Qué hacer: comparar siempre lo que reporta Meta con lo que mide Faro por UTM.
6. **"Conversion leads" (optimizar por etapas del CRM) no aplica hoy a Mokub.** Exige formularios instantáneos y ≥200 leads/mes [Verificado] ([Meta Developers](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration.md)). Qué hacer: enviar `QualifiedLead` por la Conversions API (web o Business Messaging) para **medir**, no para optimizar.
7. **El costo de WhatsApp cambió dos veces.** Desde el 1 jul 2025 se cobra por mensaje entregado. Desde el 1 oct 2026 se cobran los mensajes de servicio por encima de 1.000 al mes y los de utilidad dentro de la ventana de 24 h [Verificado] ([WhatsApp Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md)). Qué hacer: favorecer que el primer contacto entre por click-to-WhatsApp, cuya ventana gratuita dura "hasta 7 días".
8. **La segmentación detallada se encogió.** Las exclusiones por intereses desaparecieron el 31 mar 2025 y desde el 15 ene 2026 dejaron de entregar los conjuntos con opciones retiradas [Práctica] ([Social Media Today](https://www.socialmediatoday.com/news/meta-removes-more-detailed-ad-targeting-options-facebook-instagram/757856/)). Qué hacer: audiencia amplia con controles mínimos (país, edad mínima, idioma) y exclusiones solo por públicos personalizados.
9. **Meta ya ofrece conectores oficiales de IA.** El servidor MCP y el Ads CLI salieron el 29 abr 2026; crean todo en PAUSADO y, desde el 16 jul 2026, admiten reglas de administrador [Verificado] ([Meta for Business](https://www.facebook.com/business/news/meta-ads-ai-connectors)). Qué hacer: Faro debe preferir vías oficiales, crear todo en pausa y replicar los límites de presupuesto en su propio código.
10. **El riesgo legal más concreto está en WhatsApp, no en el anuncio.** La Ley 1581 exige autorización previa, expresa e informada, y la SIC multó a Movistar con COP 670 millones por mensajes comerciales (incluido WhatsApp) sin autorización [Práctica] ([Vanguardia, 29 oct 2025](https://www.vanguardia.com/colombia/2025/10/29/multa-millonaria-a-movistar-por-bombardear-a-usuarios-con-llamadas-y-mensajes/)). Qué hacer: aviso de privacidad en el primer turno del agente, prueba de la aceptación guardada, y seguimientos proactivos dentro de los horarios de la Ley 2300.

---

## 2. Capítulos por tema

### Capítulo 1. Cómo funciona hoy la entrega de Meta: Andromeda, GEM, Lattice y Advantage+

**Explicación.** La entrega de Meta funciona como un embudo de tres etapas. **Andromeda** es la etapa de preselección (*retrieval*): de decenas de millones de anuncios candidatos deja unos pocos miles que pasan a la subasta. Meta la presentó el 2 dic 2024 con +6 % de *recall* y +8 % de calidad de anuncios en segmentos seleccionados [Verificado] ([Engineering at Meta, 2 dic 2024](https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/)). Después viene **GEM**, el modelo de ranking, y **Lattice**, que desde 2023 consolidó unos 100 modelos de ranking. La consecuencia práctica es que **un anuncio que Andromeda no preselecciona nunca entra a la subasta**, y que la preselección se basa sobre todo en las señales del creativo [Verificado, de segunda mano] ([PPC Land](https://ppc.land/meta-says-andromeda-lifted-facebook-conversions-2-4-since-2025/)).

Las cifras de impacto vienen de la propia Meta y no tienen línea base pública. En Q2 2025, Andromeda aportó ~4 % más conversiones en Feed y Reels de Facebook y GEM ~5 % en Instagram [Verificado, de segunda mano] ([Mobile Dev Memo](https://mobiledevmemo.com/meta-q2-2025-earnings-2mm-advertisers-using-genai-creative-ai-infrastructure-improvements/)). El 13 oct 2026 Meta publicó un post técnico de GEM con +18,9 % de conversiones. El 28 oct 2026 publicó la "segunda generación" de Andromeda: puntúa *todos* los anuncios elegibles, a más de 1.000 millones por segundo por servidor GPU, y Meta le atribuye +2,4 % de conversiones en Facebook desde 2025. PPC Land advierte que esa cifra no publica línea base ni método, y que **Ads Manager no tiene ningún ajuste ni reporte de Andromeda** [Verificado, de segunda mano] ([PPC Land](https://ppc.land/meta-says-andromeda-lifted-facebook-conversions-2-4-since-2025/)). En la llamada de resultados de Q2 2026, Meta dijo que las mejoras de ranking subieron 15,7 % las conversiones en Facebook y que Advantage+ superó USD 75.000 M de *run-rate* anual [Verificado, vía prensa] ([MarketBeat, 29 jul 2026](https://www.marketbeat.com/instant-alerts/meta-platforms-q2-earnings-call-highlights-2026-07-29/)).

**Advantage+ como default.** En febrero de 2025 Meta empezó a eliminar la elección inicial entre campaña "manual" y "Advantage+" para Ventas, App y Leads, y reportó ~10 % menos costo por lead calificado con Advantage+ activado. Es un dato de Meta, no independiente [Verificado, de segunda mano] ([Social Media Today, feb 2025](https://www.socialmediatoday.com/news/meta-advantage-plus-ad-updates-february-2025/739472/)). El 29 may 2025 ese setup simplificado llegó a Ventas y App [Verificado] ([Meta for Developers, 3 jun 2025](https://developers.facebook.com/blog/post/2025/06/03/advantage-plus-campaign-experience-for-sales-and-app/)). La fecha exacta para Leads es "sin dato confiable". En la Marketing API, `OUTCOME_LEADS` crea campañas en estado `ADVANTAGE_PLUS_LEADS`, siempre que se mantengan tres palancas: ubicaciones Advantage+ (sin exclusiones a nivel campaña), presupuesto de campaña y audiencia Advantage+. Si una palanca queda en `DISABLED`, la campaña deja de ser Advantage+ [Verificado] ([Meta for Developers](https://developers.facebook.com/docs/marketing-api/advantage-campaigns)).

En la interfaz unificada conviven dos tipos de ajuste. Los **controles de audiencia** son restricciones duras: ubicaciones, edad mínima, exclusión de públicos personalizados e idiomas. Las **sugerencias** son pistas que la IA puede ampliar: públicos personalizados, lookalikes, edad, género e intereses. Pasar a presupuesto por conjunto con un solo conjunto no desactiva Advantage+; hacerlo con varios conjuntos sí [Práctica] ([Jon Loomer, 23 jun 2025](https://www.jonloomer.com/advantage-plus-campaign/)).

**Cambios 2026 y contradicciones.** Lo único confirmado con fecha en 2026 son los posts técnicos de GEM y Andromeda y las cifras de las llamadas de resultados. Ninguno trae controles nuevos para el anunciante [Verificado, de segunda mano] ([PPC Land](https://ppc.land/meta-says-andromeda-lifted-facebook-conversions-2-4-since-2025/)). Hay afirmaciones que circulan sin respaldo y deben tratarse como **sin dato confiable**: que en febrero de 2026 se fusionaron los flujos manual y Advantage+ ([1ClickReport](https://www.1clickreport.com/blog/meta-advantage-plus-campaign-setup-2026)); que se bajaron los umbrales de aprendizaje, que existe "Advantage+ Leads" como producto aparte y que hay "Predictive Budget Allocation" ([Benly](https://benly.ai/learn/meta-ads/advantage-plus-updates-2026)); y que una "actualización Andromeda de abril de 2026" hace que más ediciones reinicien el aprendizaje ([AdAdvisor](https://adadvisor.ai/docs/learn/learning-phase)). Sobre el número de anuncios por conjunto hay una **contradicción**. Jon Loomer documenta que Meta retiró su recomendación de "máximo 6 anuncios por conjunto" ([Jon Loomer, ago 2025](https://www.jonloomer.com/meta-andromeda/)), pero el mismo autor escribe que Meta la sigue desaconsejando en Advantage+ Sales, con un límite duro de 50 ([Jon Loomer, jun 2025](https://www.jonloomer.com/advantage-plus-campaign/)). No existe un número oficial.

**Recomendación para Mokub.** Automatizar audiencia Advantage+ con controles mínimos (país, edad mínima ~24–25, idioma español), ubicaciones Advantage+ y presupuesto de campaña. Controlar manualmente la oferta, los creativos (que hoy hacen el trabajo de la segmentación), el evento de optimización, la geografía, las exclusiones de clientes y leads existentes, y Audience Network si aparecen leads basura [Inferencia]. Si la IA trae leads de 65+ años de baja calidad, convertir la edad máxima en control duro en lugar de sugerencia [Práctica] ([Jon Loomer, jun 2025](https://www.jonloomer.com/advantage-plus-campaign/)). No perder tiempo buscando "ajustes de Andromeda": no existen.

---

### Capítulo 2. Estructura de cuenta para presupuestos bajos y fase de aprendizaje

**Explicación.** Un conjunto sale del aprendizaje tras **~50 eventos de optimización desde el último cambio significativo**, y Meta sugiere esperar a esa cifra antes de fiarse del costo por evento [Verificado, fragmento indexado] ([Meta Help, "Last Significant Edit"](https://www.facebook.com/business/help/942374239243867); [Meta Help, "About the learning phase"](https://www.facebook.com/business/help/112167992830700/)). Cuentan como cambio significativo pausar el conjunto o cambiar el evento de optimización, la audiencia o el creativo. Los cambios de puja y de presupuesto "pueden" contar según su tamaño. Meta no da un porcentaje en el fragmento visible. El **~20 %** que se repite es una heurística de practicantes ([JetFuel 2026](https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/); [GoMarble](https://www.gomarble.ai/blog/meta-ads-learning-phase-understanding)). Otros recomiendan ≤10 %/día mientras el conjunto aprende, y otros dicen que hasta 15–20 % no reinicia nada ([Cometly](https://www.cometly.com/post/facebook-ads-learning-phase-optimization)). **Contradicción no resuelta: tratar el 20 % como [Práctica], no como regla oficial.**

"Learning limited" significa que el conjunto difícilmente llegará a ~50 eventos en la semana siguiente al último cambio significativo. Meta aclara que **"isn't a penalty"**: solo indica que el sistema no puede optimizar bien con la configuración actual [Verificado] ([Meta Help Centre](https://en-gb.facebook.com/business/help/269269737396981)). Las salidas habituales son combinar conjuntos o campañas, ampliar la audiencia, subir el presupuesto, optimizar un evento más frecuente y no tocar el conjunto [Práctica] ([Stackmatix](https://www.stackmatix.com/blog/ad-learning-phase-small-budgets); [Cometly](https://www.cometly.com/post/how-to-improve-facebook-ads-learning-phase)). Meta recomienda combinar conjuntos y minimizar cambios [Verificado, fragmento indexado] ([Meta Performance Marketing](https://www.facebook.com/business/ads/performance-marketing)). El consenso de 2026 es usar 1–3 conjuntos amplios por campaña y presupuesto de campaña cuando el presupuesto es chico. Una minoría de cuentas B2B reporta mejores resultados con estructuras manuales [Práctica] ([GrowthSpree](https://www.growthspreeofficial.com/blogs/meta-ads-campaign-structure-b2b-saas-2026); [Segwise](https://segwise.ai/blog/how-to-manage-meta-ads-guide)).

**Aritmética del presupuesto.** Con USD 5–12/día (USD 35–84/semana), llegar a 50 eventos semanales exige un costo por evento de **USD 0,70–1,70** [Cálculo]. Eso es realista para visitas a la landing (*landing page views*) o clics, quizá para conversaciones de WhatsApp en LATAM, y casi imposible para leads web de un servicio de USD 3.000+ [Inferencia]. La fórmula de practicantes para el presupuesto mínimo, (CPA objetivo × 50) ÷ 7, confirma lo mismo [Práctica] ([Aimerce](https://www.aimerce.ai/blogs/is-10-a-day-enough-to-get-purchases-on-meta-ads)). Los mínimos técnicos de Meta por evento (USD 1 o USD 5/día) solo aparecen en fuentes de terceros que se contradicen. En COP: **sin dato confiable**.

**Recomendación para Mokub.** Una campaña por oferta y mercado (empezar con "agentes/automatización – Colombia"), **un solo conjunto amplio**, 3–6 anuncios de ángulos distintos y presupuesto de campaña Advantage+ (con un solo conjunto equivale al presupuesto por conjunto). No dividir por intereses ni por país dentro de 20.000–50.000 COP/día. Separar países solo cuando cada uno tenga presupuesto propio viable. Agregar creativos en lote cada 1–2 semanas y no de a uno por día. Subir presupuesto en pasos ≤20 % y evaluar por semana [Inferencia, sobre Práctica]. Aceptar "learning limited" mientras el CPQL sea aceptable.

---

### Capítulo 3. Objetivos y optimización para lead gen B2B

**Explicación.** Hay tres familias de destino, y cada una tiene un problema distinto para Mokub.

La **web** (página de diagnóstico de Faro o mokub.co) usa el objetivo Leads, o Tráfico, con meta de *landing page views*, y los eventos `Lead`/`Contact` por píxel y CAPI. Si se optimiza por clics o LPV, conviene quitar Audience Network por el tráfico de baja calidad [Práctica] ([Jon Loomer, jun 2025](https://www.jonloomer.com/advantage-plus-campaign/)). No se obtuvo la definición oficial de LPV frente a clic en enlace (LPV exige que la página cargue con el píxel).

Los **formularios instantáneos** dan volumen barato, pero en B2B SaaS su conversión a SQL es **35–55 % menor** que la de una landing, aunque el CPL sea más bajo [Práctica, agencia sin metodología pública] ([GrowthSpree, 22 may 2026](https://www.growthspreeofficial.com/blogs/meta-ads-benchmarks-2026-b2b-saas-b2b-cpm-cpc-cpl-vertical)). Meta ofrece formularios de "mayor intención" con pantalla de revisión, verificación por SMS, email de trabajo obligatorio y lógica condicional [Verificado, de segunda mano] ([Zapier](https://zapier.com/de/blog/meta-guide-to-better-lead-quality/)). La meta **"Conversion leads"**, que optimiza por leads que avanzan en el CRM, solo es compatible con Lead Ads. Exige **≥200 leads/mes**, una etapa con conversión de 1–40 % dentro de 28 días, carga diaria de datos y, en general, 2–4 semanas de aprendizaje [Verificado] ([Meta Developers](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration.md)). Datahash habla de ~250 leads/mes ([Datahash](https://support.datahash.com/portal/en/kb/articles/meta-capi-for-crm)); **la cifra oficial (200) es la que se usa**. En una prueba A/B de Meta con 1.031 anunciantes (28 jul–11 ago 2025), Conversion leads dio en promedio −21 % de costo por lead de calidad. Zapier reporta −15 % con otro corte [Práctica, cita datos de Meta] ([Make](https://www.make.com/en/blog/meta-make-conversions-api-for-crm); [Zapier](https://zapier.com/blog/meta-guide-to-better-lead-quality/)). **Contradicción:** el FAQ de Meta menciona "Instant Forms or Website Forms", pero la página principal dice "solo Instant Forms" ([FAQ](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/faq)).

Los **mensajes (click-to-WhatsApp, CTWA)** tienen dos rutas descritas. Según WhatsApp Business: objetivo Engagement → apps de mensajería → WhatsApp → meta "Leads", con −24 % de costo por lead en promedio frente a optimizar por conversaciones (cifra de Meta) [Verificado] ([WhatsApp Business](https://whatsappbusiness.com/resources/resource-library/lead-generation-strategies-smb-whatsapp/)). **En conflicto**, CustomerLabs afirma que con `OUTCOME_LEADS` y WhatsApp la única meta es "conversaciones", y que optimizar por eventos posteriores obliga a usar Ventas con eventos CAPI. También advierte que optimizar por inicio de chat trae "gente que conversa, no compradores" [Práctica] ([CustomerLabs](https://www.customerlabs.com/blog/why-meta-algorithm-chases-chatters-not-buyers-for-ctwa-ads)). Las guías de 2026 coinciden en que la meta por defecto es "Maximizar conversaciones" y en que el éxito se mide por leads calificados o agendas [Práctica] ([ChatMaxima](https://chatmaxima.com/blog/2026-click-to-whatsapp-ads-playbook/)). **Hay que verificar en Ads Manager qué metas existen hoy para Leads + WhatsApp en Colombia.**

Los anuncios de llamada y "Ventas" con un evento personalizado de lead calificado: **sin dato confiable** sobre volúmenes mínimos para servicios B2B.

**Recomendación para Mokub (escalera) [Inferencia].**

| Fase | Condición de entrada | Objetivo / meta | Qué se mide |
|---|---|---|---|
| 0 | Sin datos | (a) Leads/Tráfico → *landing page views* hacia la página de diagnóstico, sin Audience Network; o (b) CTWA → conversaciones (o "Leads" de mensajería si está disponible) | `Lead`, `Contact` y `QualifiedLead` en Faro; CPQL |
| 1 | ≥10–15 leads o chats calificados por semana | Meta *Leads* (evento `Lead` del sitio) o "Leads" de mensajería; aceptar learning limited | CPQL, tasa de calificación |
| 2 | Cientos de leads/mes con estados de CRM | Conversion leads (si se usan formularios instantáneos) o evento personalizado de lead calificado | Costo por reunión y por propuesta |

Empezar por (a) si el agente de Dapta todavía no registra de forma confiable la calificación ni el `referral` del anuncio. Empezar por (b) si ya lo hace. Con USD 150–360/mes por campaña es poco probable llegar a la fase 2 sin escalar la inversión. Si se prueban formularios instantáneos para un servicio de USD 3.000+, usar siempre la versión de mayor intención, con preguntas de calificación (tamaño de empresa, cargo, plazo) y seguimiento inmediato por WhatsApp.

---

### Capítulo 4. Creatividad

**Explicación.** Meta lo dice directamente: si el contenido es "demasiado similar", su sistema puede no reconocerlo como diferente. Lo muestra a las mismas personas, lo que limita el alcance y puede disparar los estados de "contenido limitado" o "saturación" en la columna Entrega [Verificado] ([Meta, Creative differentiation](https://www.facebook.com/business/m/small-business/creative-differentiation)). Meta también tiene una métrica estimada de "diversidad creativa" (Alta, Media o Baja), que compara imágenes y miniaturas de un conjunto [Verificado, vía tercero] ([Meta Help 2371176336684086](https://www.facebook.com/business/help/2371176336684086)). Además advierte que con demasiados anuncios a la vez cada uno se entrega con menos frecuencia [Verificado, vía tercero] ([Meta Help 2720085414702598](https://www.facebook.com/business/help/2720085414702598)). El término "Entity ID", el umbral de similitud del 60 % y el *rollout* de octubre de 2025 **no vienen de Meta**: son abreviaturas de practicantes. El 60 % se atribuye a admetrics.io [Práctica] ([Soku](https://soku.ai/blog/meta-andromeda); [LP Agency](https://lp.agency/blog/the-2026-paid-social-playbook)).

**Fatiga.** La definición oficial usa el costo por resultado. "Creative limited" es un costo mayor que el de anuncios anteriores pero menor al doble. "Creative fatigue" es el doble o más, y en ese caso Meta recomienda un creativo "materialmente diferente" [Verificado, vía tercero] ([Meta Help 1346816142327858](https://www.facebook.com/business/help/1346816142327858)). Los practicantes vigilan una frecuencia de 2,5–3 en frío (4 = crítico) y una caída del CTR de 10 % en 7 días (alerta) o 20 % en 14 días (problema) [Práctica] ([Segwise](https://segwise.ai/blog/how-to-measure-creative-fatigue.md)). En B2B se refresca cada ~6 semanas, aunque los videos del fundador pueden fatigarse hacia la semana 3 [Práctica] ([GrowthSpree, 17 oct 2026](https://www.growthspreeofficial.com/blogs/meta-ad-creative-b2b-saas-2026)). Para el CPM: **sin dato confiable** de umbral.

**Volumen.** Según Motion 2026, las cuentas micro (menos de USD 10K/mes) lanzan 2,8 creativos nuevos por semana con 4 % de tasa de acierto. La tasa de acierto es estable entre niveles (4–9 %): más volumen da más ganadores por intentos, no por mejor puntería [Práctica] ([Motion/Runneth 2026](https://runneth.com/library/research/creative-benchmarks-2026/testing-volume-by-tier)). No hay benchmark de acierto para B2B ni LATAM.

**Qué funciona en B2B (consenso 2026) [Práctica]** ([GrowthSpree, 17 oct 2026](https://www.growthspreeofficial.com/blogs/meta-ad-creative-b2b-saas-2026)):

- Dolor hiperespecífico del cliente ideal.
- El fundador hablando a cámara, que supera a las piezas de marca.
- Demos de la interfaz real, no de stock.
- Video vertical 9:16 subtitulado, con el dolor en los primeros 0–2 s, la afirmación entre 3 y 10 s y el CTA al final.
- Piezas de 10–30 s para frío; casos y testimonios de 60 s a 3 min para retargeting.

En retargeting B2B funcionan la prueba social y los casos [Práctica] ([BrightBid, 13 feb 2026](https://brightbid.com/blog/b2b-meta-ads-strategy-2026)). Meta sugiere ejes de diferenciación: antes y después, listas, preguntas y respuestas, punto de vista y "sin compromiso" [Verificado] ([Meta, Creative differentiation](https://www.facebook.com/business/m/small-business/creative-differentiation)). No se encontraron guías verificables de copy B2B en español LATAM.

**IA generativa de Meta.** Advantage+ creative incluye animación de imagen, generación de fondos y expansión de formato [Verificado] ([Meta](https://www.facebook.com/business/m/small-business/creative-differentiation)). Según la prensa, la generación de video pasó a disponibilidad general el 6 oct 2026, junto con Ads Creative Studio [Práctica] ([TechJuice](https://www.techjuice.pk/meta-ai-advertising-tools-advertising-week-2026/)). En la beta, quienes usaron video con IA en la mayoría de sus anuncios vieron +10 % de CTR y +8 % de CVR (cifra de Meta) [Práctica] ([Search Engine Land](https://searchengineland.com/meta-generative-ai-video-advertising-tools-447367)).

**Recomendación para Mokub.** Un "concepto distinto" cambia al menos dos ejes: ángulo, formato, persona o escenario, y estructura del hook. Una "variante" solo cambia el texto del hook, el CTA o el recorte [Inferencia]. Producción realista para dos personas, cada semana [Inferencia]:

- 1 video selfie del fundador o la fundadora, de 20–40 s, grabado en lotes de 4–6 en una tarde.
- 1 grabación de pantalla del agente respondiendo un WhatsApp, sin datos de clientes.
- 1–2 estáticos de prueba social o de dato.

Eso da 2–4 conceptos por semana para toda la cuenta. Dos frenos:

- **Mejoras generativas.** Activar solo las de formato o expansión y revisarlas en vista previa. Desactivar las variaciones de texto, porque pueden alterar precios ("desde USD 3.000") o el tono [Inferencia].
- **Credibilidad.** Para vender IA "real" no conviene usar fondos generados sobre capturas de pantalla.

Registro de copy: tuteo neutro, "pyme" y "clientes potenciales" en lugar de "leads" en el texto visible, y una versión aparte para España.

---

### Capítulo 5. Segmentación

**Explicación.** Las exclusiones por segmentación detallada salieron de los conjuntos el **31 mar 2025** y de las publicaciones promocionadas el 10 jun 2025. Siguen disponibles las exclusiones por **públicos personalizados** y los controles a nivel de cuenta [Práctica] ([Wicked Reports](https://www.wickedreports.com/blog/meta-removes-detailed-targeting-exclusions-from-ad-campaigns)). Desde junio de 2025 Meta consolida opciones de interés, y **desde el 15 ene 2026 dejaron de entregar los conjuntos que usaban opciones retiradas**. Meta no publicó la lista, así que hay que revisar en Ads Manager [Práctica] ([Social Media Today, 17 ago 2025](https://www.socialmediatoday.com/news/meta-removes-more-detailed-ad-targeting-options-facebook-instagram/757856/); [MediaPost](https://www.mediapost.com/publications/article/408262/meta-further-consolidates-ad-targeting-options.html)). Según pruebas de Meta, sin exclusiones de segmentación detallada el costo mediano por conversión bajó 22,6 % [Práctica, dato atribuido a Meta] ([Social Media Today](https://www.socialmediatoday.com/news/meta-removes-more-detailed-ad-targeting-options-facebook-instagram/757856/)). Con Advantage+ audience, los intereses son sugerencias, no límites [Práctica] ([AdsUploader](https://adsuploader.com/blog/meta-audience-targeting)). Jon Loomer usa Advantage+ con sugerencias, aunque aclara que lo amplio no gana siempre y hay que probarlo de buena fe [Práctica] ([Jon Loomer](https://www.jonloomer.com/meta-removal-of-detailed-targeting/)).

**Opciones B2B: contradicción.** Algunas guías de 2026 dicen que siguen existiendo cargo, empleador, sector y segmentos como "business decision makers" ([GrowthSpree](https://www.growthspreeofficial.com/blogs/meta-ads-audience-targeting-b2b-saas-2026)). Otras dicen que no hay segmentación firmográfica nativa o que esas opciones quedaron vacías ([SearchLab, 17 mar 2026](https://searchlab.nl/en/compare/linkedin-ads-vs-meta-ads-b2b)) [Práctica]. Los cargos son autodeclarados y rara vez se actualizan. BrightBid desaconseja intereses B2B como "Marketing Managers" y prefiere semillas de leads validados enviados por CAPI [Práctica] ([BrightBid](https://brightbid.com/blog/b2b-meta-ads-strategy-2026)). El consenso: **"que el creativo haga la calificación"** [Práctica] ([Enrich Labs](https://www.enrichlabs.ai/blog/meta-ads-targeting-and-bidding-strategies-2026)).

**Recomendación para Mokub [Inferencia].**

- **Prospección:** una campaña por oferta (agentes/automatización por un lado, landing pages de USD 450 por otro, porque cambian el ticket y el comprador). Advantage+ audience con controles de país, edad mínima e idioma, y sin dividir en conjuntos.
- **Retargeting:** solo cuando el presupuesto lo permita (20–30 % del total). Visitantes web de 30–180 días, interacciones en Instagram y Facebook, y espectadores del 50 % de un video, con piezas de caso y prueba social.
- **Exclusiones:** solo públicos personalizados (clientes actuales y leads de los últimos 30 días).
- **Lookalikes:** postergarlos hasta tener una lista de leads calificados. El mínimo de semilla de ~100 personas por país **no fue verificado**.
- **Cargo o sector:** si aparecen en Ads Manager, no depender de ellos. En pymes de LATAM los dueños rara vez declaran su cargo.

---

### Capítulo 6. Medición: píxel, CAPI, eventos de CRM, atribución, UTMs, CPL frente a CPQL

**Explicación.**

*Configuración base.* Hay que enviar los mismos eventos por píxel y por Conversions API, deduplicados con el mismo `event_name` y un `event_id`. La calidad de coincidencia (EMQ, "out of 10") existe solo para eventos web. Los parámetros más fuertes son email, IP, nombre y teléfono. `fbp` y `fbc` deben refrescarse y los eventos enviarse casi en tiempo real [Verificado] ([Meta Developers, CAPI best practices](https://developers.facebook.com/docs/marketing-api/conversions-api/best-practices)). Si falta `fbc`, el EMQ se estanca entre 3 y 4,5. `fbp`, `fbc`, IP y user agent no se hashean. Email y teléfono se normalizan (teléfono en E.164, +57…) y se pasan por SHA-256 [Práctica] ([CustomerLabs](https://customerlabs.com/blog/improve-your-event-match-quality-from-ok-to-great/)).

*Atribución.* Desde el **12 ene 2026** la API no devuelve `7d_view` ni `28d_view`. Siguen 1d, 7d y 28d clic, 1d *engaged-view* y 1d vista. Los campos únicos y los desgloses horarios quedan limitados a 13 meses y el desglose por frecuencia a 6 [Verificado] ([Meta for Developers, 16 oct 2025](https://developers.facebook.com/blog/post/2025/10/16/ads-insights-api-metric-availability-updates/)). Se habla de caídas de 15–30 % en conversiones reportadas en cuentas que usaban ventanas de vista largas: **cifra no verificada** [Práctica] ([Dataslayer](https://dataslayer.ai/blog/meta-ads-attribution-window-removed-january-2026)).

*Offline Conversions API.* Se discontinuó en mayo de 2025; los eventos offline ahora van por la CAPI normal con su `action_source` [Verificado] ([Meta changelog v20.0](https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version20.0)). Las fuentes no coinciden en el día (1 o 14 de mayo).

*CAPI for Business Messaging (para CTWA).* Usa `action_source: "business_messaging"` y `messaging_channel: "whatsapp"`, con `whatsapp_business_account_id` + `ctwa_clid`. Admite los eventos `LeadSubmitted` y `QualifiedLead`. El dataset pertenece al dueño del WABA y **Meta no deduplica** [Verificado] ([Meta Developers](https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging)). Según Zernio, `Lead` se rechaza en este canal y hay que usar `LeadSubmitted` [Práctica] ([Zernio](https://docs.zernio.com/platforms/whatsapp/ctwa)). **Contradicción entre las notas:** una de ellas sugiere que enviar `QualifiedLead` con `ctwa_clid` permitiría optimizar hacia leads calificados, pero la página oficial **solo describe optimización por Purchase**. Hasta confirmarlo, `QualifiedLead` es un evento de reporte.

*Calidad frente a volumen.* Según WordStream/LocaliQ 2025 (EE. UU.), en campañas de leads la conversión bajó de 8,67 % a 7,72 % mientras el CPL subió 21 % [Práctica] ([PPC Land, 9 sep 2025](https://ppc.land/facebook-ad-costs-jump-21-as-lead-campaigns-struggle-while-traffic-ads-thrive/)). El volumen barato no es calidad.

**Recomendación para Mokub.** El flujo de datos mínimo es este [Inferencia]:

1. **Página de diagnóstico.** Píxel + CAPI con `Lead` (envío del diagnóstico) y `Contact` (clic a WhatsApp), deduplicados con `event_id`.
2. **Faro guarda los identificadores** en la sesión y los pasa al registro de WhatsApp: `fbclid` → `fbc`, `fbp`, UTMs, email y teléfono.
3. **UTMs estándar:** `utm_source=meta&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}`. Los parámetros dinámicos de Meta no se reverificaron en la documentación.
4. **Cuando Dapta marca `lead_calificado=true`,** Faro envía `QualifiedLead` por CAPI web (`action_source: "website"` o `"system_generated"`, con el `event_time` real, `fbc`, `fbp`, `em` y `ph` hasheados y `external_id`). En CTWA lo envía por CAPI for Business Messaging con `ctwa_clid`.
5. **En Events Manager,** crear una conversión personalizada sobre `QualifiedLead` para reportar el CPQL por anuncio.
6. **Semanalmente,** comparar lo que reporta Meta (7d clic + 1d vista) con lo que ve Faro por UTM. Una brecha grande indica conversiones por vista, problemas de deduplicación o tracking roto.

La métrica de decisión es **CPQL = gasto ÷ leads calificados = CPL ÷ tasa de calificación** [Cálculo]. Ejemplo:

| Anuncio | CPL | Tasa de calificación | CPQL |
|---|---|---|---|
| A | 15.000 COP | 10 % | 150.000 COP |
| B | 30.000 COP | 40 % | 75.000 COP |

B es el doble de eficiente aunque su CPL sea el doble.

---

### Capítulo 7. Método de pruebas y escalado

**Explicación.** Meta no publica tamaños de muestra mínimos. Las guías de terceros dicen que Experiments declara ganador con ~95 % de confianza y recomienda 7–30 días con potencia estimada ≥80 %, pero eso **no se verificó en la documentación de Meta** [Práctica] ([GrowWithSakib](https://growwithsakib.com/meta-ads-ab-testing/)). Detener un test al primer indicio de ganador ("peeking") infla los falsos positivos [Práctica] ([Kameleoon](https://www.kameleoon.com/blog/stopping-ab-tests-too-early)). Los tamaños de abajo salen de la fórmula estándar para comparar dos proporciones (α = 0,05, potencia 80 %) ([Evan Miller](https://www.evanmiller.org/ab-testing/sample-size.html)), y los intervalos, de Wilson y de Poisson exacto [Cálculo]:

| Comparación | Muestra necesaria por variante | Costo estimado en Colombia [Cálculo sobre supuestos de baja confianza] | ¿Factible con USD 5–12/día? |
|---|---|---|---|
| CTR 1,0 % vs 1,5 % | ~7.700 impresiones | USD 15–30 (CPM USD 2–4) | Sí, 2–6 días por variante |
| CTR 1,0 % vs 1,2 % | ~42.600 impresiones | USD 85–170 | Lento |
| CVR de landing 5 % vs 10 % | ~430 clics | USD 90–170 | 2–4 semanas |
| CVR 5 % vs 7,5 % | ~1.470 clics | sin dato confiable | No |
| Tasa de calificación 20 % vs 40 % | ~78 leads | USD 230–780 si el CPL fuera USD 3–10 (CPL Colombia: sin dato confiable) | No como test formal |

Con muestras chicas la incertidumbre es enorme. 3 calificados de 10 leads (30 %) dan un intervalo de 10,8 % a 60,3 %. Con 10 conversiones, el CPA real puede estar entre −46 % y +108 % del observado; con 30, ±35 %; con 50, ±27 % [Cálculo] ([Wilson](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval)).

**Bandits frente a A/B [Inferencia].** El reparto automático de Meta entre los anuncios de un mismo conjunto ya funciona como un *bandit*: explota rápido al aparente ganador y casi no le da presupuesto a los perdedores. Eso sirve para rendir, no para aprender la causa. El A/B formal (Experiments) reparte 50/50 y sí permite inferir, pero tarda el doble. Para Mokub conviene un enfoque mixto. Los creativos se prueban "orgánicamente" dentro del conjunto, aceptando el sesgo. El A/B formal se reserva para hipótesis grandes, como web frente a WhatsApp directo o el ángulo de la oferta. El reparto desigual entre anuncios no es un problema en sí; la solución suele ser crear anuncios nuevos y realmente distintos, no microgestionar [Práctica] ([Jon Loomer](https://www.jonloomer.com/tag/meta-advertising-general/page/2/)).

**Escalado.** La heurística más citada es subir ≤20 % cada vez (no es regla oficial; ver capítulo 2). Para frenar caídas, los practicantes usan *stop-loss* con mínimo de gasto y ventana de varios días. Las alzas son pequeñas (~15 %/día) y siempre con un piso de rendimiento [Práctica] ([Bïrch](https://bir.ch/birch-course/advanced-tips-for-automated-rules); [TheOptimizer](https://theoptimizer.io/docs/automation/rule-templates)).

**Recomendación para Mokub [Inferencia].**

- **CTR y hook rate:** juzgar tras 3.000–8.000 impresiones por anuncio. Pausar por CTR solo si el límite superior de Wilson queda por debajo del CTR del líder, o si el CTR es menor al 50 % del líder con más de 5.000 impresiones.
- **CVR y CPL:** no juzgar antes de ~100 clics por anuncio. CPA: no antes de gastar 2–3× el objetivo sin conversión.
- **Tasa de calificación:** usar Beta(1 + calificados, 1 + no calificados) y actuar si P(B > A) > 90 %, sabiendo que con menos de 20 leads la decisión es débil.
- **Escalado vertical:** +≤20 % cada 3–4 días, solo con CPQL estable 7 días y como máximo una edición cada 3–7 días.
- **Escalado horizontal:** duplicar el ganador en un conjunto o campaña nueva solo por encima de ~100.000 COP/día. Antes de eso fragmenta la señal.

---

### Capítulo 8. Benchmarks recientes

**Explicación.** No hay datos públicos verificables de 2025–2026 de CPL, CVR ni tasa de calificación para B2B, tecnología o servicios profesionales **en Colombia ni en LATAM**. Tampoco aparecieron cortes LATAM en Gupta Media, AdAmigo, Swydo, Databox, Varos, Triple Whale ni Bïrch. Lo disponible:

| Métrica | Valor | Ámbito | Fuente y fecha | Confianza |
|---|---|---|---|---|
| CTR, CPC, CVR y CPL de campañas de leads | 2,59 % · USD 1,92 · 7,72 % · USD 27,66 (+21 % interanual) | EE. UU., todas las industrias, abr 2024–jun 2025, >1.000 campañas, medianas | [PPC Land sobre WordStream/LocaliQ, 9 sep 2025](https://ppc.land/facebook-ad-costs-jump-21-as-lead-campaigns-struggle-while-traffic-ads-thrive/) | Media |
| CTR y CPC de tráfico | 1,71 % · USD 0,70 | Ídem | Ídem | Media |
| CPM B2B SaaS | USD 12–18 (mediana) | Global/EE. UU., agencia | [GrowthSpree, 22 may 2026](https://www.growthspreeofficial.com/blogs/meta-ads-benchmarks-2026-b2b-saas-b2b-cpm-cpc-cpl-vertical) | Baja-media, sin metodología |
| CPL B2B SaaS | Lead Ads USD 80–220 · landing USD 120–380 · reserva directa USD 180–420 | Ídem | Ídem | Baja-media |
| Costo por SQL | USD 400–1.200 (ACV USD 5–30K) | Ídem | Ídem | Baja-media |
| CPM Colombia, todas las industrias | media ~USD 3,20 (global ~USD 20,58); mínimo USD 1,70 (may 2026); pico anómalo USD 13,06 (jul 2026) | Colombia | [Superads](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/colombia), periodo ambiguo (jul 2025–jul 2026 o nov 2025–oct 2026) | Baja, un solo proveedor |
| CPC Colombia por industria | Finance ~USD 0,20 · Fitness ~0,18 · Real Estate ~0,16; software y consultoría: sin dato | Colombia | Fragmentos de búsqueda de [Superads](https://www.superads.ai/facebook-ads-costs/cpc-cost-per-click/software-and-it-services/colombia) | Baja |
| CPC global de Consulting | ~USD 1,49 | Global | Superads | Baja |
| CTR B2B | 0,7–1,1 % | Agregadores 2026 | [Flighted](https://www.flighted.co/blog/meta-ads-performance-benchmarks-by-industry); [ContentStudio](https://contentstudio.io/blog/meta-ads-benchmarks) | Baja |
| Creativos nuevos por semana y tasa de acierto (cuentas micro) | 2,8/semana · 4 % | Global | [Motion 2026](https://runneth.com/library/research/creative-benchmarks-2026/testing-volume-by-tier) | Media |
| CTWA frente a landing | Brasil: R$8–25 frente a R$20–60 por lead calificado; "3X" de conversión | Brasil y genérico | [MessageCentral](https://www.messagecentral.com/blog/click-to-whatsapp-ads-brazil); [AsisteClick](https://asisteclick.com/en/blog/click-to-whatsapp-ads-ctwa-conversion-2026) | Baja, proveedores |
| CPL, CVR y tasa de calificación B2B en Colombia o LATAM | **sin dato confiable** | — | — | — |

**Recomendación para Mokub.** Rangos de partida deducidos, **no medidos** [Inferencia/Cálculo]:

- **CPM:** USD 2–5 (≈ 8.000–20.000 COP). B2B probablemente se ubica por encima del promedio.
- **CTR:** 0,8–1,5 %.
- **CPC:** USD 0,15–0,60, derivado como CPM ÷ 1.000 ÷ CTR.

Los CPL de EE. UU. no se trasladan a Colombia, porque el CPM es 5–6 veces más bajo y el ticket de Mokub se parece más a servicios profesionales que a SaaS. **La línea base real de CPL, tasa de calificación y CPQL hay que medirla en las semanas 1–4** y guardarla en Faro como referencia interna.

---

### Capítulo 9. WhatsApp como destino (click-to-WhatsApp)

**Explicación.**

*Precios.*
- **Por mensaje:** desde el **1 jul 2025** Meta cobra por mensaje entregado, según categoría (marketing, utilidad, autenticación, servicio) y país del destinatario. El modelo por conversación quedó obsoleto [Verificado] ([WhatsApp Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md)).
- **Ventana gratuita (FEP):** si el usuario escribe desde un anuncio CTWA en la app de Android o iOS (no cuentan WhatsApp Web ni Desktop), se abre una ventana gratuita cuando la empresa responde. Mientras está abierta, Meta no cobra ninguna categoría de mensaje. Texto oficial: "The FEP window may remain open for up to 7 days" [Verificado] ([Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md)). **Contradicción:** proveedores y guías anteriores hablan de 72 h y de que el botón de la página también la activa ([BIK.ai](https://help.bik.ai/en/articles/12699299-whatsapp-business-platform-pricing-guide-for-ecommerce-merchants); [Courier](https://www.courier.com/guides/whatsapp-pricing)). Hay que confirmarlo en el campo `pricing` de los webhooks de Mokub.
- **Ventana de atención (CSW):** dura 24 h desde el último mensaje del usuario, y fuera de ella solo se pueden enviar plantillas.
- **Mensajes de servicio:** gratis desde el 1 nov 2024 con un cupo de 1.000 al mes por número. **Desde el 1 oct 2026 se cobra a partir del mensaje 1.001**, y los de utilidad dentro de la CSW se cobran desde esa misma fecha [Verificado] ([Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md)).
- **Colombia (+57):** tiene tarifa propia y su tarifa de utilidad y autenticación subió el 1 oct 2025. La facturación en COP existe desde el 1 abr 2026 y no se puede cambiar después de crear la cuenta. Tarifa por mensaje: **sin dato confiable** (no se descargó el *rate card*).
- **Meta Business Agent:** se cobra USD 2,00 por millón de tokens desde el 1 jul 2026. No aplica a agentes de terceros como Dapta.
- **Política "AI Providers" (15 ene 2026):** restringe a los asistentes de IA de propósito general, no a bots de una empresa como uno de calificación de leads [Verificado] ([AI Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers.md)).

*Configuración.* El anuncio CTWA necesita que la página esté vinculada al número. Si la página y el WABA están en portafolios distintos, como en el caso de Mokub, la vinculación genera una solicitud que debe aprobar el dueño del WABA. Algunos proveedores recomiendan tenerlos en el mismo portafolio [Práctica] ([360dialog](https://docs.360dialog.com/docs/whatsapp-marketing/fb-page-whatsapp-api-linking)). No hay artículo oficial del Help Center sobre este caso. Las **secuencias de bienvenida** (texto, mensaje prellenado e *ice breakers*) se crean por API desde la app del partner y se asignan en el creativo como "Partner app". Una secuencia ligada a un anuncio activo no se puede editar [Verificado] ([Welcome message sequences](https://developers.facebook.com/documentation/business-messaging/whatsapp/ctwa/welcome-message-sequences.md)).

*Atribución.* El primer mensaje entrante trae un objeto `referral` con `source_id` (ID del anuncio), `ctwa_clid`, titular, cuerpo, medios y el campo `ref` [Verificado] ([Welcome message sequences](https://developers.facebook.com/documentation/business-messaging/whatsapp/ctwa/welcome-message-sequences.md)). Solo llega en ese primer mensaje, y hay integraciones que lo descartan sin avisar [Práctica] ([GitHub evolution-api #2645](https://github.com/evolution-foundation/evolution-api/issues/2645)). La ventana de atribución de `ctwa_clid` aparece como 7 días en una librería y como 72 h en un blog: **sin dato confiable** oficial.

*Comparación de destinos.* No existe un estudio independiente que compare CTWA, formularios y web para B2B en LATAM. Lo que hay son casos autorreportados, como Braip (Brasil) con −44 % de costo por lead en CTWA optimizado por leads ([WhatsApp Business](https://whatsappbusiness.com/resources/success-stories/braip/)), y cifras de proveedores que se contradicen entre sí ([Wati](https://www.wati.io/en/blog/click-to-whatsapp-ads-vs-lead-form-ads-roas/); [Neorev](https://neorev.it.com/blog/click-to-whatsapp-ads/)) [Práctica].

**Recomendación para Mokub [Inferencia].**

1. **Antes de lanzar CTWA,** confirmar que Dapta deja pasar y guarda `referral` y `ctwa_clid`. Si no lo hace, usar un `ref` o un código único en el mensaje prellenado de cada anuncio como respaldo.
2. **Resolver la vinculación** entre portafolios (la página pide el vínculo y el dueño del WABA lo aprueba) y verificar que la app de Dapta aparezca como Partner app.
3. **Ice breakers que filtren intención:** "Quiero automatizar ventas con IA", "Ver un ejemplo", "Hablar con alguien".
4. **El agente califica en 2–3 preguntas** (empresa, problema, plazo o presupuesto) y pasa a un humano solo los leads calificados.
5. **Vigilar el volumen mensual de mensajes de servicio** para no cruzar los 1.000 sin método de pago. Sin él, Meta deja de entregar.
6. **Si Dapta se cae, se pierde la FEP de ese lead.** Faro debe alertar.
7. **Comparar web frente a CTWA** por CPQL, no por costo por conversación.

---

### Capítulo 10. Políticas y cumplimiento

**Explicación: Meta.**
- **Atributos personales:** Meta prohíbe anuncios que "assert or imply the personal attributes" de la audiencia con fórmulas en segunda persona [Verificado, texto tomado del extracto porque la URL dio 404 en un segundo intento] ([Meta Transparency](https://transparency.meta.com/policies/ad-standards/objectionable-content/personal-attributes)).
- **Endurecimiento en 2026:** rastreadores de terceros reportan que ahora alcanza implicaciones indirectas, que los antes/después cuentan como "transformación implícita", que lo hablado en el video se revisa igual que el texto y que la landing puede causar el rechazo. **No está confirmado por Meta** [Práctica] ([AuditSocials](https://www.auditsocials.com/blog/meta-ad-misleading-claims-personal-attributes-prohibited-content-policy-2026)).
- **"Resultados irreales" y afirmaciones sobre IA:** no hay texto oficial verificado; las URL dieron 404.
- **Categorías especiales:** Financial Products and Services (reemplazó a Credit el 14 ene 2025), Employment, Housing y temas sociales, electorales o políticos. Restringen la segmentación. Por API hay que declarar la categoría aunque sea NONE [Práctica/Verificado] ([Jon Loomer](https://www.jonloomer.com/special-ad-categories-meta-ads/); [Meta Marketing API](https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category)). Para los anuncios propios de Mokub no aplica ninguna. Sí aplicaría si Mokub pautara para clientes fintech o de crédito.
- **Opt-in de WhatsApp:** debe decir claramente que la persona acepta comunicaciones de la empresa e incluir su nombre, con instrucciones de baja por categoría, además de cumplir la ley local [Verificado] ([Getting opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in.md)).

**Explicación: Colombia.**
- **Ley 1581 de 2012:** el titular es la persona natural (art. 3). El tratamiento requiere autorización previa, expresa e informada (art. 9). Al pedirla hay que informar la finalidad y los derechos (art. 12). Las sanciones llegan hasta 2.000 SMMLV (art. 23) [Verificado, texto legal; la URL no cargó durante la investigación] ([Secretaría del Senado](http://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html)).
- **Decreto 1377 de 2013** (compilado en el 1074 de 2015): la autorización puede ser escrita, oral o por conductas inequívocas, y **el silencio no vale** (art. 7). Exige política de tratamiento (art. 13), aviso de privacidad (arts. 14–15) y conservar la prueba de la autorización [Verificado, texto legal; URL no cargada] ([Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646)).
- **Ley 2300 de 2023** ("Dejen de fregar", vigente desde el 11 oct 2023): solo se contacta por canales autorizados expresamente; lunes a viernes de 7:00 a 19:00 y sábados de 8:00 a 15:00, nunca domingos ni festivos; máximo un contacto al día y no por varios canales en la misma semana. Se exceptúa la información que el consumidor pidió. El art. 5 incluye la "mensajería por aplicaciones web" [Práctica, análisis jurídico sobre el texto] ([Asuntos Legales, 15 nov 2023](https://www.asuntoslegales.com.co/analisis/manuel-serrano-rey-3340544/principales-cambios-ley-2300-de-2023-sobre-comunicaciones-comerciales-3748648); [Función Pública, PDF](https://www.funcionpublica.gov.co/eva/gestornormativo/norma_pdf.php?i=213990); [Superfinanciera, Boletín 107](https://www.superfinanciera.gov.co/10114938)).
- **Circular Externa 001 de la SIC (26 jun 2024):** obliga a consultar el Registro de Números Excluidos [Práctica] ([Olarte Moure](https://olartemoure.com/en/law-regulated-for-contacting-consumers/)).
- **Aplicación al B2B:** discutible. Forvis Mazars sostiene que la ley se lee desde las relaciones de consumo ([Forvis Mazars](https://www.forvismazars.com/co/es/acerca-de-nosotros/noticias-publicaciones-y-media/nuestras-publicaciones/actualidad-juridica-y-tributaria/2024/conozca-la-ley-2300-de-2023)). No se encontró un concepto de la SIC que lo resuelva.
- **Sanciones:** Movistar, COP 670 millones por contactos comerciales por llamadas, SMS y WhatsApp sin autorización previa, confirmada en reposición ([Vanguardia, 29 oct 2025](https://www.vanguardia.com/colombia/2025/10/29/multa-millonaria-a-movistar-por-bombardear-a-usuarios-con-llamadas-y-mensajes/)). Claro, COP 1.306 millones, con fecha de decisión no clara ([Asuntos Legales](https://www.asuntoslegales.com.co/actualidad/la-sic-impuso-una-multa-por-1-306-millones-a-claro-por-recopilar-numeros-telefonicos-3652415)) [Práctica].

**Recomendación para Mokub [Inferencia].**

- **Datos de los leads:** el nombre, celular, correo y cargo del contacto B2B son datos personales. El NIT y la razón social no lo son.
- **Aviso en el primer turno del agente:** "Al continuar aceptas que Mokub trate tus datos para responder tu solicitud y contactarte por WhatsApp sobre servicios de IA. Política: mokub.co/privacidad. Escribe BAJA para no recibir más mensajes." Guardar la marca de tiempo y el texto como prueba.
- **Seguimientos proactivos** (plantillas fuera de la CSW): aplicar las reglas de la Ley 2300 aunque su alcance B2B sea dudoso (horario, máximo uno al día, sin cambiar de canal en la semana, opción de baja).
- **Prohibido en anuncios:** "garantizado", "duplica tus ventas en 30 días", "reemplaza a tu equipo", "100 % automático", cifras de ROI sin respaldo, antes/después con números inventados, "100 % cumple habeas data" y casos de clientes sin autorización.
- **Preferible:** "Un agente de IA que responde y califica por WhatsApp", "Agenda un diagnóstico de 20 min", "Para equipos comerciales en Colombia", "Resultados varían según tu operación".
- **Atributos personales:** evitar preguntas como "¿Eres dueño de una pyme que pierde clientes?".
- **Registro de bases de datos:** si Mokub debe inscribirse en el RNBD depende de sus activos. **Sin dato confiable** sobre el umbral.

---

### Capítulo 11. IA aplicada a la pauta

**Explicación.**

*Conectores oficiales.* El **29 abr 2026** Meta lanzó los "Meta ads AI connectors": un **servidor MCP** y un **Ads CLI** que conectan la cuenta con un agente de IA para reportes, creación y edición de campañas, conjuntos y anuncios en lenguaje natural, catálogo y diagnóstico de señales. El MCP no requiere credenciales de desarrollador. Desde la actualización del **16 jul 2026**, los administradores con control total del portafolio pueden fijar **reglas del servidor MCP** que limitan lo que hacen los agentes, por ejemplo cambiar presupuestos [Verificado] ([Meta for Business](https://www.facebook.com/business/news/meta-ads-ai-connectors)). Según una guía técnica que cita la documentación [Práctica] ([mcp.directory, may 2026](https://mcp.directory/blog/meta-ads-cli-mcp)):

- El MCP vive en `https://mcp.facebook.com/ads` y el CLI se instala con `pip install meta-ads-cli` (Python 3.12+).
- Expone 29 herramientas, entre ellas insights con "anomaly signal", benchmarks y "opportunity score".
- Usa OAuth con tres niveles de permiso: lectura, lectura/escritura y lectura/escritura/financiero.
- **Todo lo que se crea queda en PAUSED** y un humano lo activa; `--force` no lo evita.
- No menciona topes de gasto ni límites de uso de la API.

Sobre la apertura a terceros: según Relevant Audience, el MCP se abrió a cualquier desarrollador con app de Meta el 21 jul 2026 ([Relevant Audience](https://www.relevantaudience.com/meta/meta-ads-mcp-open-to-developers/)), y en Advertising Week (6 oct 2026) se anunció su apertura a herramientas de IA de terceros ([TechJuice](https://www.techjuice.pk/meta-ai-advertising-tools-advertising-week-2026/)) [Práctica]. No se pudo leer el post oficial del developer blog, así que la disponibilidad en Colombia y en español queda **sin dato confiable**. Tampoco se sabe si las reglas MCP admiten topes numéricos o solo permisos de sí/no.

*Hacia dónde va Meta.* El plan de "producto + presupuesto → anuncio completo" para fines de 2026 viene del WSJ (junio 2025) y no hay confirmación de que se haya cumplido [Práctica] ([Campaign Asia](https://www.campaignasia.com/article/meta-aims-to-fully-automate-ad-creation-with-ai-by-2026/502831)). En Cannes 2026 Meta anunció un sistema creativo de IA de punta a punta con un **flujo de aprobación creativa** en Ads Manager [Práctica] ([Campaign](https://campaignlive.com/article/meta-launches-complete-ai-creative-ad-ecosystem/1962693)). El asistente Business AI ahora recuerda campañas pasadas y guías de voz de marca [Práctica] ([TechJuice](https://www.techjuice.pk/meta-ai-advertising-tools-advertising-week-2026/)).

*Evidencia de impacto.*
- **Creativos generados con IA:** es lo mejor respaldado. Un estudio de NYU/Emory en Google Display encontró +19 % de CTR (de 3,73 % a 4,44 %), pero con la etiqueta "generado por IA" el CTR cayó a 2,56 % ([Dataiads](https://www.dataiads.io/en/blog/impact-of-visual-generative-ai-on-advertising-effectiveness-2025)). Otro estudio en Japón, con más de 500 M de impresiones, dio 0,76 % frente a 0,65 % ([Segwise](https://segwise.ai/blog/ai-ad-generators-2026-performance-marketer-guide.md)) [Práctica, secundaria]. Solo el 22 % de los consumidores ve bien la IA en anuncios ([eMarketer](https://www.emarketer.com/content/meta-ramps-up-genai-powered-ad-creation-marketers-weigh-consumer-trust)).
- **Agentes que operan la cuenta:** **no hay evidencia controlada**. En 2025 hubo reportes no confirmados por Meta de restricciones permanentes de cuenta tras usar conectores no oficiales.
- **Costo de operación:** un perfil de 58 herramientas consumió ~55.000 tokens de entrada por sesión, y las escrituras son síncronas, así que no sirven para pujas en tiempo real [Práctica] ([mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp)).

*Cómo automatizan los practicantes.*
- **Reglas nativas de Meta:** hasta 250 por cuenta, una condición de cada tipo por regla, sin mezclar niveles y sin aplicarse a anuncios políticos o de temas sociales [Práctica] ([Cropink, 11 mar 2026](https://cropink.com/meta-automated-rules)).
- **Bïrch:** las reglas de caída **solo notifican** y las de alza suben +15 % con un piso de rendimiento ([Bïrch](https://bir.ch/birch-course/advanced-tips-for-automated-rules)).
- **TheOptimizer:** pausa solo si **los 3 días** superan el CPA de equilibrio ([TheOptimizer](https://theoptimizer.io/docs/automation/rule-templates)).
- **Madgicx:** recomienda no activar todas las automatizaciones a la vez para no "sobregestionar" la cuenta ([Madgicx](https://academy.madgicx.com/lessons/introduction-madgicx-automations)).
- **TikTok, aplicable también a Meta:** las reglas se evalúan por intervalos, así que el umbral debe ponerse por debajo del valor real ([TikTok Ads Help](https://ads.tiktok.com/resources/help/article/faqs-for-automated-rules)).
- **Fase de aprendizaje:** un Client Partner de Meta aconseja recordársela al agente, y la fuente sugiere limitar las ediciones de presupuesto o audiencia a **1 cada 24 h** (consejo, no regla) [Práctica] ([mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp)).

**Recomendación para Mokub/Faro [Inferencia].** El propio diseño de Meta (todo creado en pausa más reglas de administrador) valida la política de Faro. Orden de valor según la evidencia:

1. Generar conceptos y variantes revisados por humanos que "no parezcan IA genérica".
2. Reportes y anomalías explicadas en lenguaje simple.
3. *Stop-loss*.

La operación autónoma de presupuesto y estructura es lo menos probado y lo más riesgoso. Faro debe:

- Preferir la Marketing API con una app propia revisada, o el MCP y el CLI oficiales, nunca conectores no oficiales.
- Pedir el permiso más estrecho posible (sin el nivel financiero para el agente).
- Optimizar por CPQL, no por CTR ni CPC.
- No etiquetar ni hacer evidente la IA en los creativos sin necesidad, salvo que una política lo exija. El requisito de divulgación de IA **no fue verificado**.

---

### Capítulo 12. Errores frecuentes de cuentas pequeñas

**Explicación y recomendación.** Con menos de USD 20/día, los errores son sobre todo estructurales:

| Error | Por qué daña | Corrección para Mokub | Respaldo |
|---|---|---|---|
| Repartir el presupuesto en muchas campañas o conjuntos | Cada conjunto queda sin eventos | 1 campaña, 1 conjunto amplio, 3–5 anuncios distintos | [Práctica] ([Segwise 2026](https://segwise.ai/blog/how-to-manage-meta-ads-guide); [AdAdvisor 2026](https://adadvisor.ai/blog/how-to-run-facebook-ads-on-a-tight-budget-in-2026)) |
| Ajustar a los 3 días | Cada cambio reinicia el aprendizaje | Máximo 1 edición cada 3–7 días, en lote | [Práctica] ([AdAdvisor](https://adadvisor.ai/blog/how-to-run-facebook-ads-on-a-tight-budget-in-2026)) |
| Juzgar con pocos datos | Ruido de ±60 % en el CPA con 10 conversiones | Umbrales del capítulo 7 | [Cálculo] |
| Optimizar por la métrica barata equivocada | Clics y chats sin intención | Evento alcanzable más decisión por CPQL | [Práctica] ([BrightBid](https://brightbid.com/blog/b2b-meta-ads-strategy-2026); [CustomerLabs](https://www.customerlabs.com/blog/why-meta-algorithm-chases-chatters-not-buyers-for-ctwa-ads)) |
| Tracking deficiente | Conversiones subreportadas, "learning limited" y malas decisiones | Píxel + CAPI deduplicados y comparación con Faro | [Práctica] ([AdManage](https://admanage.ai/blog/facebook-ads-learning-phase-guide)) |
| Variaciones cosméticas como "pruebas" | Andromeda las trata como el mismo anuncio | Conceptos distintos (capítulo 4) | [Verificado] ([Meta](https://www.facebook.com/business/m/small-business/creative-differentiation)) |
| Microgestionar el reparto desigual entre anuncios | No es un problema en sí | Crear anuncios nuevos y distintos | [Práctica] ([Jon Loomer](https://www.jonloomer.com/tag/meta-advertising-general/page/2/)) |
| Responder tarde al lead | Contactar en la primera hora multiplicaba ~7 veces la probabilidad de calificar (estudio de 2011, antiguo) | Agente de Dapta en segundos y humano en minutos para los calificados | [Práctica] ([HBR, mar 2011](https://hbr.org/2011/03/the-short-life-of-online-sales-leads)) |
| "Promocionar publicación" en lugar de una campaña | Menos control de objetivo y ubicaciones | Crear en Ads Manager o por API | [Inferencia], sin fuente 2025–26 leída |
| Landing con varias llamadas a la acción, lenta o que contradice el anuncio | Pierde conversión y puede causar rechazo por políticas | Una sola CTA, rápida en móvil, coherente con el anuncio | [Inferencia]; riesgo de rechazo: [Práctica] ([AuditSocials](https://www.auditsocials.com/blog/meta-ad-misleading-claims-personal-attributes-prohibited-content-policy-2026)) |
| Probar "en serio" con menos de USD 30–50/día | Afirmación de proveedor | Ignorarla: aceptar decisiones direccionales | [Práctica] ([Extuitive](https://extuitive.com/articles/meta-ads-minimum-budget-for-testing)) |

---

## 3. Plan de lanzamiento para Mokub

Todo este plan es **[Inferencia]** construida a partir de los capítulos anteriores. Los umbrales provienen de las notas cuando se indica.

### Estructura inicial

| Nivel | Campaña A (semana 1 en adelante) | Campaña B (semana 3, opcional, requiere aprobación) |
|---|---|---|
| Campaña | "MOKUB_AGENTES_CO_DIAG": objetivo **Clientes potenciales** (Advantage+ leads), presupuesto de campaña, categoría especial NONE | "MOKUB_AGENTES_CO_CTWA": objetivo Clientes potenciales (o Engagement → WhatsApp, según lo que exista en Ads Manager) con destino WhatsApp |
| Presupuesto | **40.000 COP/día** (≈ USD 10) | **25.000 COP/día** (≈ USD 6) |
| Conjunto | 1 conjunto. Colombia; edad mínima 25 (control); español; Advantage+ audience sin intereses o con 2–3 sugerencias; ubicaciones Advantage+ **sin Audience Network**; excluir los públicos personalizados de clientes y de leads de los últimos 30 días | 1 conjunto con los mismos controles; número de Dapta; secuencia de bienvenida con 3 *ice breakers* |
| Meta de rendimiento | **Landing page views** hacia la página de diagnóstico de Faro (con UTMs), pasando a **Leads** (evento `Lead`) cuando haya ≥10–15 leads/semana | Conversaciones (o "Leads" de mensajería si está disponible) |
| Anuncios | 4–5: los 3 ángulos de abajo más 1–2 variantes de formato del ángulo más fuerte | Los 2 mejores conceptos de la campaña A, adaptados a "Escríbenos por WhatsApp" |
| Condición para activar | Tracking verificado (checklist) | Dapta guarda `referral`/`ctwa_clid`, vínculo página–WABA aprobado y aviso de privacidad activo |

La oferta de landing pages (desde USD 450) queda fuera de las primeras 4 semanas. Tiene otro comprador y otro ticket, y abrirla ahora dividiría la señal. Se evalúa como campaña aparte desde la semana 5.

### Tres ángulos creativos

Los ejemplos están en español latino neutro, sin promesas de resultado ni atributos personales. Son hipótesis para probar, no copy validado.

**Ángulo 1: dolor operativo (video selfie del fundador o la fundadora, 20–30 s, 9:16 subtitulado).**
> Hook en pantalla: "Responder WhatsApp a mano a las 11 p. m. no escala."
> Texto principal: "Muchas pymes pierden consultas porque nadie alcanza a responder a tiempo. En Mokub construimos agentes de IA que responden, hacen las preguntas clave y te pasan solo las conversaciones listas para una llamada. Proyectos desde USD 3.000. Haz el diagnóstico gratuito de 5 minutos y te decimos si tiene sentido para tu operación."
> CTA: "Más información" → página de diagnóstico.

**Ángulo 2: demo real (grabación de pantalla del agente en WhatsApp con datos ficticios, 30–45 s).**
> Hook en pantalla: "Esta conversación la llevó un agente de IA, no una persona."
> Texto principal: "Así califica un agente de Mokub a un cliente potencial por WhatsApp: saluda, entiende qué necesita y agenda la llamada con tu equipo. Lo diseñamos con tus preguntas y tus reglas. Los resultados dependen de cada operación; en el diagnóstico revisamos la tuya."
> CTA: "Ver diagnóstico".

**Ángulo 3: oferta del diagnóstico con precio como filtro (estático o carrusel "antes y después del proceso", sin cifras inventadas).**
> Titular: "Diagnóstico de automatización para empresas"
> Texto principal: "Somos un estudio de IA en Bogotá. Revisamos cómo entran y se atienden hoy tus clientes potenciales y te proponemos qué automatizar: agentes, integraciones con tu CRM o software a medida. Proyectos desde USD 3.000. Sin compromiso."
> CTA: "Más información".

Revisar cada pieza antes de publicar: nada de "garantizado", "duplica" ni "reemplaza a tu equipo"; ningún caso de cliente sin permiso escrito; la página de diagnóstico debe repetir la misma promesa y el mismo precio.

### Qué medir

| Capa | Métrica | Fuente | Cuándo se puede juzgar |
|---|---|---|---|
| Creativo | CTR de enlace, hook rate (reproducciones de 3 s ÷ impresiones), frecuencia a 7 días | Meta | 3.000–8.000 impresiones por anuncio |
| Página | LPV → `Lead` (CVR), LPV → clic a WhatsApp | Faro + Meta | ~100 clics por anuncio |
| Conversación | Chats iniciados, % que responde el filtro, % `lead_calificado` | Dapta/Faro | Acumulado semanal |
| Negocio | **CPQL**, costo por llamada agendada, llamadas realizadas, propuestas | Faro | Acumulado; decisión bayesiana con ≥20 leads |
| Salud | EMQ, brecha Meta vs Faro, rechazos, tiempo de respuesta del agente, mensajes de servicio del mes | Events Manager, Dapta | Semanal |

### Cronograma de las primeras 4 semanas

| Semana | Acciones | Decisiones |
|---|---|---|
| 0 (preparación, 3–5 días) | Píxel + CAPI con `Lead` y `Contact` deduplicados; Faro guarda UTMs, `fbclid`/`fbc`, `fbp`; endpoint `QualifiedLead`; aviso de privacidad en el agente; públicos de exclusión; límite de gasto de la cuenta; grabar 4–6 videos del fundador y 2 demos | Fijar el **CPQL tope provisional** (sin benchmark, lo fija Mokub según lo que vale una llamada para su ticket) |
| 1 | Lanzar la campaña A (40.000 COP/día) con 4–5 anuncios. No editar en 7 días salvo *stop-loss* automático | Solo verificar el tracking (la brecha Meta vs Faro debe ser explicable) |
| 2 | Leer CTR y hook rate. Pausar perdedores claros según las reglas. Agregar un lote de 2–3 conceptos nuevos de una vez. Revisar la calidad de los leads con el agente | Recalibrar el CPQL tope con los datos reales. Si hay ≥10–15 leads/semana, proponer el cambio de meta LPV → Leads (aprobación) |
| 3 | Si se cumplen sus condiciones, proponer la campaña B CTWA (25.000 COP/día, aprobación). Si la A tiene CPQL estable 7 días, proponer +20 % (aprobación) | Elegir entre cambio de meta, campaña B o escalar: **un solo cambio grande por semana** |
| 4 | Revisión semanal completa. Comparar el CPQL de A y B de forma direccional: con menos de ~78 leads por brazo no hay conclusión formal (capítulo 7) | Definir la línea base interna (CPM, CTR, CVR, CPL, tasa de calificación, CPQL) y el plan del mes 2: continuar, pivotar el destino o abrir la oferta de landing pages |

---

## 4. Reglas para el copiloto de IA (Faro)

**Parámetros.** `CPQL_tope` y `CPL_tope` los fija Mokub (no hay benchmark confiable). Mientras no existan, se usan los provisionales de la semana 0. Todos los umbrales marcados **[Inferido]** son propuestas de los investigadores; los marcados **[Fuente]** vienen de una práctica o un documento citado. Las ventanas se evalúan por días completos, salvo que se indique otra cosa. Cada acción queda en el registro de auditoría con: quién la hizo, el valor antes y después, la métrica y la ventana que la justificaron, y un botón de revertir.

**Topes duros (no los cambia el agente).**
- Límite de gasto de la cuenta, fijado por un humano.
- Presupuesto diario máximo por campaña de 50.000 COP.
- Como máximo un cambio de presupuesto o audiencia por conjunto cada 24 h, con al menos 72 h para juzgar [Fuente: consejo citado en [mcp.directory](https://mcp.directory/blog/meta-ads-cli-mcp)].
- El agente nunca reactiva lo que pausó un humano.
- Las entidades nuevas se crean en PAUSED [Fuente: diseño del MCP de Meta].
- Faro usa el permiso más estrecho posible, sin el nivel financiero.

### 4.1 Acciones automatizables (solo bajan gasto o solo alertan)

| regla | condición medible | acción | umbral mínimo de datos | riesgo |
|---|---|---|---|---|
| Stop-loss de anuncio sin leads | Gasto del anuncio ≥ 2× `CPL_tope` y 0 eventos `Lead`/conversaciones en los últimos 3 días, evaluando cada día por separado | Pausar el anuncio y notificar | ≥3 días completos activos y gasto ≥ 2× `CPL_tope` [Fuente: TheOptimizer, 3 días; múltiplo 1,5–2× propuesto en las notas, Inferido] | Pausar un anuncio es un cambio de creativo que puede reiniciar el aprendizaje; falso positivo si hay retraso de atribución |
| Stop-loss por calidad | Gasto del anuncio ≥ 2× `CPQL_tope` y 0 `lead_calificado` en Faro | Pausar el anuncio y notificar | Gasto ≥ 2× `CPQL_tope` [Inferido] | Calificación tardía del agente; revisar que Dapta no tenga leads pendientes |
| Creativo perdedor por CTR | CTR de enlace < 50 % del CTR del líder del conjunto **y** límite superior de Wilson al 95 % < CTR del líder | Pausar el anuncio | ≥5.000 impresiones del anuncio [Inferido, sobre el cálculo de ~7.700 impresiones para detectar 1 % vs 1,5 %] | Un CTR bajo puede venir con mejor calificación; no aplicar si el anuncio tiene un CPQL mejor que la mediana |
| Alerta de fatiga | Frecuencia a 7 días > 3 en frío **y** CTR de enlace ≥20 % menor que sus primeros 7 días; o estado de Meta "Creative fatigue" (costo por resultado ≥ 2×) | Alertar, etiquetar el anuncio "fatiga" y pedir un concepto nuevo (no pausar si no hay reemplazo aprobado) | ≥1.000 impresiones en cada ventana de 7 días [Inferido]; frecuencia 2,5–3 y caída de CTR 20 % [Fuente: Segwise]; 2× [Fuente: Meta, vía tercero] | Ruido de CTR con poco volumen; pausar sin reemplazo deja el conjunto con un solo anuncio |
| Caída de conversión | CVR (hoy + ayer) < 75 % de la CVR de hace 2–3 días | **Solo notificar**, máximo una vez al día | Gasto > USD 10 (≈ 41.000 COP) en ambos periodos [Fuente: Bïrch] | Pocas conversiones por día; casi siempre es ruido a este presupuesto |
| Bajar presupuesto por CPQL alto | CPQL de 7 días > 1,5× `CPQL_tope` | Reducir el presupuesto de la campaña 20 % (sin bajar del mínimo operativo de 20.000 COP/día) y notificar | ≥7 días desde el último cambio y gasto ≥ 2× `CPQL_tope` en la ventana [Inferido] | Un recorte >20 % puede reiniciar el aprendizaje [Práctica]; con pocos leads el CPQL es muy volátil |
| Sobregasto | Gasto del día > 120 % de lo esperado a esa hora; o gasto acumulado del mes ≥ límite fijado | Alertar; si se supera el tope diario de la campaña o el mensual de la cuenta, pausar la campaña | Desde la primera hora del día [Fuente: patrón de las notas, alerta del +20 %] | Meta puede gastar hasta un poco más del diario en días puntuales; no pausar por variaciones normales del día |
| Tracking roto | 0 eventos `Lead` en Meta en 48 h mientras Faro registra ≥2 leads con UTM de Meta; o EMQ en caída fuerte; o brecha Meta vs Faro > 50 % en 7 días | Alertar con diagnóstico (píxel, CAPI, deduplicación) | ≥2 leads en Faro en la ventana [Inferido] | Las diferencias por ventana de atribución son normales; no confundirlas con una falla |
| Agente de WhatsApp caído o sin atribución | Mensajes entrantes desde CTWA sin respuesta del agente en > 15 min; o leads CTWA sin `referral`/`ctwa_clid` guardado | Alertar; si no responde en > 2 h, pausar la campaña CTWA | 1 evento basta [Inferido]. La ventana gratuita exige responder dentro de 24 h [Fuente: Meta] | Perder la ventana gratuita y el lead; pausar de más si la caída es momentánea |
| Cupo de mensajes de servicio | Mensajes de servicio del mes ≥ 800 de los 1.000 gratis por número | Alertar (aviso de costo y de método de pago) | Conteo mensual [Fuente: Meta, cobro desde el 1 oct 2026; el 80 % es Inferido] | Sin método de pago, Meta deja de entregar los mensajes que superan el cupo |
| Rechazo o restricción | Anuncio rechazado, cuenta con restricción o aviso de política | Alertar con el motivo; no reenviar automáticamente | 1 evento | Reenviar sin corregir puede escalar la restricción |
| Horario de seguimientos (Ley 2300) | Plantilla proactiva programada fuera de L–V 7–19 h o S 8–15 h, domingo o festivo, o segundo contacto del día, o cambio de canal en la misma semana | Bloquear y reprogramar al próximo horario permitido | 1 evento [Fuente: análisis de la Ley 2300; alcance B2B dudoso] | Bajo; demora el seguimiento |
| Baja del lead | El lead escribe "BAJA" o equivalente | Marcar opt-out y excluirlo de plantillas y públicos | 1 evento [Fuente: Meta opt-in, Ley 1581] | Ninguno |
| Pausa programada | Fecha u hora de fin definida por un humano | Pausar la campaña | — | Ninguno |

### 4.2 Acciones que requieren aprobación humana (suben gasto o cambian estrategia)

Faro las **propone** con la evidencia y el riesgo, y un humano aprueba.

| regla | condición medible | acción propuesta | umbral mínimo de datos | riesgo |
|---|---|---|---|---|
| Escalado vertical | CPQL de 7 días < `CPQL_tope` y estable (dos ventanas seguidas de 7 días bajo el tope) | Subir el presupuesto de la campaña ≤20 %, como máximo una vez cada 3–7 días, sin pasar de 50.000 COP/día por campaña | ≥7 días desde el último cambio y ≥5 leads calificados en 14 días [Inferido]; tamaño del paso ≤20 % [Fuente: Práctica]; +15 % con piso de rendimiento [Fuente: Bïrch] | Reinicio del aprendizaje; el CPQL con pocos leads tiene un error de ±60 % |
| Activar entidades nuevas | Toda campaña, conjunto o anuncio creado por Faro (queda en PAUSED) | Activar | Checklist de políticas y tracking completo | Gasto en piezas no revisadas; rechazo por política |
| Publicar creativo o copy nuevo | Concepto nuevo, generado por IA o por humanos | Subir en lote semanal al conjunto | Revisión de marca, políticas y precio | Atributos personales, promesas irreales, IA que se nota o que altera precios |
| Cambiar la meta de optimización | ≥10–15 leads (o chats calificados) por semana durante 2 semanas | LPV → Leads, o conversaciones → Leads de mensajería | 2 semanas consecutivas sobre el umbral [Inferido, de la escalera del capítulo 3] | Reinicio total del aprendizaje y alza temporal del CPL |
| Nueva campaña o canal (por ejemplo, CTWA) | Condiciones técnicas cumplidas (`referral` guardado, vínculo página–WABA, aviso de privacidad) | Crear la campaña B con 20.000–25.000 COP/día | La campaña A con ≥2 semanas de datos [Inferido] | Divide la señal; sube el gasto total |
| Escalado horizontal o nuevo país | Campaña ≥ ~100.000 COP/día con CPQL estable | Duplicar el ganador en una campaña o país nuevo con presupuesto propio | Presupuesto viable por país [Inferido] | Fragmentación; costo de mensajes en otro país |
| Cambiar los controles de audiencia | Leads basura concentrados en un rango de edad o ubicación (por ejemplo, 65+ o Audience Network) | Convertir la edad máxima en control o excluir la ubicación | ≥20 leads con calificación conocida [Inferido] | Puede sacar la campaña de Advantage+ si se tocan las ubicaciones |
| Activar mejoras creativas de Meta | Mejoras generativas de texto o fondos | Activar una por una con vista previa | Revisión humana de cada salida | Alteración de precio, tono o UI; piezas genéricas que Andromeda agrupa como similares |
| A/B formal (Experiments) | Hipótesis grande (destino, oferta) | Lanzar el test 50/50 | ≥7 días; ~78 leads por brazo para calidad [Cálculo] | Duplica el gasto o el tiempo; pocas veces será concluyente a este presupuesto |
| Formularios instantáneos o conversion leads | Se quiere probar volumen con formulario de mayor intención; conversion leads solo con ≥200 leads/mes | Crear la campaña e integrar `lead_id` | ≥200 leads/mes para conversion leads [Fuente: Meta] | Leads baratos y fríos; trabajo de integración |
| Reactivar lo pausado | Anuncio o campaña pausada por regla o por humano | Reactivar | Causa corregida | Repetir la pérdida |
| Cambiar los topes duros | Cualquier cambio a límites, permisos o reglas del MCP | Editar | — | Pérdida de control del gasto |

---

## 5. Checklist de lanzamiento y de revisión semanal

### Lanzamiento (antes de gastar el primer peso)

- [ ] Página vinculada al número de WhatsApp de Dapta; solicitud entre portafolios aprobada por el dueño del WABA.
- [ ] Píxel instalado en mokub.co y en la página de diagnóstico de Faro; CAPI enviando `Lead` y `Contact` con `event_id` compartido (deduplicación verificada en Events Manager).
- [ ] Faro captura UTMs, `fbclid` → `fbc`, `fbp`, email y teléfono (E.164, +57) y los lleva al registro del lead en WhatsApp.
- [ ] Endpoint de `QualifiedLead` probado (web o Business Messaging) y conversión personalizada creada en Events Manager.
- [ ] Dapta guarda `referral` (`source_id`, `ctwa_clid`) del primer mensaje, solo si se usa CTWA.
- [ ] Agente de Dapta con 2–3 preguntas de calificación, aviso de privacidad en el primer turno, prueba de la aceptación guardada y palabra "BAJA" funcional.
- [ ] Política de tratamiento de datos publicada en mokub.co/privacidad.
- [ ] Ventana gratuita de CTWA (72 h o 7 días) verificada en el campo `pricing` de los webhooks.
- [ ] Método de pago de WhatsApp configurado (cobro de servicio desde el mensaje 1.001).
- [ ] Públicos personalizados de exclusión (clientes y leads de 30 días) cargados.
- [ ] Campaña creada como Advantage+ leads, categoría especial NONE, un conjunto, controles (Colombia, edad ≥25, español) y sin Audience Network.
- [ ] 4–5 anuncios de ángulos distintos, revisados contra la lista de frases prohibidas; landing coherente con el anuncio y el precio.
- [ ] Mejoras de texto generativas desactivadas; mejoras de formato revisadas en vista previa.
- [ ] UTMs dinámicas en todos los anuncios.
- [ ] Límite de gasto de la cuenta, topes duros de Faro, permisos mínimos y registro de auditoría activos.
- [ ] `CPL_tope` y `CPQL_tope` provisionales definidos.
- [ ] Alguien abrió en un navegador las páginas del Help Center sobre fase de aprendizaje, cambios significativos y fatiga, y confirmó la redacción.

### Revisión semanal (mismo día y hora; un solo cambio grande por semana)

- [ ] Gasto vs plan; alertas y acciones automáticas de la semana (registro de auditoría).
- [ ] Por anuncio: impresiones, CTR de enlace, hook rate, frecuencia a 7 días, CPL y leads calificados. ¿Cuáles ya superan el umbral mínimo de datos?
- [ ] CPQL de la semana y acumulado, por campaña y por anuncio (Faro), y costo por llamada agendada.
- [ ] Brecha entre lo que reporta Meta y lo que mide Faro por UTM; EMQ; eventos rechazados.
- [ ] Estado de entrega: aprendizaje, aprendizaje limitado, "creative limited/fatigue", "contenido limitado".
- [ ] Calidad conversacional: % de chats que completan el filtro, motivos de no calificación, tiempo de respuesta, mensajes de servicio del mes.
- [ ] Rechazos de anuncios y avisos de política.
- [ ] Lote de 2–3 conceptos nuevos listo para la semana siguiente.
- [ ] Propuestas de Faro que esperan aprobación (presupuesto, meta, nuevas campañas): aprobar o rechazar con su motivo.
- [ ] Revisar los contactos proactivos de la semana contra la Ley 2300 (horarios, frecuencia, canal).
- [ ] Actualizar la línea base interna (CPM, CTR, CVR, CPL, tasa de calificación, CPQL).

---

## 6. Glosario

| Término | Definición |
|---|---|
| **A/B (Experiments)** | Prueba que reparte la audiencia 50/50 entre variantes para inferir causalidad. |
| **Advantage+** | Conjunto de automatizaciones de Meta (audiencia, ubicaciones, presupuesto de campaña, creativos); hoy es el default de Leads, Ventas y App. |
| **Advantage+ audience** | Segmentación en la que intereses, lookalikes y edad son sugerencias que la IA puede ampliar; los "controles" son límites duros. |
| **Andromeda** | Etapa de preselección (*retrieval*) de Meta que elige qué anuncios llegan a la subasta. |
| **Aprendizaje / learning phase** | Periodo de exploración de un conjunto hasta acumular ~50 eventos de optimización. |
| **Aprendizaje limitado / learning limited** | Estado en que el conjunto difícilmente llegará a ~50 eventos en una semana; no es una penalización. |
| **ASC / AAC** | Advantage+ Shopping / App Campaigns, formatos legacy que la API ya no permite crear. |
| **Audience Network** | Red de apps y sitios externos de Meta; suele traer tráfico de baja calidad para leads. |
| **Bandit** | Método que reasigna presupuesto hacia el aparente ganador mientras prueba; rinde, pero no explica causas. |
| **CAPI (Conversions API)** | Envío de eventos de servidor a Meta, complementario al píxel. |
| **CAPI for Business Messaging** | Variante de la CAPI para eventos de conversaciones de WhatsApp o Messenger (`action_source: business_messaging`). |
| **Conversion leads** | Meta de optimización por leads que avanzan en el CRM; requiere formularios instantáneos y ≥200 leads/mes. |
| **CPC / CPM / CTR / CVR** | Costo por clic / costo por mil impresiones / tasa de clics / tasa de conversión. |
| **CPL** | Costo por lead (cualquier lead). |
| **CPQL** | Costo por lead calificado = gasto ÷ leads calificados = CPL ÷ tasa de calificación. |
| **CSW** | Ventana de atención al cliente de WhatsApp (24 h desde el último mensaje del usuario). |
| **CTWA** | Anuncio click-to-WhatsApp. |
| **`ctwa_clid`** | Identificador de clic de un anuncio CTWA, que llega en el `referral` del primer mensaje. |
| **Creative limited / Creative fatigue** | Estados de Meta: costo por resultado más alto que antes (<2×) / 2× o más. |
| **Dataset** | Contenedor de eventos en Events Manager (en Business Messaging, propiedad del dueño del WABA). |
| **EMQ** | Event Match Quality, puntuación de 0 a 10 de la calidad de coincidencia de eventos web. |
| **`event_id`** | Identificador para deduplicar el mismo evento enviado por píxel y por CAPI. |
| **`fbc` / `fbp` / `fbclid`** | Cookie de clic / cookie de navegador de Meta / parámetro de clic en la URL. |
| **FEP** | Free Entry Point: ventana gratuita de WhatsApp tras un CTWA ("hasta 7 días" según la doc oficial; 72 h según proveedores). |
| **GEM** | Modelo de ranking de anuncios de Meta. |
| **Hook rate** | Proporción de impresiones que ven los primeros ~3 s del video. |
| **Ice breakers** | Botones de inicio de conversación en WhatsApp. |
| **Lattice** | Arquitectura que consolida modelos de ranking de Meta. |
| **LPV** | Landing page view: visita en la que la página cargó con el píxel. |
| **MCP / Ads CLI** | Conectores oficiales de IA de Meta (servidor Model Context Protocol y herramienta de línea de comandos) para operar cuentas con agentes. |
| **OCAPI** | Offline Conversions API, discontinuada en mayo de 2025. |
| **`referral`** | Objeto del webhook con los datos del anuncio que originó la conversación. |
| **RNE / RNBD** | Registro de Números Excluidos / Registro Nacional de Bases de Datos (Colombia). |
| **SIC** | Superintendencia de Industria y Comercio (autoridad de datos personales y consumo en Colombia). |
| **SQL** | Sales Qualified Lead: lead aceptado por ventas. |
| **Stop-loss** | Regla que pausa o reduce gasto cuando se supera un umbral de pérdida. |
| **UTM** | Parámetros de URL (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) para atribuir visitas. |
| **WABA** | WhatsApp Business Account. |
| **Wilson (intervalo)** | Intervalo de confianza para proporciones, robusto con conteos pequeños. |

---

## 7. Fuentes

Fecha de consulta de todas las fuentes: 2 nov 2026. "Oficial" incluye documentos de Meta y textos o autoridades legales; "Práctica" incluye agencias, proveedores, prensa y blogs.

### Oficiales

| Fuente | Fecha | Tipo |
|---|---|---|
| [Engineering at Meta: Andromeda](https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/) | 2 dic 2024 | Oficial |
| [Meta for Business: The Creative Advantage (Andromeda)](https://www.facebook.com/business/news/the-creative-advantage-unlocking-the-power-of-diversification-with-meta-andromeda) | 2025 (sin día exacto) | Oficial |
| [Meta: Creative differentiation (pymes)](https://www.facebook.com/business/m/small-business/creative-differentiation) | Sin fecha | Oficial |
| [Meta: Three steps creative diversification](https://www.facebook.com/business/news/three-steps-to-optimize-your-performance-with-creative-diversification) | 2024 | Oficial |
| [Meta Help 2371176336684086: diversidad creativa](https://www.facebook.com/business/help/2371176336684086) | Sin fecha (vía tercero) | Oficial |
| [Meta Help 2720085414702598: volumen de anuncios](https://www.facebook.com/business/help/2720085414702598) | Sin fecha (vía tercero) | Oficial |
| [Meta Help 1346816142327858: fatiga creativa](https://www.facebook.com/business/help/1346816142327858) | Sin fecha (vía tercero) | Oficial |
| [Meta Help: Last Significant Edit](https://www.facebook.com/business/help/942374239243867) | Sin fecha (fragmento indexado) | Oficial |
| [Meta Help: About the learning phase](https://www.facebook.com/business/help/112167992830700/) | Sin fecha (fragmento indexado) | Oficial |
| [Meta Help: About learning limited](https://en-gb.facebook.com/business/help/269269737396981) | Sin fecha | Oficial |
| [Meta Help: Edit your ad](https://www.facebook.com/business/help/2169779963333459) | Sin fecha | Oficial |
| [Meta: Performance Marketing](https://www.facebook.com/business/ads/performance-marketing) | Sin fecha (fragmento indexado) | Oficial |
| [Meta for Developers: Advantage+ Campaign Experience](https://developers.facebook.com/docs/marketing-api/advantage-campaigns) | Sin fecha | Oficial |
| [Meta for Developers: Advantage+ para Ventas y App](https://developers.facebook.com/blog/post/2025/06/03/advantage-plus-campaign-experience-for-sales-and-app/) | 3 jun 2025 | Oficial |
| [Meta for Developers: Ads Insights API metric availability updates](https://developers.facebook.com/blog/post/2025/10/16/ads-insights-api-metric-availability-updates/) | 16 oct 2025 | Oficial |
| [Meta Developers: Conversions API best practices](https://developers.facebook.com/docs/marketing-api/conversions-api/best-practices) | Sin fecha | Oficial |
| [Meta Developers: Conversion Leads Integration](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration.md) | Sin fecha | Oficial |
| [Meta Developers: Implementing the CRM integration](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration) | Sin fecha | Oficial |
| [Meta Developers: CRM integration FAQ](https://developers.facebook.com/documentation/ads-commerce/conversions-api/conversion-leads-integration/faq) | Sin fecha | Oficial |
| [Meta Developers: Marketing API changelog v20.0 (OCAPI)](https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version20.0) | 2024–2025 | Oficial |
| [Meta Developers: Conversions API for Business Messaging](https://developers.facebook.com/docs/marketing-api/conversions-api/business-messaging) | Sin fecha | Oficial |
| [Meta Developers: Business Messaging (documentation)](https://developers.facebook.com/documentation/ads-commerce/conversions-api/business-messaging) | Sin fecha | Oficial |
| [Meta Marketing API: Special Ad Category](https://developers.facebook.com/docs/marketing-api/audiences/special-ad-category) | Sin fecha | Oficial |
| [WhatsApp: Pricing on the WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md) | Vigente a nov 2026 | Oficial |
| [WhatsApp: Conversation-based pricing (Deprecated)](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/conversation-based-pricing/) | Sin fecha | Oficial |
| [WhatsApp: AI Providers](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers.md) | Términos del 15 ene 2026 | Oficial |
| [WhatsApp: Welcome message sequences (CTWA)](https://developers.facebook.com/documentation/business-messaging/whatsapp/ctwa/welcome-message-sequences.md) | Sin fecha | Oficial |
| [WhatsApp: Onboard Business app users (Coexistence)](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users.md) | Sin fecha | Oficial |
| [WhatsApp: Getting opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in.md) | Sin fecha | Oficial |
| [WhatsApp Business: Lead generation strategies SMB](https://whatsappbusiness.com/resources/resource-library/lead-generation-strategies-smb-whatsapp/) | Sin fecha | Oficial |
| [WhatsApp Business: caso Braip](https://whatsappbusiness.com/resources/success-stories/braip/) | Sin fecha | Oficial (caso autorreportado) |
| [Meta for Business: Meta ads AI connectors](https://www.facebook.com/business/news/meta-ads-ai-connectors) | 29 abr 2026, act. 16 jul 2026 | Oficial |
| [Meta Business News: Instant Forms (espejo)](https://projecter.workplace.com/business/news/create-more-valuable-leads-than-ever-with-metas-instant-forms) | Sin fecha | Oficial (espejo) |
| [Meta Transparency: Personal attributes](https://transparency.meta.com/policies/ad-standards/objectionable-content/personal-attributes) | Sin fecha (404 en segundo intento) | Oficial |
| [Ley 1581 de 2012, Secretaría del Senado](http://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html) | 2012 | Oficial (legal; no cargó en la sesión) |
| [Decreto 1377 de 2013, Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=53646) | 2013 | Oficial (legal; no cargó en la sesión) |
| [Ley 2300 de 2023, Función Pública (PDF)](https://www.funcionpublica.gov.co/eva/gestornormativo/norma_pdf.php?i=213990) | 2023 | Oficial (legal) |
| [Superfinanciera, Boletín Jurídico 107](https://www.superfinanciera.gov.co/10114938) | Sin fecha | Oficial (interpretación) |

### Práctica (agencias, proveedores, prensa, académicos vía secundaria)

| Fuente | Fecha | Tipo |
|---|---|---|
| [Jon Loomer: Meta Andromeda](https://www.jonloomer.com/meta-andromeda/) | 19 ago 2025, act. 15 dic 2025 | Práctica |
| [Jon Loomer: Advantage+ campaign](https://www.jonloomer.com/advantage-plus-campaign/) | 23 jun 2025 | Práctica |
| [Jon Loomer: Removal of detailed targeting](https://www.jonloomer.com/meta-removal-of-detailed-targeting/) | 10 ene 2024, act. 6 mar 2025 | Práctica |
| [Jon Loomer: Special ad categories](https://www.jonloomer.com/special-ad-categories-meta-ads/) | 2025 | Práctica |
| [Jon Loomer: Offline Conversions API deprecation](https://www.jonloomer.com/qvt/offline-conversions-api-deprecation-delayed/) | 2025 | Práctica |
| [Jon Loomer: archivo (7 errores, 26 may 2026)](https://www.jonloomer.com/tag/meta-advertising-general/page/2/) | 26 may 2026 | Práctica |
| [PPC Land: Andromeda +2,4 %](https://ppc.land/meta-says-andromeda-lifted-facebook-conversions-2-4-since-2025/) | Oct–nov 2026 | Práctica (prensa) |
| [PPC Land: WordStream 2025](https://ppc.land/facebook-ad-costs-jump-21-as-lead-campaigns-struggle-while-traffic-ads-thrive/) | 9 sep 2025 | Práctica (prensa) |
| [PPC Land: ventanas de atribución](https://ppc.land/meta-restricts-attribution-windows-and-data-retention-in-ads-insights-api/) | 2025 | Práctica (prensa) |
| [Mobile Dev Memo: Meta Q2 2025](https://mobiledevmemo.com/meta-q2-2025-earnings-2mm-advertisers-using-genai-creative-ai-infrastructure-improvements/) | 2025 | Práctica (prensa) |
| [AdExchanger: Meta Q3 2025](https://www.adexchanger.com/platforms/metas-q3-was-a-net-win-disguised-as-a-loss) | Nov 2025 | Práctica (prensa) |
| [MarketBeat: Meta Q2 2026 earnings](https://www.marketbeat.com/instant-alerts/meta-platforms-q2-earnings-call-highlights-2026-07-29/) | 29 jul 2026 | Práctica (prensa) |
| [MediaPost: Meta Q2 2026](https://www.mediapost.com/publications/article/416925/) | Jul 2026 | Práctica (prensa) |
| [Social Media Today: Advantage+ feb 2025](https://www.socialmediatoday.com/news/meta-advantage-plus-ad-updates-february-2025/739472/) | Feb 2025 | Práctica (prensa) |
| [Search Engine Land: Advantage+ leads](https://searchengineland.com/meta-advantage-campaign-setup-leads-campaigns-451713) | 2025 | Práctica (prensa) |
| [Social Media Today: más retiro de segmentación](https://www.socialmediatoday.com/news/meta-removes-more-detailed-ad-targeting-options-facebook-instagram/757856/) | 17 ago 2025 | Práctica (prensa) |
| [MediaPost: consolidación de segmentación](https://www.mediapost.com/publications/article/408262/meta-further-consolidates-ad-targeting-options.html) | 2025 | Práctica (prensa) |
| [Wicked Reports: exclusiones retiradas](https://www.wickedreports.com/blog/meta-removes-detailed-targeting-exclusions-from-ad-campaigns) | 2025 | Práctica |
| [AdvLaunch: segmentación 2026](https://advlaunch.us/blog/meta-detailed-targeting-removed-2026) | 2026 | Práctica |
| [1ClickReport: Advantage+ 2026](https://www.1clickreport.com/blog/meta-advantage-plus-campaign-setup-2026) | 2026 | Práctica (no verificada) |
| [1ClickReport: políticas 2026](https://www.1clickreport.com/blog/meta-ad-policy-changes-2026-compliance-guide) | 2026 | Práctica (no verificada) |
| [Benly: Advantage+ 2026](https://benly.ai/learn/meta-ads/advantage-plus-updates-2026) | Ene/mar 2026 | Práctica (no verificada) |
| [JetFuel: learning phase 2026](https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/) | 2026 | Práctica |
| [GoMarble: learning phase](https://www.gomarble.ai/blog/meta-ads-learning-phase-understanding) | Sin fecha | Práctica |
| [Cometly: learning phase](https://www.cometly.com/post/how-to-improve-facebook-ads-learning-phase) | Sin fecha | Práctica |
| [Cometly: optimización de learning phase](https://www.cometly.com/post/facebook-ads-learning-phase-optimization) | Sin fecha | Práctica |
| [Stackmatix: learning phase con presupuestos chicos](https://www.stackmatix.com/blog/ad-learning-phase-small-budgets) | Sin fecha | Práctica |
| [Stackmatix: CPM por país 2026](https://stackmatix.com/blog/facebook-ads-cpm-by-country-2026) | 2026 | Práctica (no extraído) |
| [AdManage: learning phase guide](https://admanage.ai/blog/facebook-ads-learning-phase-guide) | Sin fecha | Práctica |
| [Webtonic: re-entrada en aprendizaje](https://www.webtonic.io/blog/campaign-re-entered-learning-phase-causes) | Sin fecha | Práctica |
| [Webtonic: estadísticas de CTR](https://www.webtonic.io/blog/click-through-rate-statistics) | Sin fecha | Práctica |
| [AdAdvisor: learning phase](https://adadvisor.ai/docs/learn/learning-phase) | 2026 | Práctica (no verificada) |
| [AdAdvisor: presupuesto ajustado 2026](https://adadvisor.ai/blog/how-to-run-facebook-ads-on-a-tight-budget-in-2026) | 2026 | Práctica |
| [AdAdvisor: A/B testing](https://adadvisor.ai/docs/learn/ab-testing) | Sin fecha | Práctica |
| [Madgicx: estrategias de compra](https://madgicx.com/answers/which-media-buying-strategies-work-on-meta) | Sin fecha | Práctica |
| [Madgicx: programar anuncios](https://madgicx.com/answers/how-to-schedule-ads-in-meta-ads-manager) | Sin fecha | Práctica |
| [Madgicx Academy: automatizaciones](https://academy.madgicx.com/lessons/introduction-madgicx-automations) | Sin fecha | Práctica |
| [Madgicx roadmap](https://roadmap.madgicx.com/changelog/11186) | Sin fecha | Práctica |
| [GrowthSpree: estructura B2B SaaS 2026](https://www.growthspreeofficial.com/blogs/meta-ads-campaign-structure-b2b-saas-2026) | 2026 | Práctica |
| [GrowthSpree: creativos B2B SaaS 2026](https://www.growthspreeofficial.com/blogs/meta-ad-creative-b2b-saas-2026) | 17 oct 2026 | Práctica |
| [GrowthSpree: benchmarks B2B 2026](https://www.growthspreeofficial.com/blogs/meta-ads-benchmarks-2026-b2b-saas-b2b-cpm-cpc-cpl-vertical) | 22 may 2026 | Práctica |
| [GrowthSpree: segmentación B2B 2026](https://www.growthspreeofficial.com/blogs/meta-ads-audience-targeting-b2b-saas-2026) | 2026 | Práctica |
| [GrowthSpree: Meta Ads B2B SaaS 2026](https://www.growthspreeofficial.com/blogs/meta-ads-for-b2b-saas-2026) | 2026 | Práctica |
| [Segwise: gestionar Meta Ads](https://segwise.ai/blog/how-to-manage-meta-ads-guide) | 2026 | Práctica |
| [Segwise: medir fatiga creativa](https://segwise.ai/blog/how-to-measure-creative-fatigue.md) | Sin fecha | Práctica |
| [Segwise: qué es la fatiga creativa](https://segwise.ai/blog/what-is-ad-creative-fatigue) | Sin fecha | Práctica |
| [Segwise: frecuencia de refresco](https://segwise.ai/blog/how-often-refresh-ad-creatives) | Sin fecha | Práctica |
| [Segwise: generadores de anuncios IA 2026](https://segwise.ai/blog/ai-ad-generators-2026-performance-marketer-guide.md) | 2026 | Práctica (académico vía secundaria) |
| [Soku: Meta Andromeda](https://soku.ai/blog/meta-andromeda) | Sin fecha | Práctica |
| [AdsUploader: Andromeda](https://adsuploader.com/blog/meta-andromeda) | Sin fecha | Práctica |
| [AdsUploader: fatiga](https://adsuploader.com/blog/facebook-ad-fatigue) | Sin fecha | Práctica |
| [AdsUploader: segmentación](https://adsuploader.com/blog/meta-audience-targeting) | Sin fecha | Práctica |
| [Chatterbuzz: Andromeda](https://www.chatterbuzzmedia.com/blog/meta-andromeda-creative-targeting/) | 2026 | Práctica |
| [PPC Blog Pro: duplicación](https://ppcblogpro.com/how-andromeda-detects-and-punishes-ad-duplication/) | Sin fecha | Práctica (cuestionada) |
| [LP Agency: paid social 2026](https://lp.agency/blog/the-2026-paid-social-playbook) | 2026 | Práctica |
| [Motion/Runneth: volumen por nivel 2026](https://runneth.com/library/research/creative-benchmarks-2026/testing-volume-by-tier) | 2026 | Práctica |
| [Motion: volumen vs ganadores 2026](https://motionapp.com/library/research/creative-benchmarks-2026/volume-vs-winners) | 2026 | Práctica |
| [Superads: refresco creativo](https://www.superads.ai/blog/creative-refresh-cadence) | Jul 2026 | Práctica |
| [Superads: CPM Colombia](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/colombia) | 2025–2026 (periodo ambiguo) | Práctica |
| [Superads: CPC software/IT Colombia](https://www.superads.ai/facebook-ads-costs/cpc-cost-per-click/software-and-it-services/colombia) | 2025–2026 | Práctica |
| [TripleDart: detección de fatiga](https://www.tripledart.com/blog/claude-meta-ads-creative-fatigue-detection) | Sin fecha | Práctica |
| [Cangrejo Digital (Colombia)](https://cangrejodigital.com/?p=14566) | Sin fecha | Práctica |
| [BrightBid: B2B Meta Ads 2026](https://brightbid.com/blog/b2b-meta-ads-strategy-2026) | 13 feb 2026 | Práctica |
| [Linear Design: segmentación detallada](https://lineardesign.com/blog/facebook-detailed-targeting-list-2024/) | 2024 | Práctica |
| [SearchLab: LinkedIn vs Meta B2B](https://searchlab.nl/en/compare/linkedin-ads-vs-meta-ads-b2b) | 17 mar 2026 | Práctica |
| [Enrich Labs: segmentación y pujas 2026](https://www.enrichlabs.ai/blog/meta-ads-targeting-and-bidding-strategies-2026) | 2026 | Práctica |
| [Enrich Labs: WhatsApp advertising 2026](https://www.enrichlabs.ai/blog/whatsapp-advertising-complete-guide-2026) | 2026 | Práctica |
| [ChatMaxima: CTWA playbook 2026](https://chatmaxima.com/blog/2026-click-to-whatsapp-ads-playbook/) | 2026 | Práctica |
| [CustomerLabs: CTWA y "chatters"](https://www.customerlabs.com/blog/why-meta-algorithm-chases-chatters-not-buyers-for-ctwa-ads) | Sin fecha | Práctica |
| [CustomerLabs: EMQ](https://customerlabs.com/blog/improve-your-event-match-quality-from-ok-to-great/) | Sin fecha | Práctica |
| [WeltPixel: EMQ](https://www.weltpixel.com/blogs/news/meta-event-match-quality-emq-guide) | Sin fecha | Práctica |
| [Usercentrics: EMQ](https://usercentrics.com/knowledge-hub/improve-meta-event-match-quality-score/) | Sin fecha | Práctica |
| [Click Here Digital: lead optimization](https://www.clickheredigital.com/insights/meta-shift-to-lead-optimization) | Sin fecha | Práctica |
| [Make: Meta CAPI for CRM](https://www.make.com/en/blog/meta-make-conversions-api-for-crm) | 2025 | Práctica (cita datos de Meta) |
| [Zapier: Meta guide to better lead quality](https://zapier.com/blog/meta-guide-to-better-lead-quality/) | 2025 | Práctica (cita datos de Meta) |
| [Datahash: Meta CAPI for CRM](https://support.datahash.com/portal/en/kb/articles/meta-capi-for-crm) | Sin fecha | Práctica |
| [EasyInsights: lead gen 2026](https://easyinsights.ai/blog/lead-gen-shifts-profitable-meta-ads-2026/) | 2026 | Práctica |
| [Zapier help: Offline conversions](https://ob-zapier.helpjuice.com/changes-impacting-facebook-offline-conversions-users) | 2025 | Práctica |
| [Dataslayer: ventana de atribución 2026](https://dataslayer.ai/blog/meta-ads-attribution-window-removed-january-2026) | 2026 | Práctica |
| [Supermetrics: limitaciones del 12 ene 2026](https://docs.supermetrics.com/docs/facebook-ads-new-historical-limitations-attribution-window-and-metric-removals-january-12-2026.md) | 2026 | Práctica |
| [Dataslayer (es): automatización total](https://www.dataslayer.ai/es/blog/metas-vision-for-full-ad-automation-what-the-goal-only-system-means-for-marketers-in-2026) | 2026 | Práctica |
| [Evan Miller: calculadora de muestra](https://www.evanmiller.org/ab-testing/sample-size.html) | Sin fecha | Práctica (referencia estadística) |
| [Wikipedia: intervalo de proporción binomial](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval) | Sin fecha | Práctica (referencia estadística) |
| [GrowWithSakib: A/B en Meta](https://growwithsakib.com/meta-ads-ab-testing/) | Sin fecha | Práctica |
| [TikTok Ads Help: split test](https://ads.tiktok.com/help/article/split-test-best-practices) | Sin fecha | Oficial de TikTok (referencia) |
| [TikTok Ads Help: reglas automatizadas](https://ads.tiktok.com/resources/help/article/faqs-for-automated-rules) | Sin fecha | Oficial de TikTok (referencia) |
| [Kameleoon: detener tests temprano](https://www.kameleoon.com/blog/stopping-ab-tests-too-early) | Sin fecha | Práctica |
| [Prospeo: costo de lead gen 2026](https://prospeo.io/s/lead-generation-services-cost) | 2026 | Práctica |
| [Flighted: benchmarks por industria](https://www.flighted.co/blog/meta-ads-performance-benchmarks-by-industry) | 2026 | Práctica |
| [ContentStudio: benchmarks Meta](https://contentstudio.io/blog/meta-ads-benchmarks) | 2026 | Práctica |
| [Aimerce: USD 10/día](https://www.aimerce.ai/blogs/is-10-a-day-enough-to-get-purchases-on-meta-ads) | Sin fecha | Práctica |
| [PodVector: presupuesto mínimo](https://podvector.ai/articles/ads/scaling-and-diagnosis/meta-ads-minimum-daily-budget-official) | Sin fecha | Práctica (contradictoria) |
| [TryVizup: presupuesto mínimo 2026](https://www.tryvizup.com/blog/meta-ads-minimum-budget-requirements-2026) | 2026 | Práctica (contradictoria) |
| [Extuitive: presupuesto mínimo de testeo](https://extuitive.com/articles/meta-ads-minimum-budget-for-testing) | Sin fecha | Práctica (proveedor) |
| [Search Engine Land: video IA de Meta](https://searchengineland.com/meta-generative-ai-video-advertising-tools-447367) | Jun 2025 | Práctica (prensa) |
| [MarTech: video IA de Meta](https://martech.org/metas-announces-genai-video-tools-for-advertisers/) | Jun 2025 | Práctica (prensa) |
| [TechJuice: Advertising Week 2026](https://www.techjuice.pk/meta-ai-advertising-tools-advertising-week-2026/) | 6 oct 2026 | Práctica (prensa) |
| [eMarketer: GenAI y confianza](https://www.emarketer.com/content/meta-ramps-up-genai-powered-ad-creation-marketers-weigh-consumer-trust) | 2026 | Práctica (prensa) |
| [Campaign Asia: automatización total 2026](https://www.campaignasia.com/article/meta-aims-to-fully-automate-ad-creation-with-ai-by-2026/502831) | Jun 2025 | Práctica (prensa) |
| [MediaPost: automatización total](https://www.mediapost.com/publications/article/406315/) | Jun 2025 | Práctica (prensa) |
| [Quartz: automatización total](https://qz.com/gateway/meta-fully-automate-ai-advertising-2026-1851783320) | Jun 2025 | Práctica (prensa) |
| [Campaign: ecosistema creativo IA (Cannes 2026)](https://campaignlive.com/article/meta-launches-complete-ai-creative-ad-ecosystem/1962693) | Jun 2026 | Práctica (prensa) |
| [Retail Dive: Business AI y herramientas creativas](https://www.retaildive.com/news/meta-streamlines-ai-use-brands-new-business-agent-creative-tools/802255) | 2025–2026 | Práctica (prensa) |
| [Nutech Digital: Advantage+ y divulgación IA](https://nutechdigital.com/?p=277678) | Jun 2026 | Práctica (fuente débil) |
| [mcp.directory: Meta Ads CLI y MCP](https://mcp.directory/blog/meta-ads-cli-mcp) | May 2026 | Práctica (guía técnica) |
| [Relevant Audience: MCP abierto a desarrolladores](https://www.relevantaudience.com/meta/meta-ads-mcp-open-to-developers/) | Jul 2026 | Práctica |
| [Dataiads: IA generativa visual (NYU/Emory)](https://www.dataiads.io/en/blog/impact-of-visual-generative-ai-on-advertising-effectiveness-2025) | 2025 | Práctica (académico vía secundaria) |
| [Cropink: reglas automatizadas de Meta](https://cropink.com/meta-automated-rules) | 11 mar 2026 | Práctica |
| [Netpeak: reglas automatizadas](https://netpeak.us/blog/how-to-set-up-automated-rules-in-meta-ads/) | Sin fecha | Práctica |
| [Bïrch: reglas avanzadas](https://bir.ch/birch-course/advanced-tips-for-automated-rules) | Sin fecha | Práctica |
| [TheOptimizer: plantillas de reglas](https://theoptimizer.io/docs/automation/rule-templates) | Sin fecha | Práctica |
| [HBR: The Short Life of Online Sales Leads](https://hbr.org/2011/03/the-short-life-of-online-sales-leads) | Mar 2011 | Práctica (académico, antiguo) |
| [BIK.ai: precios de WhatsApp](https://help.bik.ai/en/articles/12699299-whatsapp-business-platform-pricing-guide-for-ecommerce-merchants) | Sin fecha | Práctica |
| [Courier: precios de WhatsApp](https://www.courier.com/guides/whatsapp-pricing) | Sin fecha | Práctica |
| [Wati: conectar número a páginas](https://support.wati.io/en/articles/11463158-how-to-connect-your-whatsapp-phone-number-to-facebook-and-instagram-pages) | Sin fecha | Práctica |
| [Wati: CTWA vs formularios](https://www.wati.io/en/blog/click-to-whatsapp-ads-vs-lead-form-ads-roas/) | Sin fecha | Práctica |
| [360dialog: vincular página y API](https://docs.360dialog.com/docs/whatsapp-marketing/fb-page-whatsapp-api-linking) | Sin fecha | Práctica |
| [360dialog: vincular WABA a página](https://docs.360dialog.com/partner/~/changes/xcA8qeNG4V8gwNXA8MVc/account-management/driving-users-to-whatsapp/linking-a-waba-to-a-facebook-page) | Sin fecha | Práctica |
| [ChatArchitect: activos conectados](https://support.chatarchitect.com/books/meta-business-portfolio-setup/page/about-connected-business-assets/export/plaintext) | Sin fecha | Práctica |
| [AWS End User Messaging: Conversions API](https://docs.aws.amazon.com/social-messaging/latest/userguide/conversions-api.html) | Sin fecha | Práctica (proveedor) |
| [Zernio: CTWA](https://docs.zernio.com/platforms/whatsapp/ctwa) | Sin fecha | Práctica |
| [docs.rs: crate late (referral)](https://docs.rs/crate/late/latest/source/src/models/webhook_payload_message_metadata_referral.rs) | Sin fecha | Práctica |
| [GitHub evolution-api #2645](https://github.com/evolution-foundation/evolution-api/issues/2645) | Sin fecha | Práctica |
| [AsisteClick: CTWA 2026](https://asisteclick.com/en/blog/click-to-whatsapp-ads-ctwa-conversion-2026) | 2026 | Práctica (proveedor) |
| [MessageCentral: CTWA Brasil](https://www.messagecentral.com/blog/click-to-whatsapp-ads-brazil) | Sin fecha | Práctica (proveedor) |
| [Neorev: CTWA](https://neorev.it.com/blog/click-to-whatsapp-ads/) | Sin fecha | Práctica (proveedor) |
| [AuditSocials: políticas 2026](https://www.auditsocials.com/blog/meta-ad-misleading-claims-personal-attributes-prohibited-content-policy-2026) | 2026 | Práctica (no confirmada por Meta) |
| [Vanguardia: multa a Movistar](https://www.vanguardia.com/colombia/2025/10/29/multa-millonaria-a-movistar-por-bombardear-a-usuarios-con-llamadas-y-mensajes/) | 29 oct 2025 | Práctica (prensa) |
| [Noticias RCN: SIC vs Movistar](https://www.noticiasrcn.com/colombia/sic-sanciona-a-movistar-por-uso-indebido-de-datos-personales-953778) | Oct 2025 | Práctica (prensa) |
| [Asuntos Legales: multa a Claro](https://www.asuntoslegales.com.co/actualidad/la-sic-impuso-una-multa-por-1-306-millones-a-claro-por-recopilar-numeros-telefonicos-3652415) | Fecha no clara | Práctica (prensa) |
| [Asuntos Legales: cambios de la Ley 2300 (Serrano Rey)](https://www.asuntoslegales.com.co/analisis/manuel-serrano-rey-3340544/principales-cambios-ley-2300-de-2023-sobre-comunicaciones-comerciales-3748648) | 15 nov 2023 | Práctica (análisis jurídico) |
| [Asuntos Legales: consultorio Ley 2300](https://www.asuntoslegales.com.co/consultorio/las-implicaciones-de-la-ley-2300-de-2023-ley-dejen-de-fregar-3715985) | 2023–2024 | Práctica (análisis jurídico) |
| [Olarte Moure: Circular 001 de 2024](https://olartemoure.com/en/law-regulated-for-contacting-consumers/) | 5 jul 2024 | Práctica (análisis jurídico) |
| [CCB: datos personales y Ley 2300](https://www.ccb.org.co/blog/informacion-importante-sobre-proteccion-de-datos-personales-y-ley-2300-de-2023) | Sin fecha | Práctica |
| [Forvis Mazars: Ley 2300](https://www.forvismazars.com/co/es/acerca-de-nosotros/noticias-publicaciones-y-media/nuestras-publicaciones/actualidad-juridica-y-tributaria/2024/conozca-la-ley-2300-de-2023) | 2024 | Práctica (análisis jurídico) |
