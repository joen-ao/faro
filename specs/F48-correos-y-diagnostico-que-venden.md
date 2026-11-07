# F48 · Correos y página de diagnóstico que venden

**Prioridad:** P0. El envío diario quedó pausado el 2026-11-06 (`daily_outreach.setting.enabled=false`) hasta cerrar este spec.
**Origen:** el dueño recibió la observación de que los correos y las páginas `/d` "no venden por falta de estrategia de ventas y copywriting". Los datos lo confirman.
**Investigación:** `docs/research/cold-email-b2b-que-vende.md`, de 2026-11-06, con fuentes. Casi todos los benchmarks vienen de proveedores (Instantly, Belkins, Hunter, Gong) y ninguno es colombiano, así que los primeros 600–900 envíos serán el benchmark real de Mokub.

## Idea central
El hallazgo es el mensaje, el diagnóstico es lo que se gana al responder, y la reunión ocurre en WhatsApp, donde el propio agente demuestra el producto.

Hoy funciona al revés: el diagnóstico va enlazado en el primer correo como sustituto de una conversación, llega vacío y sale por un canal que prohíbe el correo frío.

## Lo que muestran los datos (producción, 18 oct – 6 nov 2026)

| Paso | Cantidad | Nota |
|---|---|---|
| Correos intentados | 417 | |
| Bloqueados por cumplimiento | 48 | |
| Fallidos | 10 | ≈3 % de los enviados |
| Entregados confirmados | 281 | Faltan 80 del lote del 6 nov, sin confirmar todavía |
| Clics al diagnóstico | 7 | 2,5 % |
| Respuestas | 1 | 0,4 %. Benchmarks: Belkins 0,45 %, Instantly 3,4 % en promedio, top cuartil ≥5,5 % |
| Reuniones reales | 0 | Referencia: 0,5–2,5 % de los enviados. Con 369 envíos todavía no es concluyente |

**Lectura:** 2,5 % de clics con 0,4 % de respuestas coincide con un enlace que se queda con la respuesta. La persona mira la página y se va.

## Por qué no vende

### El correo (ejemplo real: "Agente de IA en WhatsApp para Santorini")
1. **La oferta no le sirve al negocio.** A una transportadora que salió de SECOP le ofrecimos un agente que agenda citas. `match.ts` no mira si el sector tiene ese dolor. La falta de relevancia es la primera razón para no responder (71 %, Hunter).
2. **No hay hallazgo.** La primera frase repite el nombre y el sector de la empresa, que es la personalización que menos funciona.
3. **La prueba no conecta.** Usamos el caso del Banco de la República para vender un agente de WhatsApp.
4. **Pone el precio y la lista de servicios en el primer contacto.**
5. **El texto legal pesa más que la propuesta.** Además dice "único mensaje, sin seguimientos", y los seguimientos traen entre el 42 % y el 59 % de las respuestas y el paso 3 trae el 36 % de las reuniones (Belkins).
6. **No hay una persona ni una pregunta.** Firma "Mokub · Bogotá" y además "Faro · Bogotá".
7. **El enlace va a `faro-eight-sage.vercel.app`.** Es un dominio compartido que algunas reglas de seguridad marcan en correos no solicitados.
8. **El asunto es un anuncio.**

### La página `/d` (ejemplo real: `/d/az7jxbqe`)
1. **Llega vacía:** muestra "0 oportunidades" y cuatro bloques "Sin dato". Dice lo contrario de lo que promete el correo.
2. **No hay prueba ni una persona real.**
3. **Tiene muchas salidas:** WhatsApp aparece tres veces, además de un formulario largo y "No me interesa". Con una sola CTA convierte 13,5 %; con tres o más, 10,5 %.
4. **El responsable legal dice "Faro - proyecto de 30x"**, lo que incumple el espíritu del Decreto 1377.

### La infraestructura
1. **La política de Resend prohíbe el correo frío** ("cold outreach, purchased lists, or scraped contact data"). Puede cerrar la cuenta sin aviso si los rebotes pasan del 4 % o las quejas del 0,08 %. Eso pondría en riesgo también el correo transaccional de Faro.

## Cambios

