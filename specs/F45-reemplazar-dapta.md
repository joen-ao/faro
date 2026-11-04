# F45 · Reemplazar lo que falta de Dapta y apagarlo

**Prioridad:** P1. **Depende de:** F44 (agente propio, ya desplegado en mock).
**Objetivo:** que Faro haga todo lo que hoy hace Dapta (escribir primero con plantillas, hacer seguimiento, atender el diagnóstico /d y el número real) y que se pueda cancelar el plan de Dapta sin perder nada.

## Qué hace Dapta hoy y qué queda tras F44

| Función de Dapta | Dónde se usa | Estado |
|---|---|---|
| Responder por WhatsApp con IA, agendar y calificar | Agente "Mokub · Ventas" en el número +57 301 473 4934 | **Construido en F44**, falta conectarlo (fase E) |
| Análisis al cerrar la conversación (webhook a Faro) | `/api/webhooks/dapta` | **Construido en F44** (cierre propio, mismo camino) |
| Bandeja para que una persona responda | Inbox de Dapta | **Construido en F44** (`/app/conversaciones`) |
| Agenda en el calendario de mokub.co | Herramientas `consultar_horarios` y `agendar_diagnostico` | **Construido en F44** (mismos endpoints); falta probarlo contra mokub.co real |
| Escribir primero con plantillas aprobadas | Flujo de Flow Studio (F24, `WHATSAPP_SEND_MODE=dapta_flow`) y plantillas `mokub_diagnostico_*` en Dapta | **Falta** (fase A) |
| Seguimiento cuando la persona deja de responder | `followup_enabled` del agente | **Falta** (fase B) |
| Chat en la página de diagnóstico | Widget de Dapta en `/d/[slug]` (`DAPTA_WIDGET_SNIPPET`) | **Falta** (fase D) |
| Ejecutar tareas cada pocos minutos | Lo hace Dapta por dentro | **Falta** (fase C): hoy Faro solo tiene crons diarios |

## Fase A · Plantillas por la API de WhatsApp de Meta
1. **Sender nuevo** `cloudApiTemplateSender` en `integrations/wa-cloud` con `sendTemplate(to, name, language, params)`:
   - `POST /{WA_PHONE_NUMBER_ID}/messages`, `type: "template"`;
   - componente `body` con `{{nombre}}`;
   - componente `button` (índice 0, tipo `url`) con `{{slug}}`.
   - Implementa la interfaz `WaSender` de F24, así `sendWhatsapp` (límite diario, horario, supresión, un mensaje por contacto) no cambia.
2. **`WHATSAPP_SEND_MODE`** suma `cloud_api`. Con ese modo, las plantillas se identifican por su **nombre en Meta** (`mokub_diagnostico_clinica`, `_empresa`, `_independiente`), no por el id de Dapta. `templates.ts` guarda el nombre y el idioma (`es`).
3. **Estado de las plantillas:**
   - `GET /{WA_BUSINESS_ACCOUNT_ID}/message_templates?name=…` devuelve `APPROVED`, `PENDING` o `REJECTED`;
   - Contacto solo ofrece las aprobadas y muestra el estado de las demás;
   - se guarda en caché 1 h en `app_settings`.
4. **Si las plantillas no existen en la WABA de Faro**, se crean con `npm run wa:templates`:
   - el script crea las 3 con los textos de `templates.ts`, los botones "Ver diagnóstico" (URL `/d/{{slug}}`), "Agendar llamada" y "No me interesa", y los ejemplos que Meta pide;
   - categoría `MARKETING`;
   - pide confirmación antes de enviar a revisión.
5. **Cada plantilla enviada abre la conversación en `wa_conversations`:**
   - con `lead_id` ya puesto (no se crea un lead `wa-` nuevo);
   - y el mensaje `kind: "template"`, autor `agente`, con el texto ya armado.

   Cuando la persona responde, el agente ve la plantilla en el historial y aplica la regla "Responde a un primer mensaje nuestro (plantilla)" del prompt.
6. **Botones de respuesta rápida:**
   - "Agendar llamada" llega como texto y el agente pasa directo a agendar (ya está en el prompt);
   - "No me interesa" es baja (ya lo detecta `isOptOut`).
7. **Costo:** cada plantilla enviada suma una entrada `whatsapp` en `cost_entries`, con la tarifa de `cost_rates` `whatsapp_marketing_template_co`. **Pendiente:** verificar en la tabla de precios de Meta el valor vigente para Colombia antes de cargarlo. Mientras no esté, se registra 0 y se avisa en Contacto.

## Fase B · Seguimiento
1. **Una conversación recibe como máximo un seguimiento** (`WA_FOLLOWUP_MAX`, por defecto 1). Se envía cuando se cumple todo esto:
   - el último mensaje es del agente y terminaba en pregunta;
   - la persona no respondió en `WA_FOLLOWUP_AFTER_MIN` (por defecto 120 minutos);
   - sigue abierta la ventana de 24 h;
   - es horario de envío de Colombia (F09: 8:00–20:00 Bogotá, sin festivos);
   - la conversación está `abierta` (no `humano` ni `cerrada`);
   - no hay reunión agendada, ni baja, ni supresión.
2. **El texto lo escribe el agente** con una nota del sistema: "seguimiento breve, sin presión, una sola pregunta, retoma lo último que se habló". Pasa por las mismas reglas de `guard.ts` y queda con `variables._seguimientos`.
3. **Fuera de la ventana de 24 h no hay seguimiento de texto libre.** Una segunda plantilla queda fuera de alcance.

