# Faro — Spec maestro (v0.1)

> Nombre de trabajo: **Faro** (provisional; configurable en `NEXT_PUBLIC_PRODUCT_NAME`).
> Hackathon: 30X Hackathon · Reto Dapta "Más leads, menor costo".
> Entrega: **domingo 18 oct 2026 antes de las 12:00 m. (Bogotá)**. Sin prórroga.
> Este documento es la fuente de verdad. Los sub-specs en `specs/` se derivan de aquí y no pueden contradecirlo.

---

## 0. En una frase

**Una pyme describe a su cliente ideal y Faro lo busca en fuentes gratuitas, lo contacta, se lo pasa a Dapta para calificarlo y le dice cuánto le costó cada lead según dónde lo encontró, comparado con la pauta.**

Pregunta que responde el producto: **"¿Dónde me conviene buscar clientes y cuánto me cuesta cada uno?"**

---

## 1. Brief oficial del reto (copia fiel)

**Reto Dapta: Más leads, menor costo**

**01 · El reto en una frase.** Construyan una plataforma que encuentre clientes potenciales en fuentes gratuitas, los contacte y mida cuánto cuesta cada lead por canal, para saber dónde conviene buscar.

**02 · El problema.** Dapta ayuda a las pymes a convertir sus leads, pero 3 de cada 5 leads que llegan a Dapta preguntan si también les ayudamos a conseguirlos. Dependen de la pauta y no saben en qué canal buscar ni cuánto les cuesta cada lead.

**03 · El alcance.** Una plataforma que encuentra leads en fuentes gratuitas, los contacta y mide el costo por lead (CPL) de cada canal. Cerrar la venta queda por fuera.

**04 · Lo que debe hacer la plataforma**
1. **Encontrar:** busca leads en varias fuentes. Al menos 2 fuentes públicas y gratuitas: mapas, directorios, redes, sitios web. Los guarda en un solo lugar, sin duplicados.
2. **Contactar:** hace el primer acercamiento. Envía el mensaje por el canal que tenga cada lead y registra quién respondió.
3. **Medir:** calcula el CPL por canal. Muestra cuántos leads salieron de cada fuente y cuánto costó cada uno.
4. **Calificar:** pasa los leads a Dapta. Dapta califica cada lead y la plataforma compara canales por costo y por calidad.

**05 · Con qué trabajar.** El perfil de cliente ideal para buscar, una lista de fuentes sugeridas, 50 empresas de ejemplo para probar y un entorno de prueba de Dapta con un agente calificador listo para recibir leads.
> Nota del equipo: los organizadores respondieron sobre el ICP y las 50 empresas: *"Deben generarla, puede ser de empresas que encuentren con la solución que están creando o una base de prueba que creen."* → El ICP y la base de prueba los definimos nosotros.

**06 · Entregable esperado.** La plataforma funcionando en vivo, con los leads reales que encontró durante el evento y su CPL por canal.

**07 · Cómo se mide.** Leads del perfil encontrados, costo por lead de cada canal y, si se conecta con Dapta, porcentaje de leads calificados por canal.

**08 · Requisitos**

Obligatorio:
- Buscar leads en al menos 2 fuentes públicas y gratuitas.
- Guardar todo en un solo lugar y quitar duplicados.
- Filtrar los leads que encajan con el perfil de cliente ideal.
- Enviar un primer mensaje y registrar la respuesta.
- Mostrar un tablero con leads y CPL por canal.
- Usar solo datos públicos de empresas, respetando los términos de cada fuente y la ley de protección de datos.

Deseable:
- Enviar los leads al agente de Dapta para que los califique.
- Comparar canales por CPL y por porcentaje de leads calificados.
- Calcular el costo por lead calificado de cada canal.

*Así se ve qué canal trae leads baratos y cuál trae leads buenos.*

**Entregables del hackathon:** video pitch de 3 minutos, demo desplegada con URL pública y repositorio público en GitHub que coincida con la demo.

---

## 2. Contexto y restricciones reales (leer antes de construir)