### A · Bloqueantes de infraestructura (antes de reactivar)
1. **Sacar el correo frío de Resend.**
   - Resend queda solo para transaccional y opt-in.
   - El outreach sale de 2–3 buzones de Google Workspace (o M365) en un subdominio dedicado de mokub.co (por ejemplo `hola.mokub.co`), con la API de Gmail y ritmo controlado desde Faro.
   - Configuración del dominio: SPF, DKIM de 2048 bits, DMARC `p=none` con `rua`, From alineado y List-Unsubscribe de un clic (RFC 8058), más la frase de baja visible en el cuerpo.
   - Rampa de 3 semanas por buzón: 5–10 → 15 → 20–30 por día.
   - Si algún día se pasa de ~150 al día, se usa un dominio secundario.
2. **Dominio propio para `/d`:** `diagnostico.mokub.co` apuntando a Vercel. Ningún enlace a `*.vercel.app` en los correos.
3. **Correo en texto plano,** sin pixel de apertura, sin imágenes y con un enlace como máximo, sin tracking.
4. **Verificación de la lista** antes de cada lote:
   - verificador de correos y catch-all aislados;
   - meta de rebote duro < 1–2 % y entrega ≥ 97 %;
   - pausa automática si el día cierra con rebote > 3 % o con ≥1 queja.

### B · Solo se escribe cuando hay algo verdadero que decir (segmentación)
1. **Sin hallazgo no hay correo.** Un lead entra al envío diario solo si:
   - su sitio fue revisado y tiene al menos un hallazgo concreto de `findings.ts`; o
   - no tiene web y su sector la necesita. En ese caso, el hallazgo es la comparación con 2–3 competidores locales que sí la tienen.

   Los leads con `site-unreviewed` se revisan primero o quedan fuera, y la razón queda registrada.
2. **Tabla sector → dolor → oferta** (`features/offer/fit.ts`):
   - el agente que agenda va para salud, belleza, educación y servicios con citas;
   - automatizaciones y software van para logística, proveedores del Estado y procesos repetitivos;
   - si el sector no está en la tabla, no se envía. `match.ts` la consulta primero.
3. **Prueba por servicio, del sector y del país.** Si no hay prueba, se usa el propio diagnóstico o la demo en vivo ("escríbale a nuestro agente al +57 301 473 4934 y vea cómo responde"). Nunca una prueba sin relación.
4. **Lotes de 50 por sector,** empezando por los leads con el hallazgo más fuerte, para que las primeras respuestas construyan la reputación del buzón. Benchmark: los lotes pequeños responden ~3 veces más que los masivos (Hunter).

### C · El primer correo: hallazgo, consecuencia y pregunta
**Asunto:** 2 a 4 palabras sobre el hallazgo, no sobre el producto ("citas en {dominio}", "su formulario web"). No es obligatorio poner el nombre de la empresa ni escribir en minúscula: no hay evidencia a favor y un test encontró 11 % menos respuestas con todo en minúscula.

**Cuerpo, en 50–90 palabras y con "usted":**
1. **Observación:** el hallazgo real en una frase ("Entré a {dominio} y no encontré cómo agendar sin llamar").
2. **Consecuencia:** lo que le cuesta, en el lenguaje de su sector.
3. **Prueba:** una frase con la prueba del servicio o la demo.
4. **Pregunta de interés.** Variante principal sin enlace: "Le preparé un diagnóstico de una página con 3 hallazgos de {dominio}. ¿Se lo envío por aquí o por WhatsApp?". El CTA de interés le gana al de reunión en frío (Gong).
5. **Firma de una persona:** nombre, cargo y celular.

**Sin precio, sin lista de servicios y sin halagos.**

**Pie legal compacto,** de 1–2 líneas desde una plantilla fija:
- Mokub con razón social, NIT y ciudad;
- de dónde salió el dato;
- enlace a la política de tratamiento;
- "Responda BAJA para no recibir más".

**El modelo escribe solo el asunto, la observación y la consecuencia,** a partir de hallazgos estructurados, con ejemplos buenos y malos. Un verificador rechaza el borrador y lo regenera una vez si:
- nombra un precio;
- pasa de 90 palabras;
- no termina en pregunta;
- usa una prueba que no está en el payload;
- la primera frase no contiene un hallazgo del payload;
- usa "tú";
- tiene adjetivos de marketing o halagos genéricos.

**A/B 1:** sin enlace (A) contra PD con enlace a `/d` (B). Un A/B de Overloop vio caer la respuesta de 9,4 % a 5,1 % con URL en el primer correo.

