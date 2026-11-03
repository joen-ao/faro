# F37 · Agente de Dapta como vendedor de Mokub, con agenda en Google Meet

**Prioridad:** P0. **Contexto:** el equipo empieza a mandar correos y WhatsApp a prospectos. El objetivo es vender los productos de Mokub o agendar el **diagnóstico gratis de 20 minutos por videollamada**, como en mokub.co.

Hoy el agente "Faro · Calificador de negocios" (`4ec9ad86-d314-45d7-9088-6f85aa2fbf1c`, workspace comti):
- se presenta como "asistente de Faro, proyecto del 30X Hackathon";
- tiene una descripción de empresa de clínicas odontológicas;
- solo califica y responde "el equipo le escribirá".

Además, la única plantilla aprobada es la de clínicas, a nombre de Faro y del hackathon, y no hay ningún calendario conectado.

**Decisiones del dueño (2026-11-03):**
1. Se usa **el mismo número** de WhatsApp (línea Faro-hack-30x, la conectada al agente).
2. Las **plantillas las prepara Claude**: textos y creación en el panel de Dapta.
3. El agente **vende todos los productos de Mokub**.

El agente "Diana" no se toca.

## Fuente de verdad del catálogo
Los precios y productos salen de **mokub.co/es** y **web.mokub.co**, leídos el 2026-11-03. "Tu oferta" en Faro está desactualizada (por ejemplo, el agente de IA figura en "450usd") y se actualiza con esta misma tabla. Así el copiloto de pauta, el diagnóstico y el agente dicen lo mismo.

| Producto | Precio (COP) | Notas |
|---|---|---|
| Mapa de automatización | $390.000 | Diagnóstico pagado de qué automatizar, con plazo y precio; se descuenta del proyecto |
| Agente de IA en WhatsApp | desde $1.490.000 + $290.000/mes | Atiende y agenda con los sistemas del cliente; la mensualidad cubre IA y soporte |
| Landing + agente de IA | desde $2.490.000 + $290.000/mes | |
| Flujo de automatización | desde $1.490.000 | 1 proceso, hasta 3 integraciones |
| Asistente con tus documentos (RAG), piloto | desde $4.900.000 + $490.000/mes | |
| Software y CRM a medida | desde $9.500.000 | Primer módulo funcionando en 4–6 semanas |
| Sprint de software | $955.000 | Descubrimiento de bajo riesgo; se descuenta del proyecto |
| Web Esencial | $1.390.000 | 1 página, textos, botón de WhatsApp, Google y Maps; 5 días hábiles |
| Web Completa | $2.490.000 | Hasta 5 páginas, animaciones y 1 mes de cambios; 10 días hábiles; recomendada para clínicas y spas |
| Web a medida | se cotiza en 24 h | Tienda, pagos, reservas |
| Mantenimiento web | $149.000/mes, opcional | |

**Condiciones:**
- Pago de la web: 50 % al empezar y 50 % al entregar.
- El dominio y el hosting los paga el cliente directo (USD 15–40 al año).
- Todo queda a nombre del cliente.
- No hay garantías de resultados.

## A. El agente: "Mokub · Ventas"
Es el mismo agente con nueva versión (se conserva el historial y el canal). El cambio pasa por `preview_update_text_agent`, después se muestra el diff y se hace `commit` solo con la aprobación del dueño. Luego se publica.

1. **Identidad:** "asistente del equipo de Mokub". Dice que es un asistente de IA si se lo preguntan, nunca se hace pasar por una persona y no menciona el hackathon. Se actualiza el contexto de empresa: Mokub, Bogotá, agentes de IA y software para ahorrar dinero y vender más, precio fijo, todo a nombre del cliente, equipo@mokub.co.
2. **Objetivo, en este orden:**
   1. Agendar el **Diagnóstico gratis · 20 min** por videollamada.
   2. Si el producto tiene precio cerrado (Web Esencial o Completa, Mapa de automatización, Sprint), **cerrar la venta**: confirmar el plan, pedir el nombre del negocio y el correo, y pasar a una persona del equipo para la factura y el primer pago. El agente no cobra ni manda links de pago.
3. **Recomendar el producto:** de la necesidad que cuenta la persona, el agente elige un producto y lo explica en una frase con su precio "desde".
   - No tiene sitio web o el sitio es viejo → Web Esencial o Completa.
   - Pierde clientes por no responder, o atiende y agenda por WhatsApp → Agente de IA en WhatsApp, o Landing + agente.
   - Tiene tareas repetitivas entre sistemas → Flujo de automatización o Mapa de automatización.
   - Tiene mucha información o documentos y preguntas frecuentes → Asistente con documentos (RAG).
   - Necesita un sistema propio → Sprint de software o Software/CRM a medida.
   - No sabe qué necesita → Diagnóstico gratis.
