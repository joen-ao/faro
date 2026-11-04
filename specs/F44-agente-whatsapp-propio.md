# F44 · Agente de WhatsApp propio en Faro (API de WhatsApp de Meta + Claude)

**Prioridad:** P1. **Estado:** se construye en paralelo y no sale a producción hasta pasar la evaluación y el periodo de sombra (ver "Transición"). El agente de Dapta "Mokub · Ventas" (F37, F39) sigue atendiendo el número real mientras tanto.

## Por qué
**Costo.** Precios de la documentación de Dapta, consultada el 3 de noviembre de 2026:
- una respuesta de IA cuesta 40 créditos;
- el plan Pro cuesta USD 99 al mes con 100.000 créditos, unas 2.500 respuestas.

| | Por respuesta | Conversación de ~6 respuestas | 400 conversaciones al mes |
|---|---|---|---|
| Dapta (40 créditos ≈ USD 0,04) | USD 0,04 | USD 0,24 | USD 99 (Pro) |
| Propio con Haiku 5.5 (~5.000 tokens de entrada, 200 de salida) | ~USD 0,0006 | ~USD 0,004 | ~USD 1,5 |
| Propio con Sonnet 5.5, con caché del prompt | ~USD 0,005 | ~USD 0,03 | ~USD 12 |

- Los tokens por respuesta son una estimación: se miden en la evaluación.
- Los precios de los modelos son los de lista de F42.
- Los cobros de Meta por mensajes son iguales en los dos casos: los de servicio dentro de la ventana de 24 h no se cobran y las plantillas de marketing sí.
- **El plan actual (2.000 créditos al mes) alcanza para unas 50 respuestas, unas 8 conversaciones.** Con la pauta prendida se acaba en días.

**Producto.**
- Mokub vende agentes de WhatsApp a $290.000 al mes. Con Dapta, el margen depende del volumen de cada cliente.
- Un agente propio es el mismo producto que Mokub vende, con costo casi fijo.
- Este primer agente (el de Mokub) es el piloto. Las tablas se diseñan con `agent_id` para que más adelante atienda a clientes (fuera de alcance aquí).

**Calidad.** En las conversaciones de prueba del 3 de noviembre, el agente de Dapta (gpt-5.1):
- usó **negritas con doble asterisco** y emojis, aunque el prompt lo prohíbe;
- dos veces dijo "tengo dificultad para ver los horarios" y no agendó.

Con un agente propio, las reglas de formato se aplican en el código, no solo en el prompt.

## Alcance

### 1. Conexión con la API de WhatsApp de Meta (Cloud API)
- **Webhook** `GET /api/whatsapp/meta`: verificación de Meta (`hub.mode`, `hub.verify_token` contra `WA_VERIFY_TOKEN`, responde `hub.challenge`).
- **Webhook** `POST /api/whatsapp/meta`:
  - verifica `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con `WA_APP_SECRET`, comparación en tiempo constante); sin firma válida responde 401;
  - responde 200 de inmediato y procesa con `after()`.
- **Idempotencia:** cada mensaje entrante se guarda por su `wamid` (único). Si Meta lo reintenta, no se procesa dos veces.
- **Estados** (`sent`, `delivered`, `read`, `failed`) de los mensajes salientes: se guardan en el mensaje.
- **Envío:** `POST /{WA_PHONE_NUMBER_ID}/messages` con `WA_ACCESS_TOKEN` (usuario de sistema, permanente). Al recibir un mensaje se marca como leído con el indicador de "escribiendo".
- Adaptador real y mock, como el resto de integraciones (`WA_AGENT_MODE=mock|real`, mock por defecto).

### 2. Datos (migración nueva)
- `wa_agents`: `id`, nombre, `phone_number_id`, `prompt_version`, modelo, activo.
- `wa_conversations`:
  - `id`, `agent_id`, teléfono del contacto, `lead_id` (nullable), estado (`abierta`, `cerrada`, `humano`);
  - `last_inbound_at` (para la ventana de 24 h);
  - `variables` (jsonb, las mismas de hoy: `nombre_negocio`, `producto_interes`, `ref_diagnostico`, `reunion_agendada`, `fecha_reunion`, `quiere_comprar`, `calificado`, `pidio_baja`, `resumen`);
  - `created_at`, `closed_at`.
- `wa_messages`:
  - `id`, `conversation_id`, dirección (entra o sale), autor (`contacto`, `agente`, `persona`);
  - `wamid` (único), tipo (texto, audio, imagen, plantilla, otro), texto, estado;
  - tokens de entrada y salida, costo, `created_at`.
- Una conversación nueva se abre si la anterior del mismo teléfono está cerrada o lleva 24 h sin mensajes. Es el mismo criterio que el `conversation_timeout_minutes` de Dapta.
- Todas las tablas llevan `.enableRLS()` (F34).

### 3. El agente
- **Prompt:** se porta la v4.3 de Dapta (rol, objetivos, cuatro tipos de conversación, cómo conversar, agendar, catálogo, baja y cumplimiento, estilo) a un archivo versionado en el repo (`src/features/wa-agent/prompt.ts`).
  - El catálogo se arma desde "Tu oferta" (F40), no escrito a mano, así los precios no se desalinean.
  - El prompt va en bloque cacheado.
- **Modelo:** `ANTHROPIC_WA_AGENT_MODEL`. Se decide con la evaluación (punto 6) entre Haiku 5.5 y Sonnet 5.5:
  - se elige el más barato que pase;
  - si los dos pasan por poco, Sonnet.
- **Bucle de herramientas** con el SDK de Anthropic. El historial de la conversación va completo (hasta 40 mensajes; si hay más, un resumen de lo anterior).
  - `consultar_horarios(date?, tz?)` → `GET https://www.mokub.co/api/agent/<MOKUB_AGENT_KEY>/availability` (endpoint de Mokub ya en producción).
  - `agendar_diagnostico(nombre, email, empresa, interes, fecha, hora, tz?)`:
    - `POST …/book`;
    - el WhatsApp lo pone el código, con el teléfono de la conversación, no el modelo;
    - solo se ejecuta una vez por conversación con `ok:true`.
  - `guardar_datos({...})`: actualiza `variables`, validadas con zod (mismos valores permitidos de hoy).
  - `pasar_a_persona(motivo)`: la conversación pasa a estado `humano`, el agente deja de responder y se avisa al dueño (punto 5).
  - `terminar()`: cierra la conversación (mismas reglas de `end_conversation` de hoy).
  - Máximo 4 llamadas a herramientas por turno. Si una herramienta falla dos veces, el agente sigue el plan B del prompt: pide la franja horaria y avisa que el equipo confirma.