### D · Secuencia de 4 toques en 4 semanas (Ley 2300)
| Semana | Toque |
|---|---|
| S1 | Correo con hallazgo y pregunta. |
| S2 | Respuesta en el mismo hilo, con el enlace a `/d` y un hallazgo destacado. Un seguimiento en el mismo hilo rinde ~30 % más. |
| S3 | Ángulo nuevo, como el costo de los mensajes sin respuesta fuera de horario o una demo de 60 s. Si hubo clic y el número de la empresa es público, va por WhatsApp en vez de correo, sujeto a D3. |
| S4 | Cierre corto o pedido de referido. |

1. **La secuencia se detiene** ante respuesta, baja, rebote o queja.
2. **Cumplimiento en el programador** (se cumple como si la Ley 2300 aplicara a B2B; no está resuelto):
   - lunes a viernes de 7:00 a 19:00 y sábados de 8:00 a 15:00, hora de Colombia;
   - nunca domingos ni festivos (calendario incluido);
   - un canal por semana y como máximo un contacto por día por empresa;
   - consulta al **Registro de Números Excluidos (RNE)** del correo y del número antes de cada lote, guardando la evidencia (Resolución CRC 7356/2024, Circular SIC 001/2024);
   - lista de supresión compartida entre correo y WhatsApp;
   - trazabilidad por contacto: fuente, fecha, consulta RNE, envíos y baja.
3. **WhatsApp en frío** solo después de una señal de interés (clic o respuesta), y solo si la política vigente de Meta lo permite (pendiente de verificar).

### E · La página `/d` como página de venta
1. **Plantillas según los datos que haya:**
   - con web: 1–3 hallazgos con captura, severidad y lo que se resolvería en la llamada;
   - solo con ficha de Google o redes: hallazgos de esos canales;
   - sin presencia: comparación con 2–3 competidores locales con nombre y checks de sí o no.
2. **Prohibido** mostrar "0 oportunidades" o "Sin dato". "Usted frente a su competencia" se muestra desde 2–3 competidores con checks simples.
3. **Primera pantalla en el celular:** el nombre del negocio, el hallazgo principal y el botón. El 57 % de la lectura ocurre en la primera pantalla.
4. **Una sola acción principal:** WhatsApp con el mensaje prellenado que ya existe. El agente propone horarios reales, así que el botón es también la demo.
   - "Agendar 20 min" queda como enlace secundario discreto.
   - El formulario largo sale de la página.
   - "No me interesa" pasa a texto en el pie.
   - **A/B 2 en escritorio:** calendario como principal contra WhatsApp.
5. **Prueba visible:** el caso del servicio o la demo del agente.
6. **Confianza y requisitos legales (Decreto 1377, art. 15):**
   - quién firma, con foto y nombre;
   - Mokub con razón social, NIT, ciudad, correo y WhatsApp;
   - enlace a la política de tratamiento;
   - una línea "Datos públicos de {Negocio} revisados el {fecha}".
   - Se quita "Faro - proyecto de 30x".

### F · Medición y reactivación
1. **Prueba antes de reactivar:**
   - se generan 15 correos y 5 páginas para leads reales de sectores distintos;
   - el dueño los revisa junto con un juez que puntúa especificidad, relevancia, credibilidad, pregunta, tono y "usted";
   - se reactiva solo con su aprobación.
2. **Métricas, sin clics como meta** (premian el enlace que se come las respuestas):
   - respuesta total ≥ 2–3 % y respuesta positiva ≥ 1 %;
   - reuniones por cada 100 entregados;
   - visitas a `/d` → conversación de WhatsApp.

   El tablero (F43) suma "respuesta positiva", que se clasifica al recibir la respuesta (F27).
3. **No se compara un A/B** con menos de 150–200 envíos por variante.
4. **Regla de corte:** si después de 300 envíos la respuesta positiva queda por debajo de 0,5 %, se revisan la segmentación y la oferta antes de seguir.

## Lo que decide el dueño
1. **Quién firma:** nombre, cargo, celular y foto.
2. **Pruebas reales por servicio**, o se usa la demo en vivo.
3. **Sectores prioritarios** para las próximas 4 semanas (2 o 3).
4. **Buzones:** comprar Google Workspace (2–3 buzones) o M365, y el subdominio de envío.
5. **Razón social y NIT** de Mokub para los pies legales.
6. **Legal:** que un abogado colombiano valide si la Ley 2300 aplica a B2B y el texto literal de la regla de frecuencia. Mientras tanto, se cumple como si aplicara.

