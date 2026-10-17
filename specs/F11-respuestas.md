# F11 — Registro de respuestas

## Objetivo
Que una respuesta de la empresa quede registrada (evento `reply`), mueva el lead a `responded` y cuente en las métricas. SPEC §4, §9.3, §14 F11.

## Alcance
- `POST /api/webhooks/email` (Resend, firma Svix): verifica `svix-id`, `svix-timestamp`, `svix-signature` con `RESEND_WEBHOOK_SECRET` (`whsec_<base64>`), HMAC-SHA256, tolerancia ±5 min, comparación en tiempo constante. Sin secreto configurado → 401 siempre.
- Eventos: `email.delivered` → mensaje `delivered` + evento `delivered`; `email.clicked` → evento `click`; `email.opened` → se ignora; `email.bounced` duro (`bounce.type=Permanent`) → mensaje `failed` + supresión del destinatario; `email.complained` → supresión + opt-out del lead.
- Respuestas inbound: `email.received` (Resend) o formato genérico `{type:"email.received"|"reply", data:{email_id?, from, subject?, text?, in_reply_to?, references?}}` → evento `reply` y lead `responded`. Empareja por `email_id` = `messages.provider_id`, luego `In-Reply-To`/`References` (`<providerId@...>`), luego remitente = contacto del lead con mensaje enviado.
- Texto de baja ("darme de baja", "unsubscribe", "no me interesa", …) → opt-out + supresión (sin evento `reply`: no cuenta como respuesta comercial).
- Idempotencia por `svix-id` guardado en `events.payload.svix_id`; reentrega = sin cambios.
- `POST /api/leads/[id]/reply` (`requireAppAccess`): `note` obligatoria (3–280), `channel`, `at` (no futura). Evento `reply` con `payload {manual:true, note, actor:"app", channel}`.
- El estado solo avanza (`found|fit|contacted` → `responded`); nunca retrocede `qualified`/`disqualified`/`opted_out`.
- UI: botón "Marcar respondió" + diálogo en `/app/hunts/[id]/outreach` con aviso "sin nombres de personas".

## Reglas
Sin nombres de personas en notas ni payloads (el payload de webhook guarda solo ids, no `from`/`text`). No se envía ningún mensaje.

## Tests (Vitest)
Firma válida/inválida/vencida/ausente, sin secreto → 401, idempotencia, reply → responded sin retroceder qualified, baja por texto → suprimido, manual auditado, validación, métricas `respondieron` actualizadas. `npm run check`, `npm run e2e:smoke`, capturas del diálogo 1440 y 390.
