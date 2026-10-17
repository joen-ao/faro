# HANDOFF — para Joen (sábado 17 oct, mañana)

> Escrito por el orquestador del loop nocturno (03:18–05:40 Bogotá). Todo el estado vive en `specs/STATUS.md`, `DECISIONS.md`, `specs/F*.md` y `specs/reviews/`. Nada se envió, nada se desplegó, no hubo `git push`, `SEND_ENABLED=false`.

## 1. Resumen (5 líneas)
1. **Funciona en local**, todo en `main` con `npm run check` (≈690 tests unitarios e integración + build) y `npm run e2e:smoke` (34 pruebas a 1440 y 390 px) en verde. Cada feature pasó review independiente (40+ informes en `specs/reviews/`).
2. **Datos reales sin llave**: OpenStreetMap (Overpass) y datos.gov.co (RUES/REPS) se consultan en vivo. Una búsqueda real de clínicas dentales en Bogotá trajo 408 lugares de OSM + 150 IPS de REPS.
3. **En mock (sin llave, marcado y fuera de totales)**: Anthropic (ICP y mensajes), Google Places, Apify, Resend (correo), Dapta push. El tablero nunca suma mock/demo a lo real; hay toggle "Incluir datos de prueba".
4. **Construido**: landing con video HyperFrames, nuevo perfil y búsqueda en vivo con mapa, dedupe, scoring con evidencia, cumplimiento (ventanas Ley 2300, festivos 2026, supresión, opt-out), outreach con cola, página de diagnóstico, recibo de lead, tablero CPL/CPLC, Dapta (webhook/push/CSV), Meta Ads (UTM + gasto), WhatsApp CSV (apagado) y bandit (simulación etiquetada).
5. **Bloqueado**: ninguna feature (22/22 DONE, más F19b de seguimiento). **Pendiente humano**: conectar credenciales reales, desplegar, elegir ICP, decidir licencia y publicar el repo con historia limpia (sección 5).

## 2. Prueba de cobertura (`reports/coverage.md`, datos reales del 17 oct 03:42) y ICP
| ICP | OSM | RUES (jurídicas) | REPS | Contactables verificados como persona jurídica | Por verificar |
|---|---:|---:|---:|---:|---:|
| Clínicas odontológicas · Bogotá | 436 | 1.445 | 241 sedes (150 NIT) | **70** | 72 |
| Restaurantes · Bogotá | 4.634 | 7.359 | — | **12** | 147 |
| Restaurantes · Miami | 704 | — | — | N/D | 336 |

**Recomendación: ICP principal = clínicas odontológicas (persona jurídica) en Bogotá.** Es el único con registro jurídico gratuito que trae contacto (REPS: 70 correos genéricos tipo info@/citas@ de IPS con NIT). Restaurantes en Miami queda como ICP secundario de solo búsqueda: 336 con web o correo en OSM, sin envíos. Ojo: en OSM solo el 0,7 % de las clínicas trae web o correo, así que "con sitio web" depende de REPS, Places (F05) y del enriquecimiento web (F06). El ICP se cambia sin tocar código (`/app/new` y los presets en `src/features/icp/presets.ts`).

## 3. Checklist de conexión (uno por servicio)
Copia `.env.example` a `.env.local` (local) o carga las variables en Vercel. Después de cada paso, abre `/app/settings` o `GET /api/health`: el servicio debe pasar de `mock` a `real`.