## Decisiones del dueño (2026-11-06)
1. **Firma: "Mokub",** sin persona. El correo cierra con "Equipo de Mokub", el celular +57 301 473 4934 y mokub.co.
2. **Pruebas:** solo los proyectos reales que están en "Tu oferta", reasignadas al servicio que corresponde:
   - **Automatización (flujo y mapa):** proceso crítico del Banco de la República, de 30 h a 15 min.
   - **Asistente con documentos (RAG):** call center farmacéutico con dominio de seguridad del paciente.
   - **Software y CRM:** CRM B2B con agentes de IA (Nirbound) y sistema con 5 módulos de IA (KOS).
   - **Agente de WhatsApp:** "más de 15 proyectos en producción" y la demo en vivo, que es el mismo número (+57 301 473 4934). El caso del Banco de la República deja de usarse aquí.
   - **Webs:** la demo en vivo y "más de 15 proyectos en producción"; no hay caso propio.
3. **Sectores** (recomendación de Claude, aceptada). Con los datos actuales:
   - **Salud: clínicas odontológicas y consultorios.** Agente de WhatsApp que agenda, y web si no tiene. Son 9.219 leads; el dolor de agendar y responder fuera de horario es claro.
   - **Contabilidad y asesoría tributaria.** Automatización de procesos repetitivos y asistente con documentos para las preguntas frecuentes. Son 6.235 leads; los casos del Banco de la República y del RAG encajan.
   - **Fuera por ahora:** "supply chain y field service" (14.821 leads RUES sin web, ningún hallazgo posible y oferta poco clara para el primer contacto) y los nichos de prueba (bioimpresión, psiquiatría con IA y otros).
4. **Canal:** sigue Resend por ahora y se cambia a buzones propios la semana del 2026-11-09. El riesgo es que Resend puede cerrar la cuenta. Mientras tanto:
   - volumen bajo (≤ 40 al día);
   - variante principal sin enlace;
   - pausa automática ante rebote > 3 % o cualquier queja;
   - A1 se mantiene como criterio antes de subir el volumen.
5. **Razón social y NIT:** Mokub, NIT 1001975274-1.
6. **Ley 2300:** se trata como aplicable (D2 es obligatorio).

**Consecuencia de los datos para B1:** solo ~230 de ~50.000 leads tienen web registrada, porque el RUES no trae ese dato. "No tiene web" no se puede afirmar solo porque el registro no la muestra. Antes de usarlo como hallazgo, el lead pasa por el enriquecimiento de Google Places (sitio, teléfono, WhatsApp y competidores cercanos):
- si Places encuentra web, esta se revisa y se usan sus hallazgos;
- si Places no la encuentra, el hallazgo es "no aparece web en Google Maps", con la comparación de competidores;
- si no hay ficha en Places, no hay correo.

**RNE:** consultar el Registro de Números Excluidos exige registrarse ante la CRC como remitente. Hasta que el dueño lo haga:
- solo se escribe a correos genéricos de la empresa (info@, contacto@ y similares);
- se excluyen los correos de personas naturales y de independientes;
- la tarea queda abierta para el dueño.

## No-alcance
- Cambiar la búsqueda de leads (F06) o las fuentes.
- Rediseño visual completo de `/d`: se reorganiza el contenido sobre los componentes actuales.
- Plantillas de WhatsApp de marketing (F45), que se revisan aparte.

## Criterios de aceptación
1. **Ningún correo frío sale por Resend.** Los envíos salen de los buzones del subdominio, con SPF, DKIM y DMARC verificados.
2. **Sin enlaces a `*.vercel.app`:** cero en correos, y `/d` responde en `diagnostico.mokub.co`.
3. **Sin hallazgo no hay correo:** un lead sin hallazgo no se encola y su razón queda registrada. Un lead de logística nunca recibe el agente de citas.
4. **El verificador funciona:** el correo generado pasa todas las reglas de C, y un borrador malo se regenera.
5. **El programador cumple la ley:** no envía fuera de horario ni en festivos, ni dos canales en la misma semana. Consulta el RNE antes de cada lote y guarda la evidencia.
6. **La secuencia se detiene sola** ante respuesta, baja, rebote o queja, y la pausa automática se activa con los umbrales de A4.
7. **`/d` sin bloques vacíos:** nunca muestra "0 oportunidades" ni "Sin dato", tiene una sola acción principal e identifica a Mokub con NIT.
8. **Revisión previa:** el lote de prueba (15 + 5) pasa la revisión del dueño antes de reactivar.
9. `npm run check` pasa.
