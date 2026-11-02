# F27 · Respuestas de correo conectadas a Faro

**Prioridad:** P0 · **Extiende:** F11 (respuestas).

## Problema
El correo de mokub.co (MX) lo recibe Hostinger. Las respuestas a `equipo@mokub.co` nunca llegaban a Faro, así que el tablero mostraba 0 respuestas aunque algún cliente hubiera contestado.

## Solución
- Subdominio de recepción en Resend: `respuestas.mokub.co` (MX propio). El dominio raíz y su MX de Hostinger no se tocan.
- Cada correo sale con `Reply-To: r.<slug>@respuestas.mokub.co`. La respuesta identifica a su lead aunque el cliente conteste desde otro buzón (`EMAIL_REPLY_DOMAIN`).
- Webhook `email.received` → Faro lee el contenido con `GET /emails/receiving/{id}` (`RESEND_INBOUND_API_KEY`, clave con acceso completo; si falta, usa `RESEND_API_KEY`). Detecta la baja, registra la respuesta (sin guardar el texto, SPEC §8) y la **reenvía** a `REPLY_FORWARD_TO` (`equipo@mokub.co`) con `Reply-To` = el cliente. Así el equipo contesta desde su correo de siempre.
- Remitente: `Mokub <equipo@mokub.co>` en lugar de `noreply@`.
- Sin bucles: nunca reenvía mensajes de nuestras propias direcciones. Es idempotente por `svix-id` y por `Idempotency-Key` del reenvío.

## Activación (orden seguro)
1. En Resend: añadir el dominio `respuestas.mokub.co`, activar la recepción y copiar sus registros (DKIM y MX).
2. Crear esos registros en el DNS de Hostinger y verificar en Resend.
3. En el webhook de Resend, activar el evento `email.received`.
4. Solo entonces fijar `EMAIL_REPLY_DOMAIN=respuestas.mokub.co` en Vercel. Antes de eso las respuestas siguen yendo a `equipo@mokub.co`.

## Criterios de aceptación
1. Una respuesta a `r.<slug>@…` marca el lead como `responded` aunque venga de otro buzón.
2. "Darme de baja" en el cuerpo suprime al remitente.
3. Cada respuesta llega a `equipo@mokub.co` una sola vez, con Reply-To = cliente.
4. El texto de la respuesta no se guarda en la base.