- **Supabase (Postgres)**: crea el proyecto → Settings → Database → connection string (pooler, puerto 6543) → `DATABASE_URL`. Luego `npm run db:migrate` con esa variable (o deja que la app migre sola al primer request; `getReadyDb` migra una vez). Opcional: `npm run db:seed` solo si quieres datos demo (salen marcados).
- **Vercel**: importa el repo (rama `main`), framework Next.js, sin cambios de build. Variables mínimas en producción: `DATABASE_URL`, `APP_ACCESS_KEY` (sin ella `/app` y las APIs internas dan 401 en producción), `OPTOUT_SECRET` (largo y aleatorio; sin él la baja falla cerrada), `NEXT_PUBLIC_APP_URL` (la URL pública), `SENDER_LEGAL_NAME`, `SENDER_ADDRESS`, `EMAIL_REPLY_TO`. El deploy es tuyo: el loop no desplegó nada.
- **Anthropic**: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODE=real`, `ANTHROPIC_MODEL=claude-sonnet-5-5` (o el que prefieras). El uso de tokens se registra en `cost_entries` (categoría `ai`).
- **Google Places**: habilita "Places API (New)" en GCP → API key restringida a esa API → `GOOGLE_PLACES_API_KEY`, `GOOGLE_PLACES_MODE=real`. Riesgos anotados: el field mask con web y teléfono puede caer en un SKU más caro que 0,032 USD, y los términos de Google limitan el cacheo. `recordPlacesCost` todavía no está cableado al flujo de hunts (MINOR).
- **Apify**: `APIFY_TOKEN`, `APIFY_CONTACT_ACTOR_ID` (Contact Details Scraper; verifica los nombres de campos `startUrls`/`emails`/`phones`), `APIFY_MODE=real`. Solo corre con `{"apify":true}` en `POST /api/leads/[id]/enrich` y nunca sobre Google Maps ni redes. El enriquecimiento directo (fetch + robots.txt) ya es real y no necesita llave.
- **Resend + dominio (SPF/DKIM)**: agrega el dominio en Resend → registros SPF, DKIM (y DMARC recomendado) en tu DNS → espera "Verified". Luego `RESEND_API_KEY`, `EMAIL_FROM` (p. ej. `faro@tudominio`), `EMAIL_REPLY_TO` (buzón real), `EMAIL_MODE=real`. Webhook: Resend → Webhooks → `https://<app>/api/webhooks/email`, eventos delivered/bounced/complained/opened/clicked (+ inbound si lo usas) → copia el `whsec_...` a `RESEND_WEBHOOK_SECRET`. **`SEND_ENABLED=true` solo para el lote real del sábado, dentro de ventana (sáb 8:00–15:00), y vuelve a `false` después.** Sin `EMAIL_FROM`, `SENDER_*` o `EMAIL_REPLY_TO`, el envío real se bloquea solo (`sender_incomplete`).
- **Dapta**: (a) Widget: pega el script del agente de texto en `DAPTA_WIDGET_SNIPPET`; se muestra en `/d/[slug]` dentro de un iframe aislado (verifica que funcione sin `allow-same-origin`; si no, ajústalo en `src/app/d/_components`). (b) Flow Studio: crea un paso HTTP POST a `https://<app>/api/webhooks/dapta` con header `x-dapta-secret: <DAPTA_WEBHOOK_SECRET>` y un body con `lead_id` o `slug`, `qualified`, `score`, `summary`, `conversation_id` y `ai_replies` (ejemplo en `specs/F15-dapta.md`). (c) Según lo que digan los organizadores: `DAPTA_MODE=http_push` con `DAPTA_PUSH_URL` + `DAPTA_PUSH_API_KEY` (usa `POST /api/dapta/push`), o `DAPTA_MODE=csv_export` y descarga `GET /api/dapta/export.csv` para importarlo como secuencia. Créditos: `DAPTA_CREDIT_USD=0.001`, `DAPTA_CREDITS_PER_AI_REPLY=40`.
- **Meta Ads**: `META_ADS_CAMPAIGN_ID=<id>`. En `/app/settings/ads` copia el enlace UTM (`/d/icp/clinicas-dentales-bogota?utm_source=meta&utm_medium=paid_social&utm_campaign=<id>`) y úsalo como destino del anuncio. El gasto se carga a mano o por CSV en la misma página; queda atribuido a los leads `meta_ads` y aparece en "Pauta vs. fuentes gratuitas".
- **WhatsApp (opcional)**: `WHATSAPP_ENABLED=true` solo si la SIM nueva funciona en Dapta. Exporta `GET /api/whatsapp/export.csv` (solo teléfonos de empresa de CO, dentro de ventana, sin quien ya recibió correo) e impórtalo en una secuencia de Dapta. El webhook de vuelta es `POST /api/webhooks/whatsapp` con `WHATSAPP_WEBHOOK_SECRET`. Faro no envía nada por WhatsApp.

## 4. Probar todo en local (5 comandos)
```bash
npm ci
cp .env.example .env.local   # sin llaves todo cae a mock; OSM y datos.gov.co son reales
npm run db:migrate && npm run db:seed
npm run dev                  # http://localhost:3000 · /app/new · /app/hunts/demo · /app/dashboard?demo=1 · /d/demo-clinica
npm run check && npm run e2e:smoke
```
Extra: `npm run coverage:sources` regenera `reports/coverage.md` con datos reales (≈3 min).

## 5. Riesgos abiertos y hallazgos MINOR pendientes
El detalle de cada uno está en `specs/reviews/Fxx-rN.md` (última ronda de cada feature).

**Decisiones que son tuyas**
- ICP final: la recomendación es dental Bogotá (ver sección 2).
- Nombre del producto: `NEXT_PUBLIC_PRODUCT_NAME`.
- Licencia del repo público: el README dice "por definir".
- Cuenta y página de Meta.
- Dominio de envío y remitente legal.