4. **Calificar sin frenar:** como máximo 3 preguntas antes de ofrecer horarios (necesidad, tipo de negocio, urgencia). Si la persona pide agendar, se agenda de una vez. El presupuesto no se pregunta, porque los precios son públicos.
5. **Tres tipos de entrada:**
   - Viene del diagnóstico de Faro: el mensaje trae "(ref. X)" y el nombre del negocio. Se guarda `ref_diagnostico` y no se pregunta lo que ya se sabe.
   - Responde a una plantilla saliente: se menciona el registro público solo si la conversación lo dice.
   - Llega por un anuncio, mokub.co o el botón de WhatsApp: se agradece y se pregunta qué necesita.
6. **Reglas:**
   - No inventar precios, descuentos ni resultados. Usar solo la tabla de arriba.
   - Para un caso que no encaja, el agente dice "eso se cotiza en el diagnóstico".
   - Responde solo de Mokub, sin asesoría médica, legal ni financiera.
   - Español neutro, trato de usted, máximo 3 frases por mensaje.
   - "BAJA", "STOP" o "no me interesa" cierran con respeto y marcan `pidio_baja`.
7. **Datos personales (Ley 1581):** para agendar, dCal exige nombre y correo. El agente los pide solo en ese momento, explica que son para enviar la invitación y pide autorización con un "sí". Nunca pide cédula ni datos de los clientes del negocio.
8. **Variables:**
   - se mantienen `calificado`, `pidio_baja`, `resumen` y `ref_diagnostico`;
   - nuevas:
     - `producto_interes`: uno de: mapa, agente_whatsapp, landing_agente, flujo, rag, software, sprint, web_esencial, web_completa, web_medida, no_sabe;
     - `reunion_agendada` (booleano);
     - `fecha_reunion` (texto ISO con zona horaria);
     - `quiere_comprar` (booleano, para el traspaso a una persona).
   - `calificado` = verdadero si agendó, si quiere comprar, o si hay necesidad clara con interés en los próximos 3 meses.
9. **Seguimiento:** se activa `followup_enabled` con **un solo** recordatorio, dentro de la ventana de 24 horas de WhatsApp, si la persona deja de responder a mitad de la conversación. Nunca se escribe después de una baja.
10. **Pruebas antes de publicar:** 6 conversaciones con `chat_with_text_agent`:
    - viene del diagnóstico;
    - sin sitio web, que debe terminar en Web Esencial;
    - pierde clientes por WhatsApp, que debe terminar en el agente;
    - pide precio de software;
    - pide "BAJA";
    - "quiero agendar".
    
    Las reservas de prueba se cancelan en dCal.

## B. Agenda con Google Meet (dCal)
Esta parte la hace el dueño en app.dcal.ai, porque la conexión de cuentas de Google no la puede hacer Claude:
1. Crear la cuenta dCal del workspace comti (admin u owner).
2. Conectar el Google Calendar del equipo, con la opción **"Add new events here"** activa.
3. Crear el evento **"Diagnóstico gratis · 20 min"**:
   - Location: **Online meeting**, para que cada reserva lleve su enlace de Meet;
   - zona horaria: Bogotá;
   - horario: L–V 9:00–17:00 o el que decida el equipo;
   - aviso mínimo: 2 horas.
4. Si el calendario de mokub.co usa otra herramienta, se conecta el mismo Google Calendar a dCal para no duplicar horarios.

Después, en el agente: **Agent Actions → Schedule appointments (Dapta Calendars)**, con ese evento, zona America/Bogota y la instrucción adicional "ofrece horarios después de entender la necesidad o si la persona pide agendar; antes de reservar confirma nombre, correo y la hora elegida". Luego se guarda y se publica.

dCal manda al cliente y al equipo el correo con la invitación y el enlace de Meet. Reprogramar o cancelar se hace desde ese correo.

## C. Plantillas de WhatsApp (Claude las crea en el panel de Dapta)
- Se crean en app.dapta.ai → Agents Studio → Message templates, en la línea Faro-hack-30x.
- Categoría MARKETING, idioma `es`.
- Mismas variables que espera Faro (F24): `nombre` en el cuerpo y `slug` en el botón de URL `https://faro-eight-sage.vercel.app/d/{{slug}}`.
- Cada una dice quién escribe, por qué tenemos el número y cómo darse de baja.
- Ninguna empieza ni termina con una variable (regla de Meta).