| Tema | Estado al 17 oct, 03:00 | Implicación para el código |
|---|---|---|
| WhatsApp vía Meta/Dapta | Bloqueado: cuenta restringida y número rechazado (#3441034). Puede intentarse con una SIM nueva el sábado. | WhatsApp es un adapter **opcional**. Todo debe funcionar sin él. |
| Entorno de prueba de Dapta | No sabemos aún cómo recibe leads (API, webhook, CSV o secuencia) ni si trae número conectado. Pregunta enviada a organizadores. | `DaptaQualifierAdapter` con 3 modos: `http_push`, `csv_export`, `widget_only`. Elegible por env. |
| Créditos Dapta | Cuenta gratis ~2.000 créditos (≈49 respuestas de IA, 40 créditos por respuesta). Prueba Pro 7 días = 100.000 créditos. | Contabilizar créditos por conversación en el modelo de costo. |
| Presupuesto en dinero | 10–20 USD totales (Meta Ads ~10, dominio, Claude API, Apify). | Costos reales registrados línea por línea. |
| Ley colombiana | Ley 1581/2012 (habeas data) y Ley 2300/2023 (horarios de contacto). | Solo personas jurídicas, correos genéricos, opt-out, ventanas de envío. Ver §8. |
| Términos de fuentes | OSM (ODbL, atribución, uso moderado de Overpass). datos.gov.co (CC BY-SA 4.0). Google Maps **solo vía Places API oficial**, nunca scraping. | Atribución visible, caché, rate limit por adapter. |
| Envíos reales | Solo sábado en horario permitido. **Nunca domingo.** | Scheduler bloquea fuera de ventana. `SEND_ENABLED=false` por defecto. |
| Equipo | Joen (dev fullstack, Bogotá). Equipo "Comti" en Hack Radar. | No usar la marca Comti en mensajes a leads: usar el nombre del producto + "proyecto 30X Hackathon". |

---

## 3. Usuarios y escenarios

- **Usuario de Faro:** una pyme (cliente actual o potencial de Dapta) que quiere conseguir clientes B2B. Ej.: una empresa de software de agendamiento, una agencia de marketing en Miami, un proveedor de insumos dentales.
- **Lead:** una **empresa** (persona jurídica) que encaja con el perfil de cliente ideal de esa pyme.

**ICP principal de demo (envíos reales):** se elige el sábado temprano con la prueba de cobertura (F02). Candidato por defecto: *"Clínicas odontológicas (persona jurídica) en Bogotá con sitio web"*. Debe poder cambiarse sin tocar código.

**ICP secundario de demo (solo búsqueda, sin envíos):** *"Restaurantes o clínicas en Miami para una agencia latina"*. Demuestra que Faro sirve para cualquier pyme y mercado (Dapta crece en EE. UU. y LatAm).

---

## 4. Definiciones clave (no ambiguas)

- **Fuente (source_channel):** dónde se encontró el lead. Valores: `osm`, `rues`, `reps` (plugin salud), `google_places`, `website` (enriquecimiento), `meta_ads` (inbound pagado), `sample` (base de prueba, marcada). Esto es lo que el brief llama "canal" en "cuántos leads salieron de cada fuente".
- **Canal de contacto (contact_channel):** por dónde se hizo el primer acercamiento. Valores: `email`, `web_form` (asistido), `whatsapp` (vía Dapta), `dapta_widget` (inbound a la página de diagnóstico).
- **Lead encontrado:** empresa única tras el dedupe.
- **Lead del perfil (fit):** lead con `fit_score >= ICP.threshold` (por defecto 60/100), evaluado con evidencia.
- **Lead contactado:** al menos un mensaje enviado con éxito.
- **Lead que respondió:** respuesta registrada (respuesta de correo, conversación iniciada en el widget o WhatsApp, o formulario enviado).
- **Lead calificado:** resultado `qualified = true` devuelto por Dapta (o por el agente de respaldo, marcado como tal).
- **CPL (por fuente o por canal):** `costo total atribuido / leads del perfil` de esa fuente o canal.
- **CPLC (costo por lead calificado):** `costo total atribuido / leads calificados`.
- **Recibo de lead:** detalle línea por línea del costo de un lead (ver §7).

---

## 5. Requisitos → features (trazabilidad)

| Requisito del brief | Feature(s) | Prioridad |
|---|---|---|
| ≥2 fuentes públicas y gratuitas | F03 Overpass/OSM, F04 datos.gov.co (RUES/REPS), F05 Google Places, F06 enriquecimiento web (Apify/fetch) | P0 (F03+F04), P1 (F05, F06) |
| Un solo lugar, sin duplicados | F01 modelo de datos, F07 dedupe | P0 |
| Filtrar por ICP | F08 ICP desde lenguaje natural + scoring con evidencia | P0 |
| Primer mensaje y registrar respuesta | F10 outreach (correo + formulario asistido), F11 registro de respuestas, F12 página de diagnóstico | P0 |
| Tablero con leads y CPL por canal | F13 costos/recibo, F14 tablero | P0 |
| Solo datos públicos de empresas, términos y ley | F09 cumplimiento (filtros, opt-out, ventanas, atribución) | P0 |
| Enviar leads a Dapta para calificar | F15 integración Dapta | P1 |
| Comparar canales por CPL y % calificados, CPLC | F14 (vistas de calidad) | P1 |
| Pauta como canal de control | F16 Meta Ads (UTM + spend manual) | P1 |
| WhatsApp | F17 adapter WhatsApp vía Dapta (export CSV / secuencias) | P2 |
| Experiencia "wow" | F18 landing con video HyperFrames, F19 búsqueda en vivo con mapa, F20 recomendación automática + bandit | P1 (F18, F19), P2 (F20) |

P0 = sin esto no se entrega. P1 = lo que gana. P2 = solo si sobra tiempo.

---

## 6. Arquitectura

### Stack
- **Next.js (App Router, versión estable actual) + TypeScript estricto**, Tailwind CSS, shadcn/ui, Framer Motion.
- **Mapa:** MapLibre GL (`react-map-gl/maplibre`). Basemap oscuro gratuito y sin API key (p. ej. CARTO Dark Matter u OpenFreeMap), configurable en `NEXT_PUBLIC_MAP_STYLE_URL`. Atribución OSM siempre visible.
- **Gráficas:** Recharts o visx, siguiendo el skill de dataviz si está disponible.
- **Base de datos:** Postgres con **Drizzle ORM**. Desarrollo local sin Docker con **PGlite**. Producción: Supabase (`DATABASE_URL`). Migraciones versionadas.
- **IA:** Anthropic API (modelo configurable en `ANTHROPIC_MODEL`). Respuestas en JSON validadas con Zod. Registrar `usage` de cada llamada para el costo.
- **Correo:** Resend (o SMTP) detrás de `EmailAdapter`.
- **Validación:** Zod en todas las fronteras (API, adapters, webhooks).
- **Tests:** Vitest (unit e integración) + Playwright (smoke e2e y capturas).
- **Deploy:** Vercel. Las tareas largas se dividen en lotes cortos (cada request < 60 s) con progreso persistido en DB y reanudable.

### Patrón de integraciones (obligatorio)
Cada servicio externo vive en `src/integrations/<servicio>/` con:
- `types.ts`: interfaz del adapter.
- `real.ts`: implementación real.
- `mock.ts`: implementación con fixtures realistas **marcadas como mock**.
- Selección por env: `<SERVICIO>_MODE=real|mock`. Si falta la credencial, cae a `mock` y la UI lo muestra en Configuración ("Modo demo").
- Cada llamada real registra costo (si aplica), latencia y error en `api_calls`.

Servicios: `overpass`, `socrata` (RUES/REPS), `google_places`, `apify`, `website_fetch` (fetch directo respetando robots.txt), `anthropic`, `email`, `dapta`, `whatsapp` (vía Dapta), `meta_ads` (manual).

### Modelo de datos (mínimo)
- `workspaces`: la pyme usuaria (nombre, descripción de su oferta, remitente, país).
- `icp_profiles`: `prompt` original, `criteria` JSON estructurado (sector, CIIU[], tags OSM[], tipos Places[], ciudad, bbox, tamaño, señales[], exclusiones[]), `threshold`, `version`.
- `hunts`: una búsqueda (icp_profile_id, estado, progreso por fuente, timestamps).
- `companies`: entidad única (nombre normalizado, NIT si existe, dirección, lat/lng, ciudad, sitio web, `is_legal_entity`, `is_demo`).
- `company_sources`: (company_id, source_channel, external_id, raw JSON, url_fuente, licencia, fetched_at). Una empresa puede tener varias fuentes.
- `contact_points`: (company_id, tipo `email|phone|whatsapp|web_form`, valor, `is_generic`, fuente, url_evidencia).
- `fit_assessments`: (company_id, icp_profile_id, score 0–100, criterios cumplidos con evidencia y URL, `why_now`, modelo, tokens).
- `leads`: (company_id, hunt_id, estado: `found → fit → contacted → responded → qualified | disqualified | opted_out`, `primary_source`, `slug` para la página de diagnóstico).
- `messages`: (lead_id, contact_channel, asunto, cuerpo, estado, provider_id, enviado_at, bloqueado_por_regla).
- `events`: (lead_id, tipo: `sent|delivered|click|reply|widget_open|widget_chat|form_submit|qualified|disqualified|opt_out`, payload, utm, at).
- `qualifications`: (lead_id, origen `dapta|fallback`, qualified, score, campos BANT, resumen, conversation_id, créditos usados).
- `cost_entries`: (lead_id nullable, hunt_id, source_channel, contact_channel, categoría `data|ai|scraping|email|whatsapp|dapta|ads|human`, cantidad, unidad, tarifa, usd, evidencia, at).
- `cost_rates`: tarifas configurables (USD por 1M tokens in/out, por resultado de Apify, por llamada de Places, por correo, por crédito de Dapta, por plantilla de WhatsApp, por minuto humano).
- `ad_spend`: (plataforma, campaña, fecha, usd, impresiones, clics), cargado a mano o por CSV.
- `suppression`: (dominio/correo/teléfono, motivo, at).
- `api_calls`: log técnico.

### Dedupe (F07)
1. Si hay NIT: match exacto.
2. Si no: nombre normalizado (minúsculas, sin tildes, sin sufijos `S.A.S.`, `SAS`, `LTDA`, `IPS`, `E.U.`, palabras genéricas del sector) con similitud trigram ≥ 0,6 **y** distancia ≤ 80 m (o mismo dominio web, o mismo teléfono normalizado E.164).
3. Merge: se conserva una `company` y se agregan todas las `company_sources`. Nunca se pierde una fuente.
4. Mostrar en la UI "N duplicados fusionados" con detalle por par.
5. Si `pg_trgm` no está disponible en PGlite, implementar trigram en TS con tests.

---

## 7. Modelo de costo (el corazón del tablero)

`costo_lead = datos + scraping + IA + envío + whatsapp + dapta + pauta + humano`

| Categoría | Cómo se calcula | Fuente del número |
|---|---|---|
| datos | Llamadas a Places × tarifa (0 dentro del tier gratuito, pero se muestra el valor de lista y "cubierto por tier gratuito") · OSM/datos.gov.co = 0 con licencia visible | `api_calls` + `cost_rates` |
| scraping | Costo real de la corrida de Apify (`usageTotalUsd`) prorrateado por empresa | API de Apify |
| IA | `usage.input_tokens/output_tokens` × tarifa del modelo | respuesta de Anthropic |
| envío | Correos × tarifa (0 en tier gratuito, mostrado igual) | proveedor |
| whatsapp | Plantillas de marketing × tarifa Meta Colombia (configurable) | config |
| dapta | Respuestas de IA × 40 créditos × (1 USD / 1.000 créditos) | webhook o export de Dapta |
| pauta | `ad_spend` de la campaña ÷ leads atribuidos por UTM | carga manual |
| humano | Minutos del canal formulario asistido × tarifa/hora configurable | registro en UI |

Reglas:
- Costos **compartidos** (p. ej. una consulta de Overpass que trae 400 empresas) se prorratean entre los leads de esa fuente y esa corrida.
- Todo número del tablero se puede abrir hasta su recibo y sus `cost_entries`.
- Con muestras pequeñas, mostrar **intervalo creíble 90 % (Beta)** junto a cada porcentaje.
- Datos `is_demo` o `mock` **nunca** se mezclan con los reales en los totales. Toggle visible "Incluir datos de prueba" (apagado por defecto).

---

## 8. Cumplimiento (es requisito obligatorio y además parte del pitch)

- **Solo personas jurídicas.** Excluir "profesional independiente" y personas naturales (RUES/REPS por naturaleza jurídica; heurística para OSM/Places marcada como "por verificar").
- **Solo contactos genéricos de empresa** (`info@`, `contacto@`, `citas@`, `hola@`, `ventas@`, etc.). Descartar correos con apariencia de nombre propio. No guardar nombres de personas (odontólogos, representantes legales).
- **Remitente identificado:** nombre del producto, "proyecto del 30X Hackathon", correo de respuesta real, motivo del contacto ("su empresa aparece en [fuente pública]").
- **Opt-out de un clic** en todo mensaje → `suppression` → nunca más se contacta.
- **Ventanas de envío (Ley 2300, adoptada voluntariamente):** lunes a viernes 7:00–19:00, sábado 8:00–15:00, **nunca domingo ni festivos** (lista de festivos de Colombia 2026 en config). EE. UU.: solo correo, CAN-SPAM (dirección física + baja); nada de llamadas ni SMS.
- **Máximo 1 mensaje por empresa** durante el evento. Sin seguimientos automáticos.
- **robots.txt** respetado en todo fetch a sitios web. User-Agent identificado. Timeouts cortos. Sin autenticación ni formularios automáticos.
- **Atribución** visible de OSM (ODbL) y datos.gov.co (CC BY-SA 4.0) en mapa, tablero y README.
- **Google Maps:** solo Places API oficial. Prohibido scraping de Google Maps (incluido Apify sobre Maps).
- **Panel de cumplimiento** en el tablero: personas naturales contactadas (debe ser 0), % mensajes con remitente identificado, opt-outs respetados, envíos bloqueados por horario.
- `SEND_ENABLED=false` por defecto. Solo Joen lo activa.

---

## 9. Flujos de punta a punta

### 9.1 Búsqueda
1. El usuario escribe su oferta y su cliente ideal en una frase (o elige un ejemplo).
2. Claude devuelve `criteria` estructurado. El usuario lo ve como chips editables (sector, ciudad, señales, exclusiones) y un **estimado por fuente** antes de lanzar.
3. "Lanzar búsqueda" → la vista en vivo muestra cada fuente trabajando en paralelo, los puntos apareciendo en el mapa y contadores (encontrados, duplicados fusionados, del perfil).
4. Enriquecimiento web por lotes (contactos genéricos, señales) y scoring de encaje con evidencia.

### 9.2 Contacto
1. El usuario selecciona leads del perfil (filtros por fuente, score y canal disponible).
2. Faro genera un mensaje personalizado por lead (vista previa editable) que lleva a su **página de diagnóstico** `/d/[slug]?c=<canal>&s=<fuente>`.
3. Canal elegido automáticamente según lo que tenga el lead: correo genérico > formulario web (asistido: Faro copia el texto, abre el formulario, el usuario envía y marca "enviado", con su tiempo contabilizado) > WhatsApp (si está activo).
4. El scheduler respeta las ventanas y la supresión. Cada mensaje genera `events`.

### 9.3 Respuesta y calificación
1. Respuestas por correo: webhook inbound del proveedor si existe; si no, marcado manual auditado ("Marcar respondió" con nota).
2. Página de diagnóstico: hallazgos públicos de la empresa + **widget de Dapta** + botón "No me interesa / darme de baja".
3. Dapta califica: conversación → resultado por webhook (Flow Studio POST → `/api/webhooks/dapta` con secreto compartido) o por modo `http_push` / `csv_export` según lo que diga el entorno de prueba.
4. El lead cambia de estado y el mapa y el tablero se actualizan en vivo.

### 9.4 Pauta (canal de control)
1. Enlace con UTM `utm_source=meta&utm_campaign=<id>` hacia una página de diagnóstico genérica del ICP, con el mismo widget de Dapta y formulario de contacto de empresa con consentimiento y política de privacidad.
2. El gasto se carga a mano en Configuración → Pauta.
3. En el tablero, `meta_ads` aparece como una fuente más: "Pauta vs. fuentes gratuitas".

---

## 10. Vistas (UI/UX)

**Regla de diseño obligatoria:** toda vista se diseña e implementa usando el comando/skill **`/design`** del entorno de Claude Code. Si `/design` no está disponible, usar el skill `frontend-design` y dejar nota en `DECISIONS.md`. Cada vista se valida con capturas de Playwright en 1440×900 y 390×844 antes de darla por terminada.

**Sistema visual (estilo Dapta, extraído de dapta.ai el 17 oct 2026):**
- Fondo: negro `#000000`; superficies `#0F0F0F`, `#1A1A1C`, `#343437`.
- Acento principal: lima `#CBE850` (botones primarios con texto `#1A1A1C`, resaltados, bordes activos).
- Texto: blanco `#FFFFFF`; secundario `rgba(255,255,255,0.6)`; terciario `#9B9999`.
- Bordes sutiles: `rgba(255,255,255,0.14)`; estado activo `#CBE850`.
- Degradado de marca: `linear-gradient(90deg, #CBE850 0%, #000000 100%)`, más un brillo violeta difuso de fondo en el hero.
- Tipografía: **Poppins** (títulos, 600–700, tracking negativo ~-0,02em) + **DM Sans** (texto y UI).
- Radios: botones 10 px, tarjetas 16 px. Sombras mínimas, profundidad con capas de gris.
- Modo oscuro por defecto. Contraste AA mínimo.
- Tokens en `src/styles/tokens.css` como variables CSS + `tailwind.config`.
- No copiar logos ni marca de Dapta. Mencionar "Integrado con Dapta" como texto.

**Vistas:**
1. **Landing `/`.** Hero ("¿Dónde están tus próximos clientes y cuánto te cuestan?"), CTA lima "Encontrar mis clientes", **video demo compuesto con `/hyperframes`** (MP4 en `public/demo/`, con poster), sección "Cómo funciona" en 4 pasos (Encontrar, Contactar, Medir, Calificar con Dapta), sección "Pauta vs. fuentes gratuitas" con números reales del evento (desde la API), bloque de cumplimiento y footer con atribuciones.
2. **Nuevo perfil `/app/new`.** Input grande tipo conversación con ejemplos clicables (Bogotá y Miami). Animación mientras Claude estructura. Chips editables. Tarjetas por fuente con estimado y estado (real/mock).
3. **Búsqueda en vivo `/app/hunts/[id]`** (la pantalla estrella). Mapa a pantalla completa en tema oscuro; puntos que aparecen con animación al llegar (gris = encontrado, lima = del perfil, blanco con halo = contactado, lima con pulso = calificado). Clusters a bajo zoom. Panel lateral con contadores animados por fuente, lista virtualizada filtrable y "N duplicados fusionados". Línea de tiempo de la búsqueda.
4. **Detalle de lead (drawer).** Empresa, fuentes con enlaces y licencias, contactos genéricos, score con criterios cumplidos y evidencia citada, "por qué ahora", mensaje generado, línea de tiempo de eventos, conversación y resultado de Dapta, **Recibo de lead** con estética de recibo.
5. **Contacto `/app/hunts/[id]/outreach`.** Selección masiva, canal por lead, vista previa, validaciones de cumplimiento en vivo (bloqueos explicados), cola con ventana horaria y modo formulario asistido.
6. **Página de diagnóstico `/d/[slug]`.** Pública, ligera y móvil primero. 3 hallazgos sobre la empresa con fuente, widget de Dapta, opt-out de un clic, identificación del remitente, aviso de privacidad.
7. **Tablero `/app/dashboard`.** Fila de KPIs (leads del perfil, CPL global, % calificado, CPLC). **Matriz fuente × canal** (heatmap con CPL / % calificado / CPLC conmutables). Embudo por fuente. Comparación "Pauta vs. fuentes gratuitas". Barras de CPL vs. CPLC por canal. Frase de recomendación generada a partir de los números ("Conviene buscar en X: …"), con datos insuficientes señalados honestamente. Panel de cumplimiento. Toggle de datos de prueba.
8. **Configuración `/app/settings`.** Estado de cada integración (real / mock / error) con botón "Probar conexión", tarifas de costo, ventanas de envío, remitente, carga de gasto de pauta, `SEND_ENABLED` visible (solo lectura desde env).
9. **Baja `/baja/[token]`.** Confirmación inmediata.

Calidad UX exigida: estados vacíos, de carga (skeletons) y de error diseñados; microinteracciones sutiles; teclado y foco accesibles; nada de layouts genéricos de plantilla; español neutro en toda la UI; i18n preparado (es/en) para el ICP de Miami.

---

## 11. Endpoints (mínimo)
- `POST /api/icp/parse` → criteria estructurado.
- `POST /api/hunts` · `POST /api/hunts/[id]/run?source=...&cursor=...` (por lotes) · `GET /api/hunts/[id]/stream` (SSE o polling).
- `POST /api/leads/[id]/enrich` · `POST /api/leads/[id]/score`.
- `POST /api/outreach/preview` · `POST /api/outreach/send` (respeta `SEND_ENABLED`, ventanas y supresión).
- `POST /api/webhooks/email` · `POST /api/webhooks/dapta` (secreto) · `POST /api/webhooks/whatsapp` (si aplica).
- `GET /api/metrics/matrix` · `GET /api/metrics/receipt/[leadId]` · `GET /api/metrics/public` (números para la landing, sin datos de empresas).
- `POST /api/dapta/push` (modo `http_push`) · `GET /api/dapta/export.csv` (modo `csv_export`, formato de secuencias de Dapta ≤ 5 MB).
- `GET /api/optout/[token]`.
- `GET /api/health` (estado de integraciones).

---

## 12. Variables de entorno (`.env.example`)
```
NEXT_PUBLIC_PRODUCT_NAME=Faro
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=                      # vacío = PGlite local
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
ANTHROPIC_MODE=mock
OVERPASS_URL=https://overpass-api.de/api/interpreter
OVERPASS_MODE=real
SOCRATA_APP_TOKEN=                 # opcional
SOCRATA_RUES_DATASET=c82u-588k
SOCRATA_REPS_DATASET=c36g-9fc2
SOCRATA_MODE=real
GOOGLE_PLACES_API_KEY=
GOOGLE_PLACES_MODE=mock
APIFY_TOKEN=
APIFY_CONTACT_ACTOR_ID=            # verificar el sábado (Contact Details Scraper)
APIFY_MODE=mock
EMAIL_PROVIDER=resend
RESEND_API_KEY=
EMAIL_FROM=
EMAIL_REPLY_TO=
EMAIL_MODE=mock
SEND_ENABLED=false
DAPTA_MODE=widget_only             # widget_only | http_push | csv_export
DAPTA_WIDGET_SNIPPET=              # script embebible del agente de texto
DAPTA_PUSH_URL=                    # si el entorno de prueba lo da
DAPTA_PUSH_API_KEY=
DAPTA_WEBHOOK_SECRET=
DAPTA_CREDIT_USD=0.001
DAPTA_CREDITS_PER_AI_REPLY=40
WHATSAPP_ENABLED=false
META_ADS_CAMPAIGN_ID=
NEXT_PUBLIC_MAP_STYLE_URL=
SENDER_LEGAL_NAME=
SENDER_ADDRESS=
HUMAN_MINUTE_RATE_USD=0.42
```

---

## 13. Estructura del repo
```
/ (repo público)
  SPEC.md  LOOP.md  CLAUDE.md  README.md  HANDOFF.md  DECISIONS.md
  specs/            F00-*.md … F20-*.md (sub-specs) + STATUS.md
  src/app/          rutas (landing, app, d, baja, api)
  src/components/   UI (design system en components/ui)
  src/features/     icp, hunt, dedupe, scoring, outreach, metrics, compliance
  src/integrations/ overpass, socrata, google-places, apify, website-fetch, anthropic, email, dapta, whatsapp, meta-ads
  src/db/           schema, migrations, seed
  src/styles/       tokens.css
  fixtures/         respuestas reales cacheadas (con atribución) y mocks marcados
  scripts/          coverage-test.ts, seed-demo.ts, export-dapta.ts
  tests/            unit, integration, e2e
  public/demo/      video HyperFrames + poster
```

---

## 14. Lista de features (cada una → `specs/Fxx-nombre.md`)

| ID | Feature | Prio | Criterio de aceptación resumido |
|---|---|---|---|
| F00 | Scaffold: Next.js, TS estricto, Tailwind, shadcn, Drizzle+PGlite, Vitest, Playwright, lint, CI local (`npm run check`) | P0 | `npm run check` pasa; app arranca; README con cómo correr |
| F01 | Modelo de datos + migraciones + seed mínimo marcado `is_demo` | P0 | Migraciones corren en PGlite y en Postgres; tests de esquema |
| F02 | **Prueba de cobertura** `scripts/coverage-test.ts`: para 3 ICP (dental Bogotá, restaurantes Bogotá, restaurantes Miami) cuántas empresas trae OSM y datos.gov.co y qué % tiene web, teléfono o correo | P0 | Genera `reports/coverage.md` con datos **reales** (OSM y datos.gov.co no requieren llave) |
| F03 | Adapter Overpass (consulta por tags y bbox, caché a disco, rate limit, atribución) | P0 | Trae empresas reales de Bogotá; tests con fixture |
| F04 | Adapter Socrata (RUES por CIIU y municipio; REPS como plugin salud), solo personas jurídicas | P0 | Trae registros reales; filtro jurídico probado |
| F05 | Adapter Google Places API (Text Search, campos mínimos, conteo de llamadas) | P1 | Real con llave; mock sin llave |
| F06 | Enriquecimiento web: fetch directo con robots.txt + adapter Apify (contactos genéricos); extracción de señales | P1 | Detecta correos genéricos y formularios; descarta nombres propios |
| F07 | Dedupe y merge multi-fuente | P0 | Tests con casos reales de duplicados; UI muestra fusionados |
| F08 | ICP desde lenguaje natural + scoring con evidencia (Claude, JSON validado, costo registrado) | P0 | Score 0–100 con criterios y URLs; mock determinista |
| F09 | Cumplimiento: filtros, supresión, ventanas con festivos CO, opt-out, atribución, panel | P0 | Tests de ventana (domingo bloqueado), de supresión y de regex de nombres |
| F10 | Outreach: generación de mensajes, vista previa, envío por correo, formulario asistido, cola | P0 | Con `SEND_ENABLED=false` no sale nada y queda registrado como "simulado" |
| F11 | Registro de respuestas: webhook de correo + marcado manual auditado | P0 | Evento `reply` actualiza estado y métricas |
| F12 | Página de diagnóstico `/d/[slug]` + widget Dapta + opt-out | P0 | Funciona en móvil; UTM y canal registrados |
| F13 | Motor de costos y Recibo de lead | P0 | Prorrateos con tests; recibo cuadra con totales |
| F14 | Tablero: matriz, embudo, CPL/CPLC, pauta vs. gratis, recomendación, intervalos, cumplimiento | P0 (CPL) / P1 (calidad) | Números trazables a `cost_entries`; toggle de demo |
| F15 | Integración Dapta: webhook Flow Studio, `http_push`, `csv_export`, conteo de créditos | P1 | Webhook con secreto probado con payload de ejemplo |
| F16 | Meta Ads: UTMs, página genérica del ICP, carga de gasto, atribución | P1 | Leads con `utm_source=meta` aparecen como fuente `meta_ads` |
| F17 | WhatsApp vía Dapta (export CSV para secuencias, webhook de vuelta) | P2 | Detrás de `WHATSAPP_ENABLED` |
| F18 | Landing estilo Dapta + video demo con `/hyperframes` | P1 | Lighthouse ≥ 90 en performance y accesibilidad; video < 8 MB |
| F19 | Búsqueda en vivo con mapa (animaciones, clusters, panel, drawer) | P1 | Fluido con 2.000 puntos; capturas aprobadas en review |
| F20 | Recomendación automática + bandit Thompson (modo simulación etiquetado) | P2 | Nunca presenta simulación como real |
| F21 | README del repo público (arquitectura, fuentes y licencias, supuestos de costo, cómo correr, capturas) + HANDOFF.md | P0 | Un tercero puede correrlo en local en 5 minutos |

Orden de construcción: F00 → F01 → F02 → F03 → F04 → F07 → F08 → F09 → F13 → F10 → F11 → F12 → F14 → F15 → F16 → F19 → F18 → F05 → F06 → F21 → F20 → F17.
(F21 se actualiza incrementalmente desde el inicio.)

---

## 15. Fuera de alcance
Cerrar la venta, CRM completo, multiusuario y autenticación compleja (basta con una clave de acceso simple para `/app`), facturación, scraping de redes sociales o de Google Maps, contacto a personas naturales, seguimientos automáticos.

---

## 16. Definición de "terminado" para el hackathon
- URL pública con datos **reales** del evento (no mock) en el tablero.
- ≥ 2 fuentes reales, dedupe visible, ICP aplicado.
- ≥ 1 lote real de mensajes enviado el sábado en horario permitido, con respuestas registradas (aunque sean pocas).
- CPL por fuente y por canal trazable a recibos.
- Dapta conectado en al menos un modo, con % calificados por canal si hay conversaciones.
- Repo público = lo desplegado (deploy desde `main`, commit final etiquetado).
- Video de 3 minutos grabado.

---

## 17. Preguntas abiertas (Joen las resuelve el sábado)
1. Organizadores: ¿cómo se envían los leads al agente calificador del entorno de prueba (API, webhook, CSV, secuencia)? ¿Tiene número de WhatsApp o voz conectado? ¿El agente contacta o solo califica a quien ya respondió?
2. ICP principal definitivo, según `reports/coverage.md`.
3. ¿WhatsApp con SIM nueva funciona? (límite: 1 hora).
4. Cuenta publicitaria y página a usar para Meta Ads (la página de Comti está en un portafolio sin acceso).
5. Dominio de envío y remitente legal.
6. Nombre final del producto.