- **Reglas aplicadas en el código**, antes de enviar:
  - **Formato:** se quita el markdown (`**x**` → `*x*`, títulos, viñetas) y se deja como máximo un énfasis por mensaje.
  - **Emojis:** se quitan, salvo que el contacto los haya usado.
  - **Largo:** si pasa de 600 caracteres, se corta en el último punto antes de ese límite y se registra el aviso.
  - **Horas:** no se envía una hora que no haya venido de `consultar_horarios` en esta conversación. Si el texto nombra una hora y no hubo consulta, se vuelve a pedir la respuesta al modelo una vez, con la instrucción de consultar primero.
- **Mensajes agrupados:** si el contacto manda varios mensajes seguidos, se espera 4 s desde el último antes de responder, y se responde una sola vez a todos.
- **Audios, imágenes y otros:** respuesta fija y cordial ("Por ahora solo leo texto, ¿me lo escribe?"), sin gastar modelo. Transcribir audio queda fuera de alcance.
- **Baja:** "BAJA", "STOP" o "no me interesa" → despedida fija, `pidio_baja`, supresión del teléfono (F09) y cierre. No responde más a ese número.
- **Ventana de 24 h:** fuera de la ventana el agente no envía texto libre. Escribirle primero a alguien sigue siendo con plantillas aprobadas, como hoy.

### 4. Integración con Faro (reemplaza el webhook de Dapta para este canal)
- Al primer mensaje se busca o crea el lead con `findOrCreateAgentLead` (F39), con la misma atribución por `ref. meta-<id>` y por la marca click-to-WhatsApp. El `referral` del mensaje de Cloud API (`source_type: ad`, `source_id`) ahora sí se lee directo.
- Al cerrar (por `terminar()` o por 24 h de inactividad, con un cron) se hace lo mismo que con el webhook de Dapta:
  - se arma el resumen y la calificación con el modelo (una llamada, con salida estructurada);
  - se guardan la calificación y los eventos `meeting_booked` y `purchase_intent`;
  - se registra el costo.
- Se reusan las funciones de `integrations/dapta/webhook.ts` extrayéndolas a `features/inbound/close-conversation.ts`, así los dos caminos guardan lo mismo y el tablero (F43) no cambia.
- El costo de cada respuesta va a `cost_entries` con `loadAiRates(db, model)` (F42), por conversación y por lead.

### 5. Persona en el medio (bandeja mínima)
- **Página** `/app/conversaciones`:
  - lista de conversaciones (abiertas primero) con el último mensaje, estado y lead;
  - **detalle:** el hilo completo;
  - **botón "Tomar la conversación"** (el agente deja de responder) y "Devolver al agente";
  - **caja para responder a mano** (solo dentro de la ventana de 24 h; fuera de ella se ofrece una plantilla).
- **Aviso al dueño por correo** (Resend, a `OWNER_EMAIL`) cuando:
  - se agenda una reunión;
  - alguien quiere comprar;
  - se pide una persona;
  - una herramienta falla dos veces.