1. `mokub_diagnostico_empresa`, que reemplaza el borrador de `faro_diagnostico_empresa`:
   > Hola, {{nombre}}. Le escribe el equipo de Mokub. Encontramos su empresa en un registro público y preparamos un diagnóstico gratuito de su presencia digital: cómo la encuentran y cómo le escriben sus clientes. ¿Le gustaría verlo y, si le sirve, agendar una videollamada de 20 minutos? Si no desea recibir más mensajes, responda BAJA.
   
   Botones: URL "Ver diagnóstico" · respuesta rápida "Agendar llamada" · respuesta rápida "No me interesa".
2. `mokub_diagnostico_independiente`:
   > Hola, {{nombre}}. Le escribe el equipo de Mokub. Su negocio aparece en un registro público y preparamos un diagnóstico gratuito de cómo lo encuentran y le escriben sus clientes. ¿Le gustaría verlo? Si no desea recibir más mensajes, responda BAJA.
   
   Botones: URL "Ver diagnóstico" · "Agendar llamada" · "No me interesa".
3. `mokub_diagnostico_clinica`, que reemplaza la de Faro y el hackathon para leads con fuente REPS:
   > Hola, {{nombre}}. Le escribe el equipo de Mokub. Su clínica aparece en el registro público REPS y preparamos un diagnóstico gratuito de cómo atiende y agenda pacientes nuevos. ¿Le gustaría verlo? Si no desea recibir más mensajes, responda BAJA.
   
   Botones: URL "Ver diagnóstico" · "Agendar llamada" · "No me interesa".

En Faro, `templates.ts` toma los IDs nuevos:
- `DAPTA_WA_TEMPLATE_EMPRESA`, `DAPTA_WA_TEMPLATE_INDEPENDIENTE` y el nuevo `DAPTA_WA_TEMPLATE_CLINICA`, que reemplaza el ID fijo;
- el cuerpo guardado en cada mensaje es el aprobado.

Mientras Meta no apruebe una plantilla, Faro no la ofrece (`sendable`). La de Faro y el hackathon deja de usarse en cuanto se apruebe la de Mokub.

## D. Faro, para que todo cuadre
1. **Página de diagnóstico (`/d/*`):**
   - sin "proyecto del 30X Hackathon";
   - el que escribe es Mokub;
   - el mensaje prellenado de WhatsApp pasa a "Hola, vi el diagnóstico de {negocio} (ref. X) y quiero agendar el diagnóstico gratis". El agente sigue reconociendo el formato viejo.
2. **Webhook de Dapta:**
   - guarda `producto_interes`, `reunion_agendada`, `fecha_reunion` y `quiere_comprar` en la calificación;
   - una reunión agendada registra el evento `meeting_booked` y manda a Meta (CAPI) un evento `Schedule` con el mismo hash de correo y teléfono que `QualifiedLead`;
   - `quiere_comprar` crea un aviso para el equipo en Contacto.
3. **Correos (F25):** el botón del correo lleva al diagnóstico o al WhatsApp prellenado, para que la conversación y la agenda las tome el agente.
4. **Tu oferta:** se actualiza con la tabla de arriba.

## No-alcance
Cobrar o mandar links de pago desde el agente, llamadas de voz, otro número de WhatsApp, reprogramar por chat (se hace desde el correo de dCal) y tocar "Diana".

## Criterios de aceptación
1. En las 6 conversaciones de prueba, el agente habla como Mokub, recomienda el producto correcto con su precio real y agenda una reunión que llega con enlace de Meet al correo de prueba.
2. Una persona que pide "BAJA" no recibe nada más, y Faro la suprime.
3. Las tres plantillas de Mokub están enviadas a Meta. Faro solo envía las que están `sendable`.
4. En Faro, una reunión agendada aparece como evento del lead y como `Schedule` en el administrador de eventos de Meta.
5. Ningún texto público (agente, plantillas, `/d/*`) menciona el hackathon ni precios distintos a los de mokub.co.

## Estado (2026-11-03)
- Plantillas enviadas a Meta, en revisión: `mokub_diagnostico_clinica` (32fd6010-581a-4910-a09a-a787b7982a7a), `mokub_diagnostico_empresa` (e64b38c4-ae9b-4271-a79f-0d77d5927ee6) y `mokub_diagnostico_independiente` (c57945b3-34d2-4b02-9195-ffa61951aaf6). Cuando queden `sendable`, se ponen en Vercel como `DAPTA_WA_TEMPLATE_CLINICA`, `_EMPRESA` e `_INDEPENDIENTE`.
- Faro (D1, D2 y D4 en código) desplegado en 932167a.
- La versión `mokub-ventas-v1` del agente está en vista previa y espera aprobación para publicarse.
- Pendientes: dCal + Meet (dueño), Tu oferta en producción (pide sesión en Faro) y el aviso en Contacto para `quiere_comprar`, que todavía no está.
