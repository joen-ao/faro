# F17 · WhatsApp vía Dapta (export CSV + webhook de vuelta)

**Prioridad:** P2 · **Rama:** `feat/F17-whatsapp` · **Cubre:** SPEC §2 (WhatsApp bloqueado), §4, §7, §8, §11, §12.

## Objetivo
WhatsApp es **opcional**: Faro no envía nada. Genera un CSV de secuencia para importar en Dapta y recibe por webhook los eventos que Dapta/Meta reportan. Todo detrás de `WHATSAPP_ENABLED` (por defecto `false`: rutas 404 `whatsapp_disabled`, la UI/respuesta lo indica).

## Interfaces
- `WhatsappAdapter { mode: "dapta_csv", isMock, exportCsv(rows) }` en `src/integrations/whatsapp/{types,real,mock,index}.ts`; `getWhatsappAdapter(env)` (mock si `WHATSAPP_ENABLED=false`).
- CSV (reutiliza `csvCell`/`phoneCell` de F15): `empresa, telefono, plantilla, variables, url_diagnostico, enlace_baja, slug`. `plantilla` con variables `{{empresa}}`, `{{url_diagnostico}}`, `{{enlace_baja}}`; ≤ 5 MB.
- Selección: teléfono E.164 **de empresa** (contact_point `phone|whatsapp` con `is_generic` o fuente de empresa; nunca celular personal no genérico), persona jurídica, no `opted_out`, no suprimido (teléfono/dominio), **sin mensaje previo a la empresa** (correo u otro canal queued/sent/delivered/simulated no cuenta), y `checkSendWindow` abierto en `now` (Ley 2300: L–V 7–19, sáb 8–15, nunca domingo/festivo); fuera de ventana se omite el lote entero con `nextAllowedAt`.
- `GET /api/whatsapp/export.csv` (`requireAppAccess`): 404 si deshabilitado. Cabeceras `X-Rows`, `X-Skipped`.
- `POST /api/webhooks/whatsapp`: secreto `WHATSAPP_WEBHOOK_SECRET` en `x-whatsapp-secret` o Bearer, tiempo constante, fail-closed (401). Payload `{ event: sent|delivered|reply|opt_out, lead_id|slug|phone, message_id?, text? }`. Registra `events` y `messages` (contact_channel `whatsapp`); `sent` crea `cost_entry` categoría `whatsapp` = 1 plantilla × `cost_rates.whatsapp_template` (idempotente por `message_id`). `reply` con "BAJA"/"STOP" (o evento `opt_out`) → supresión del teléfono, `leads.status=opted_out`, evento `opt_out`.

## Criterios de aceptación
1. Deshabilitado por defecto (404/disabled). 2. CSV solo con teléfonos de empresa. 3. Suprimidos y ya contactados excluidos. 4. Secreto válido 200 / inválido 401. 5. STOP → suprimido. 6. Costo de plantilla = tarifa configurable.