- Sigue el diseño de Faro (tokens `faro-*`, modo Operate).

### 6. Evaluación (antes de cualquier cambio en producción)
- **Juego de 30 conversaciones** en `tests/eval/wa-agent/`:
  - las 26 de Dapta, sin datos personales;
  - escenarios: anuncio con referencia, diagnóstico de Faro, plantilla respondida, sin referencia, persona sin negocio, baja, pide precio en dólares, pide hablar con una persona, pregunta difícil, pide una hora no disponible, cambia de día.
- Un **contacto simulado** (Haiku) sigue el guion de cada escenario. Las herramientas de Mokub van con un mock de horarios fijos.
- **Chequeos automáticos:**
  - no inventa precios ni horas;
  - agenda solo con nombre, correo y autorización;
  - una sola pregunta por mensaje;
  - sin markdown;
  - guarda las variables correctas;
  - respeta la baja.
- **Juez aparte** (Sonnet 5.5) con rúbrica de tono y avance hacia la cita.
- **Umbral para pasar:** 100 % en los chequeos críticos (precio, horas, baja, autorización) y ≥ 90 % en el resto.
- El reporte guarda el costo medido por conversación.
- Se corre con `npm run eval:wa-agent`, que llama a la API real y gasta dinero. Se avisa antes de correrlo.

### 7. Variables de entorno nuevas
`WA_AGENT_MODE`, `WA_PHONE_NUMBER_ID`, `WA_BUSINESS_ACCOUNT_ID`, `WA_ACCESS_TOKEN`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`, `MOKUB_AGENT_KEY`, `ANTHROPIC_WA_AGENT_MODEL`, `OWNER_EMAIL`.
- Los valores los pone el dueño en Vercel.
- Nada de esto se escribe en el repo ni en el chat.

## Transición
1. **Construcción, con el número de prueba de Meta.**
   - La app de Meta de Faro necesita el producto WhatsApp. Meta da un número de prueba gratis que puede escribirles hasta a 5 números verificados.
   - El número real (+57 301 473 4934) no se toca.
2. **Evaluación** (punto 6) aprobada.
3. **Sombra, una semana:** el equipo prueba con sus celulares contra el número de prueba los escenarios de la pauta. Se revisa cada conversación en la bandeja.
4. **Corte.** El número real pasa del agente de Dapta a Faro:
   - **Pendiente del dueño:** confirmar si la cuenta de WhatsApp Business (WABA) de ese número es de su Business Manager (conexión hecha por registro integrado) o de Dapta.
     - Si es suya: se suscribe la app de Faro a la WABA y se apaga el canal en Dapta.
     - Si no: hay que migrar el número, con unos minutos sin servicio.
   - Se elige una hora de poco tráfico y se puede volver atrás reactivando el canal en Dapta.
5. **Puente de créditos:** si los créditos de Dapta se acaban antes del corte, se paga **un mes** de Pro (USD 99) y se cancela después del corte. No se apura el corte por los créditos.

## No-alcance
- Agentes para clientes de Mokub (multi-cliente, panel por cliente, facturación).
- Voz, transcripción de audios, envío de archivos.
- Sincronización con CRM externos.
- Reemplazar el envío saliente con plantillas que hoy hace Dapta (F37). Puede ser una fase siguiente con la misma conexión.

## Criterios de aceptación
1. Un POST al webhook sin firma válida responde 401 y no guarda nada. El mismo `wamid` dos veces deja un solo mensaje y una sola respuesta.
2. Con el adaptador mock, una conversación completa (pregunta precio → ofrece horas reales → nombre, correo y autorización → agenda) crea el lead, la reunión, el evento `meeting_booked` y el costo, igual que el webhook de Dapta en F39.
3. "ref. meta-123" en el primer mensaje deja el lead como `meta_ads` con `utm_content=123`. Un mensaje con `referral.source_type=ad` también.
4. Ningún mensaje enviado tiene `**`, títulos, viñetas ni una hora que no haya salido de `consultar_horarios`.
5. "BAJA" suprime el número y el agente no vuelve a responderle.
6. "Tomar la conversación" detiene al agente. Una respuesta escrita en la bandeja llega por WhatsApp (mock) y queda con autor `persona`.
7. La evaluación pasa el umbral y el reporte trae el costo medido por conversación.
8. El número real sigue en Dapta hasta el paso 4 de la transición.

## Pendientes del dueño
1. Agregar el producto WhatsApp a la app de Meta de Faro y generar el número de prueba. Se le guía paso a paso; los permisos los aprueba el dueño.
2. Confirmar de quién es la WABA del número real.
3. Poner las variables de entorno en Vercel.
4. Aprobar el gasto de la evaluación: unos pocos dólares por corrida, se confirma antes de correr.