## Fase C · Tareas cada 10 minutos
- **Ruta** `GET /api/cron/wa-agent` (con `CRON_SECRET`): cierra las conversaciones inactivas (F44), envía los seguimientos de la fase B y refresca el estado de las plantillas.
- **Quién la llama:** un workflow programado de GitHub Actions (`.github/workflows/wa-agent-cron.yml`, `*/10 * * * *`) con `CRON_SECRET` en los secretos del repo.
  - Así no se depende del límite de crons diarios del plan de Vercel.
  - El cierre diario dentro de `meta-ads-sync` se queda como respaldo.
- **Idempotente:** si dos llamadas se cruzan, ningún seguimiento sale dos veces. Cada seguimiento se reclama con un `update … where _seguimientos < max` antes de enviar.
- **Decisión del dueño:** GitHub Actions (gratis, recomendado) o pasar Vercel a un plan con crons frecuentes.

## Fase D · Página de diagnóstico sin el widget de Dapta
- Se quita el widget de Dapta de `/d/[slug]` (`WidgetBlock`, `features/diagnostic/widget.ts`, `DAPTA_WIDGET_SNIPPET`).
- En su lugar va un bloque que lleva al agente por WhatsApp, con el mensaje prellenado que ya existe ("vi el diagnóstico de … (ref. slug)"). Así la conversación cae en F44 con el lead conocido.
- **Por qué no un chat web propio ahora:** el widget tuvo 2 conversaciones en total contra 22 en WhatsApp y pruebas. Un chat web obliga a pedir el WhatsApp para agendar, y agrega costo y abuso que controlar. Queda para después si la medición lo pide.
- Los eventos `widget_open` y `widget_chat` siguen existiendo para el histórico. El clic en el botón de WhatsApp se mide como hoy.

## Fase E · Conectar el número y apagar Dapta
1. **Número de prueba (sin tocar el real):**
   - en la app de Meta "faro" (portafolio mokub.co) se agrega el producto WhatsApp; Meta da un número de prueba;
   - al usuario de sistema `faro-api` se le dan los permisos `whatsapp_business_messaging` y `whatsapp_business_management`;
   - webhook: `https://faro-eight-sage.vercel.app/api/whatsapp/meta`, con el token de verificación, suscrito al campo `messages`;
   - variables en Vercel: `WA_AGENT_MODE=real`, `WA_PHONE_NUMBER_ID`, `WA_BUSINESS_ACCOUNT_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`, `MOKUB_AGENT_KEY` (la misma clave que hoy usa Dapta), `OWNER_EMAIL`.
   - El dueño aprueba cada permiso en Meta; Claude guía y no ve los secretos.
2. **Prueba real de punta a punta** con el celular del equipo:
   - pregunta, horas reales, reserva en el calendario de mokub.co con Meet y correo, cierre en Faro;
   - se cancela la reunión de prueba después.
3. **Semana de sombra** (F44) revisando cada conversación en la bandeja.
4. **Corte del número real.**
   - **Pendiente del dueño:** confirmar en business.facebook.com si la WABA del +57 301 473 4934 está en el portafolio de Mokub.
     - Si está ahí: se suscribe la app de Faro a esa WABA y se desconecta el canal en Dapta.
     - Si es de Dapta: se migra el número, con unos minutos sin servicio y en horario de poco tráfico.
   - **Vuelta atrás:** reactivar el canal en Dapta.
5. **Apagado:**
   - `WHATSAPP_SEND_MODE=cloud_api`, se borra `DAPTA_WA_FLOW_URL` y `DAPTA_WIDGET_SNIPPET`, y se pausa el agente en Dapta;
   - `/api/webhooks/dapta` sigue 30 días por si llegan análisis atrasados;
   - después del primer ciclo de facturación sin uso, se cancela el plan.
   - El histórico de costos `dapta` se conserva.

## No-alcance
Chat web propio, transcripción de audios, una segunda plantilla de seguimiento, agentes para clientes de Mokub (multi-cliente) y voz.

## Criterios de aceptación
1. **Plantillas (mock):**
   - con `WHATSAPP_SEND_MODE=cloud_api`, `sendWhatsapp` envía la plantilla por nombre con `nombre` y `slug`, y respeta el límite diario, el horario y la supresión;
   - deja la conversación abierta con el lead.
   - Cuando la persona responde, no se crea otro lead y el agente recibe la plantilla en el historial.
2. Una plantilla que no está `APPROVED` no se ofrece ni se envía.
3. **Seguimiento:**
   - sale una sola vez, solo dentro de la ventana y del horario;
   - nunca después de una baja, una reunión agendada o con la conversación en manos de una persona.
   - Dos ejecuciones del cron al mismo tiempo dejan un solo seguimiento.
4. `/api/cron/wa-agent` sin `CRON_SECRET` responde 401.
5. `/d/[slug]` ya no carga ningún script de `dapta.ai`, y el botón de WhatsApp lleva la referencia del lead.
6. Con el número de prueba conectado: una conversación real agenda en el calendario de mokub.co y queda en Faro como lead calificado con `meeting_booked`.
7. Hasta el corte, nada cambia para el número real ni para el agente de Dapta.

## Pendientes del dueño
1. Agregar WhatsApp a la app de Meta "faro" y aprobar los permisos (con guía paso a paso).
2. Confirmar de quién es la WABA del número real.
3. Elegir GitHub Actions (recomendado) o un plan de Vercel con crons frecuentes.
4. Confirmar que se quita el widget de `/d` y se lleva todo a WhatsApp.
5. Verificar la tarifa vigente de Meta para plantillas de marketing en Colombia.
