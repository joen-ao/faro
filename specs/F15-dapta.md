# F15 · Integración Dapta (webhook Flow Studio, http_push, csv_export, créditos)

**Prioridad:** P1 · **Rama:** `feat/F15-dapta` · **Cubre:** SPEC §2 (Dapta y créditos), §6, §7 (dapta), §9.3, §11, §12.

## Objetivo
Pasar leads a Dapta para calificarlos y recibir el resultado, sin saber aún cómo el entorno de prueba recibe leads. Tres modos por `DAPTA_MODE`:
- `widget_only`: Faro no envía nada; solo recibe el webhook de Flow Studio (la conversación empieza en el widget de `/d/[slug]`).
- `http_push`: `POST` a `DAPTA_PUSH_URL` con `DAPTA_PUSH_API_KEY`. Solo `https`, nunca localhost ni IPs privadas/link-local (SSRF), timeout 8 s, 1 reintento. Sin URL/clave → mock (`is_mock`). Con `SEND_ENABLED=false` no sale nada: resultado `simulated`.
- `csv_export`: CSV para secuencias de Dapta (≤ 5 MB): `empresa, telefono, correo_generico, ciudad, fuente, slug, url_diagnostico, notas`. Escapa comillas/saltos y neutraliza fórmulas (`= + - @` al inicio → prefijo `'`).

## Interfaces
- `DaptaQualifierAdapter { mode, isMock, push(leads), exportCsv(leads) }` en `src/integrations/dapta/{types,real,mock,index}.ts`; `getDaptaAdapter(env)`.
- `POST /api/webhooks/dapta`: secreto compartido `DAPTA_WEBHOOK_SECRET` en `x-dapta-secret` o `Authorization: Bearer`, tiempo constante; 401 si falta/no coincide; sin secreto configurado en producción: siempre 401.
- `POST /api/dapta/push`, `GET /api/dapta/export.csv`: protegidos por `requireAppAccess` (`APP_ACCESS_KEY` en header `x-app-key` o cookie `faro_key`; sin clave configurada solo se permite fuera de producción). Excluyen leads suprimidos (`suppression`) y `opted_out`.
- Fallback opcional (`fallback.ts`): heurística que guarda `origin='fallback'`, `is_mock=true`; nunca se presenta como Dapta.

## Payload de ejemplo (webhook)
```json
{
  "conversation_id": "conv_8f2a91",
  "slug": "clinica-dental-sonrisa-bogota-1a2b",
  "qualified": true,
  "score": 82,
  "bant": { "budget": "USD 300/mes", "authority": "gerencia", "need": "agendamiento", "timeline": "este mes" },
  "summary": "Quiere automatizar citas por WhatsApp.",
  "ai_replies": 3
}
```
Emparejamiento: `lead_id` (uuid) > `slug` > `phone` > `email`. `qualified` o, si falta, `score >= 60`. Créditos: `ai_replies × DAPTA_CREDITS_PER_AI_REPLY × DAPTA_CREDIT_USD` (3 × 40 × 0.001 = **0.12 USD**) o `credits_used × DAPTA_CREDIT_USD`.

## Criterios de aceptación
1. Secreto correcto → 200; incorrecto/ausente → 401. 2. Payload de ejemplo crea `qualifications(origen dapta)`, eventos `widget_chat` + `qualified|disqualified`, `leads.status` y `cost_entries(dapta)` = 0.12 USD. 3. Mismo `conversation_id` dos veces no duplica. 4. CSV sin inyección de fórmulas y ≤ 5 MB. 5. `http://127.0.0.1`, `10.0.0.1`, `169.254.169.254` rechazados. 6. `SEND_ENABLED=false` → `simulated`, sin `fetch`.