**Riesgos**
- **Historial de git con nombres de personas (decídelo antes de publicar el repo).** En el árbol actual de `main` no hay nombres de personas: fixtures, tests y reviews están saneados. Pero el commit `8ab2031` incluyó la primera versión de `specs/reviews/F19-r3.md`, que citaba ~10 nombres de odontólogos tomados de OSM, corregidos en un commit posterior. El loop no reescribe historia, así que antes de hacer público el repo conviene publicarlo con historia nueva (por ejemplo, un repo público creado desde un único commit squash de `main`). El commit `3110ba0` de F02 ya no es alcanzable desde ninguna rama.
- **Nombres de persona en OSM.** El filtro es una lista blanca más una heurística. La fuga medida en dentistas reales es de ~0,7 % (casos tipo "Clínica odontológica Dra. Ruth"), y la mejora de recall va en F19b. Esos leads nunca son contactables sin NIT.
- **Dapta.** Falta confirmar cómo recibe leads el entorno de prueba y si el widget funciona en iframe sandbox sin `allow-same-origin`.
- **Webhooks sin probar con payloads reales.** El de Resend (`email.received`) y el de Apify (campos del actor) se armaron con supuestos.
- **Seguridad básica, no endurecida.** La cookie `faro_key` va en claro y sin CSRF explícito. El rate limit de `/api/contact` y `/api/events` es en memoria (por instancia en Vercel). `x-forwarded-for` solo es confiable detrás del proxy de Vercel.
- **Concurrencia.** Los locks de hunts y webhooks usan `pg_advisory_xact_lock` y funcionan en Postgres. `attributeAdSpend` y `saveAdSpend` van en transacciones separadas, y dos cargas concurrentes de la misma campaña podrían duplicar cost entries.
- **Overpass y Socrata no registran `api_calls`.** Las líneas de costo de 0 USD con licencia sí se registran. `recordPlacesCost` no está cableado al hunt.
- **PGlite local.** Con varios procesos sobre el mismo `.pglite` puede abortar. Si pasa, `rm -rf .pglite`. En producción usa Supabase. Playwright corre con 1 worker por esa razón.
- **Festivos.** Solo cubren 2026 (`src/config/holidays-co-2026.ts`).

**MINOR destacados no corregidos**
- `isGenericEmail` deja pasar sufijos con apellido (`clinica.perez@`).
- Mensajes que quedan en `sending` tras un fallo ambiguo de Resend bloquean a la empresa y no tienen pantalla de revisión manual.
- En el bandit falta un test con costos mock/demo.
- El recibo de un lead real con costo mock suma las líneas mock con sello.
- La landing tiene 1 error de consola de Lighthouse.
- La UI de WhatsApp es solo JSON (sin vista).

## 6. Guion sugerido de la demo (3 min)
1. **0:00–0:20 · Landing `/`.** Pregunta del hero, video de 33 s, "Cómo funciona" en 4 pasos y bloque de cumplimiento. "3 de cada 5 leads de Dapta preguntan cómo conseguir clientes."
2. **0:20–0:50 · `/app/new`.** Clic en el ejemplo "Clínicas odontológicas en Bogotá". Mostrar chips editables y tarjetas por fuente (OSM y datos.gov.co reales, Places en mock). Lanzar la búsqueda.
3. **0:50–1:30 · `/app/hunts/[id]`.** Los puntos aparecen en el mapa oscuro; contadores por fuente, "N duplicados fusionados" y lista. Abrir un lead: fuentes con licencia, score con evidencia citada y recibo de lead. Mencionar que las personas naturales se excluyen.
4. **1:30–2:00 · `/app/hunts/[id]/outreach`.** Mensaje generado con remitente, motivo y baja. Bloqueos de cumplimiento explicados, ventana de Ley 2300 y banner "SEND_ENABLED". Mostrar el lote real enviado el sábado.
5. **2:00–2:20 · `/d/<slug>`.** La página de diagnóstico que recibe la clínica: 3 hallazgos públicos, widget de Dapta y baja de un clic.
6. **2:20–2:50 · `/app/dashboard`.** KPIs con intervalo del 90 %, matriz fuente × canal (CPL / % calificado / CPLC), "Pauta vs. fuentes gratuitas", recomendación honesta, panel de cumplimiento y clic en una celda hasta el recibo. Opcional: la tarjeta del bandit con "Dónde invertir el próximo dólar".
7. **2:50–3:00 · Cierre.** "¿Dónde me conviene buscar clientes y cuánto me cuesta cada uno? Faro lo responde con datos reales y trazables, e integrado con Dapta."

