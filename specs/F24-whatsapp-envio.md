# F24 · Envío de WhatsApp por Dapta (empresas y números personales)

**Prioridad:** P1 · **Reemplaza en la práctica:** el export CSV de F17 (que se mantiene).

## Objetivo
Faro envía la primera plantilla de WhatsApp aprobada por Meta, a través de Dapta, a los leads del perfil que tienen un celular: el WhatsApp o celular publicado por la empresa **y** el celular personal que registró un independiente o un representante en un registro público (REPS, RUES, SECOP…). Las respuestas las atiende el agente de Dapta "Faro · Calificador de negocios" en la línea Meta +57 301 4734934.

## Arquitectura
`Faro → POST flujo de Dapta (webhook) → nodo "Send Whatsapp Template v2" → Meta Cloud API`.
- El flujo de FlowStudio "Faro · Enviar plantilla WhatsApp" recibe `{to_number, template_id, nombre, slug, lead_id}` y devuelve el resultado. La URL del webhook (lleva su llave) va en `DAPTA_WA_FLOW_URL` (secreta, nunca en el repo).
- `WHATSAPP_SEND_MODE`: `off` (por defecto) | `dapta_flow`. Con `SEND_ENABLED!=true` todo se simula (`status=simulated`), igual que el correo.

## Plantillas (`src/features/whatsapp/templates.ts`)
| Clave | Uso | Estado |
|---|---|---|
| `faro_diagnostico_clinica` | Salud (REPS): clínicas, odontología, consultorios | Aprobada (id `4c0206b2…`) |
| `faro_diagnostico_empresa` | Cualquier otro sector, número de empresa | Por crear en el panel de Dapta |
| `faro_diagnostico_independiente` | Celular personal de un independiente | Por crear en el panel de Dapta |
Variables siempre `nombre` (1) y `slug` (2, botón URL `…/d/{{slug}}`). El id de una plantilla nueva se configura con `DAPTA_WA_TEMPLATE_EMPRESA` / `DAPTA_WA_TEMPLATE_INDEPENDIENTE`; sin id, la plantilla no se ofrece. El MCP de Dapta no crea plantillas: se crean y envían a revisión en app.dapta.ai → Message templates (textos en este spec, §Textos).

## Selección (`selectWhatsappTargets`)
- Lead del perfil (`status=fit`), no demo, no `opted_out`.
- Número: celular colombiano `+573XXXXXXXXX` (WhatsApp no llega a fijos). Prioridad: `whatsapp` publicado > celular de la empresa > celular personal registrado.
- Cumplimiento: no suprimido, **un solo mensaje por empresa/persona en cualquier canal** (si ya recibió correo, no recibe WhatsApp), ventana Ley 2300 (L–V 7–19, sáb 8–15, nunca domingo/festivo), tope diario `WHATSAPP_DAILY_LIMIT` (por defecto 50; Meta limita números nuevos a 250 conversaciones iniciadas/24 h).
- Toda plantilla identifica a quien escribe, el origen del dato y la salida ("responda BAJA").

## Envío y registro
- `POST /api/whatsapp/send` (clave del equipo) `{huntId, leadIds?, limit?}` → por lead: reserva atómica (`messages` whatsapp `sending`), POST al flujo, `sent` + `provider_id`, evento `sent`, `cost_entry` whatsapp = `cost_rates.whatsapp_template`; error → `failed` con detalle.
- Respuestas y BAJA: webhook existente `/api/webhooks/whatsapp` y el de Dapta (`post_conversation`).
- UI de Contacto: botón "Enviar WhatsApp (N)" por pestaña y acción por fila; muestra plantilla, número (enmascarado) y por qué se excluye.

## Textos para el panel de Dapta (categoría MARKETING, es)
**faro_diagnostico_empresa** — "Hola, {{1}}. Le escribe Mokub con Faro. Encontramos su empresa en un registro público y preparamos un diagnóstico gratuito de su presencia digital: cómo la encuentran y cómo le escriben sus clientes. ¿Le interesa que le contemos en 2 minutos? Si no desea recibir más mensajes, responda BAJA." Botones: URL "Ver diagnóstico" → `https://faro-eight-sage.vercel.app/d/{{2}}`; respuesta rápida "No me interesa".

**faro_diagnostico_independiente** — "Hola, {{1}}. Le escribe Mokub con Faro. Su negocio aparece en un registro público y preparamos un diagnóstico gratuito de cómo lo encuentran y le escriben sus clientes. ¿Le interesa verlo? Si no desea recibir más mensajes, responda BAJA." Mismos botones.

## Criterios de aceptación
1. Con `WHATSAPP_SEND_MODE=off` la ruta responde `whatsapp_send_disabled` y nada sale.
2. Solo celulares +573; fijos excluidos con motivo.
3. Ya contactados, suprimidos y fuera de ventana excluidos; nunca dos mensajes a la misma empresa.
4. Plantilla por sector/segmento; sin id configurado no se usa.
5. Costo por plantilla registrado; `SEND_ENABLED=false` → simulado.
6. El primer envío real requiere aprobación explícita del equipo.
