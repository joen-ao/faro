# F10 — Outreach

## Objetivo
Generar el primer mensaje por lead, mostrarlo en vista previa editable, enviarlo (o simularlo) respetando F09 y registrar todo (mensajes, eventos, costos). SPEC §9.2, §10 vista 5.

## Alcance
- `src/integrations/email/{types,real,mock,index}.ts`: `EmailAdapter.send({to,from,replyTo,subject,text,html,headers})`. Real = `fetch` a la API REST de Resend (sin SDK), se crea solo con `sendEnabled=true`. Mock sin red. `EMAIL_MODE` + credenciales (`resolveMode("email")`).
- `src/features/outreach/`: `generateMessage` (adapter Anthropic; la IA solo redacta asunto, apertura y propuesta; el resto es plantilla fija: remitente, motivo/fuente pública, enlace `/d/[slug]?c=&s=`, baja de un clic, `SENDER_ADDRESS`), texto plano + HTML escapado; `selectChannel` (correo genérico > formulario > WhatsApp si `WHATSAPP_ENABLED`; EE. UU. solo correo); servicio `previewOutreach`, `enqueue`, `processQueue(now, limit=20)`, `recordAssistedSend`.
- Migración 0001: `message_status += simulated`, `messages.recipient`.
- API (protegida con `requireAppAccess`): `POST /api/outreach/preview`, `/send` (lote), `/assisted`.
- Vista `/app/hunts/[id]/outreach` (`demo` = hunt demo sembrado, `?now=` solo en demo).

## No-alcance
Webhook inbound de correo y respuestas (F11), WhatsApp real (F17), seguimientos.

## Reglas
1. `SEND_ENABLED !== true` → el adapter real jamás se llama; mensaje `simulated` + evento `sent` (`payload.simulated`, `is_mock`) y sin costo de correo.
2. `evaluateOutreach` al encolar y de nuevo al enviar. Fuera de ventana el mensaje queda `queued` con `bloqueado_por_regla=outside_window`; cualquier otra regla → `blocked` + regla guardada.
3. Máx. 1 mensaje por empresa (`queued|sent|delivered`). Persona jurídica no verificada ("por verificar"): se muestra; con envío real se bloquea (`legal_unverified`) salvo `criteria.allowUnverifiedLegal`.
4. Formulario asistido: `minutos × HUMAN_MINUTE_RATE_USD` → `cost_entries` `human` + evento `sent`.
5. Costo IA siempre en `cost_entries` (mock marcado).

## Criterios de aceptación / tests (Vitest)
Con `SEND_ENABLED=false` `fetch` nunca se llama y queda `simulated`; domingo no envía; suprimido y correo personal bloqueados; 1 mensaje por empresa; costo humano exacto; HTML escapado (sin inyección desde fuentes); enlace de baja y `List-Unsubscribe` presentes. `npm run check`, `npm run e2e:smoke`, capturas 1440 y 390.

## UI
Tokens SPEC §10; banner "SEND_ENABLED=false: los envíos se simulan"; estados vacío/carga/error; datos demo marcados.