## Anexo · Bitácora del loop nocturno
- 2026-10-17 03:24 · F00 → DONE: Next 16 + Tailwind v4 + Drizzle/PGlite + Vitest + Playwright; check verde; 4 MINOR en review
- 2026-10-17 03:27 · F01 → DONE: 16 tablas Drizzle, migraciones PGlite, seed is_demo; 4 MINOR (ver specs/reviews/F01-r1.md)
- 2026-10-17 03:44 · F02 → DONE: reports/coverage.md real: ICP recomendado dental Bogotá (70 jurídicas verificadas contactables vs 12 restaurantes Bogotá; Miami 336 por verificar)
- 2026-10-17 03:51 · F04 → DONE: RUES por CIIU+cámara, REPS dental, SoQL seguro, filtro jurídico; 4 MINOR (F04-r1)
- 2026-10-17 03:52 · F03 → DONE: Overpass endurecido: caché, rate limit, mirror, raw con lista blanca, email genérico; 4 MINOR (F03-r2)
- 2026-10-17 03:55 · F09 → DONE: Ventanas CO+festivos 2026, supresión, opt-out HMAC con POST, gate correo genérico, /baja; 2 MINOR (F09-r2). Requiere OPTOUT_SECRET en prod
- 2026-10-17 04:01 · F08 → DONE: ICP NL→criteria (Zod), scoring con evidencia y anti-injection, costo IA; mock sin llave. MINOR: legalVerified no persistido → F10 debe bloquear no verificados
- 2026-10-17 04:03 · F07 → DONE: Dedupe NIT/nombre trigram+80m/dominio/teléfono, nunca pierde fuentes, 5k<2s; 3 MINOR (F07-r2)
- 2026-10-17 04:05 · F13 → DONE: Prorrateo exacto, recibo, métricas por canal con Beta 90%, migración automática, demo/mock separados; 7 MINOR (F13-r2). Endpoints sin control de acceso
- 2026-10-17 04:05 · F15 → DONE: Webhook con secreto, http_push con SSRF y SEND_ENABLED, csv_export anti-fórmulas, créditos; requireAppAccess (APP_ACCESS_KEY). 7 MINOR (F15-r2)
- 2026-10-17 04:09 · F05 → DONE: Places API (New) Text Search, field mask mínimo, mock sin llave, costo de lista. MINOR: recordPlacesCost no cableado al hunt; riesgos SKU/caché Google
- 2026-10-17 04:13 · F12 → DONE: /d/[slug] y /d/icp/[icpSlug], widget Dapta aislado o placeholder, opt-out, eventos con dedupe/rate limit, formulario con honeypot; 3 MINOR (F12-r3)
- 2026-10-17 04:22 · F14 → DONE: Tablero: KPIs con IC 90%, matriz fuente×canal trazable a recibos, embudo, pauta vs gratis, recomendación honesta, cumplimiento, toggle demo; 3 MINOR (F14-r2)
- 2026-10-17 04:29 · F10 → DONE: Mensajes IA con remitente/baja/dirección, canal email>form asistido, cola atómica con idempotency key, ventanas, SEND_ENABLED=false→simulated; 4 MINOR (F10-r2)
- 2026-10-17 04:37 · F06 → DONE: Fetch directo con robots/SSRF/guard Maps-redes, correos genéricos estrictos, redacción de nombres, Apify mock con prorrateo; 2 MINOR (sufijos con apellido en isGenericEmail)
- 2026-10-17 04:39 · F18 → DONE: Landing estilo Dapta + video HyperFrames local (1,2 MB, rotulado demostración); Lighthouse móvil 94–96/100, desktop 100/100; MINOR aplicados
- 2026-10-17 04:49 · F20 → DONE: Thompson sampling por fuente con P(mejor), datos insuficientes honestos, simulación siempre etiquetada; 2 MINOR (F20-r2)
- 2026-10-17 04:53 · F17 → DONE: WhatsApp vía Dapta: CSV de secuencias tras WHATSAPP_ENABLED, solo teléfonos de empresa CO, webhook con secreto, STOP suprime; 3 MINOR
- 2026-10-17 04:54 · F16 → DONE: UTM builder, fbclid→meta_ads, carga de gasto manual/CSV con clave demo separada, CPL meta_ads real; 1 MINOR
- 2026-10-17 04:56 · F11 → DONE: Webhook Resend (Svix) con idempotencia, reply→responded sin retroceder, baja por texto suprime siempre, marcado manual auditado; 3 NIT
- 2026-10-17 05:05 · F21 → DONE: README completo (arquitectura, fuentes/licencias, costos, cómo correr verificado desde cero); requireAppAccess en receipt/matrix; F19 pendiente de actualizar en README
- 2026-10-17 05:09 · F19 → DONE: Mapa MapLibre con capa GeoJSON y clusters (2k pts), lotes reanudables con advisory lock, panel, lista virtualizada, drawer con LeadReceipt; nombres de persona OSM excluidos por lista blanca. MAJOR abierto (recall: descarta 74% restaurantes) → F19b
- 2026-10-17 05:38 · F19b → DONE: Filtro de nombres por categoría: restaurantes 97% y dental 94% conservados, 0 personas; enmascarados sin datos personales; fixtures sintéticos; README F19 actualizado
