# F28 · Meta Ads por API: métricas automáticas y campañas en pausa desde Faro

**Prioridad:** P1. **Depende de:** F13 (costos), F16 (UTM y `ad_spend`).

## Objetivo
Manejar la pauta de Mokub desde Faro, sin el Administrador de anuncios ni un MCP, usando la API de Marketing de Meta con el token de un usuario del sistema:
1. **Métricas automáticas**: el gasto, las impresiones, los clics y las conversaciones de cada campaña llegan solos a `ad_spend`, reemplazan la carga manual y alimentan el CPL de `meta_ads` (F13 y F14).
2. **Campañas desde Faro**: un formulario crea campaña, conjunto de anuncios, creativo y anuncio, **siempre en pausa**. Activar es un paso aparte, con candado.

## Alcance
- Adapter `src/integrations/meta-ads/` (`types.ts`, `real.ts`, `mock.ts`, `index.ts`) sobre la Graph API (`fetch`, sin SDK):
  - `getAccount()`;
  - `listCampaigns()`;
  - `getInsights({since, until})`, a nivel de campaña y por día;
  - `createPausedCampaign(spec)`;
  - `setCampaignStatus(id, "ACTIVE" | "PAUSED")`.
- Selección por `META_ADS_MODE`: `real` solo con `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` y `META_PAGE_ID`; si falta algo, `mock`.
- **Sincronización** `syncMetaAds(db, adapter, {days})`:
  - por defecto los últimos 7 días, porque Meta corrige cifras recientes;
  - hace upsert en `ad_spend` con `platform='meta'`, `campaign=<id de campaña de Meta>`, `source='meta_api'`, `currency`, `spend_local`, `conversations`, `campaign_name`, `usd` y `fx`;
  - después re-atribuye con `attributeAdSpend` (idempotente).
  - En modo mock **no escribe nada en la base de datos**: devuelve una vista previa marcada.
- **Conversión a USD:** `usd = spend_local / META_COP_PER_USD` si la cuenta es COP; si es USD, 1:1. Otras monedas → error claro. La tasa usada queda guardada en la fila.
- **Cron** `GET /api/cron/meta-ads-sync` (`CRON_SECRET`, diario 11:00 UTC = 6:00 Bogotá) y botón "Sincronizar ahora" (`POST /api/ads/meta/sync`, `requireAppAccess`).
- **Campañas:**
  - `POST /api/ads/meta/campaigns` (`requireAppAccess`) con destino `website`: objetivo `OUTCOME_TRAFFIC`, optimización `LINK_CLICKS`.
  - El enlace del anuncio solo puede ser https hacia un dominio permitido (`META_ADS_ALLOWED_DOMAINS`, por defecto `mokub.co,www.mokub.co` más el host de `NEXT_PUBLIC_APP_URL`). Se le agregan `utm_source=meta&utm_medium=paid_social&utm_campaign=<id de campaña>`, para que si apunta a `/d/icp/*` de Faro los leads se atribuyan solos (F16).
  - Segmentación: radio alrededor de Bogotá (25 km, configurable a nivel de país `CO`), edades 18–65 y ubicaciones automáticas.
  - Presupuesto diario en COP, con tope `ADS_MAX_DAILY_BUDGET_COP` (por defecto 50.000).
  - Creativo: texto principal, título, descripción, imagen por URL https (`link_data.picture`) y CTA (`LEARN_MORE`, `CONTACT_US`, `SIGN_UP` o `GET_QUOTE`).
- **Activar y pausar:** `POST /api/ads/meta/campaigns/[id]/status`.
  - Pausar siempre se puede.
  - Activar exige `ADS_SPEND_ENABLED=true`, escribir el nombre exacto de la campaña como confirmación y que el presupuesto diario esté dentro del tope.
  - Cada cambio queda en `api_calls`.
- **UI en `/app/settings/ads`**, nueva sección "Meta · API":
  - estado de la conexión (modo, cuenta, moneda, página, si el gasto está habilitado);
  - última sincronización y botón para sincronizar;
  - tabla de campañas con estado, gasto (COP y USD), impresiones, clics, CTR, conversaciones, y botones de pausar o activar;
  - formulario "Nueva campaña (en pausa)".
  - Lo existente de F16 no cambia.

## No-alcance (siguientes pasos)
- Anuncios que abren WhatsApp: requieren vincular el número a la página de Mokub; el número hoy está en otro portfolio.
- Píxel y conversiones en mokub.co.
- Subir imágenes o videos como archivo.
- Editar campañas existentes.
- Instagram como identidad.
- Formularios instantáneos de Meta.
- Métricas por anuncio o por conjunto de anuncios.

## Seguridad y guardrails
- El token nunca se muestra en logs, respuestas ni errores: se borra de cualquier URL o mensaje antes de guardarlo.
- La URL de destino solo acepta https y dominios permitidos.
- Los textos se validan con Zod (longitudes de Meta, sin caracteres de control).
- Todo lo que se crea queda `PAUSED`. Faro **no gasta dinero** sin `ADS_SPEND_ENABLED` más la confirmación. Esto respeta LOOP §6 y CLAUDE.md.
- Nada en mock se presenta como real: `ad_spend` solo recibe filas `meta_api` del modo real.

## Datos (migración 0008)
`ad_spend` agrega:
- `source text not null default 'manual'`;
- `currency text`;
- `spend_local double precision`;
- `fx double precision`;
- `conversations integer not null default 0`;
- `campaign_name text`.

Los estados de las campañas de Meta no se guardan: se leen en vivo.

## Variables nuevas
`META_ADS_MODE` (mock), `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_API_VERSION` (v23.0), `META_COP_PER_USD` (4000), `META_ADS_ALLOWED_DOMAINS`, `ADS_SPEND_ENABLED` (false), `ADS_MAX_DAILY_BUDGET_COP` (50000).

## Criterios de aceptación
1. Sin credenciales o con `META_ADS_MODE=mock`, el adapter es el mock, la sincronización no escribe filas y la UI dice "modo de prueba".
2. Con insights de 2 días (COP) se guardan 2 filas `meta_api` con `usd = COP / tasa`. Sincronizar dos veces no duplica (upsert) y el CPL de `meta_ads` refleja el gasto entre leads reales con ese `utm_campaign`.
3. `createPausedCampaign` envía `status=PAUSED` en campaña, conjunto y anuncio. El `link` lleva los UTM con el id de la campaña, y un dominio no permitido o una URL que no sea https se rechaza con 400.
4. Activar sin `ADS_SPEND_ENABLED`, sin la confirmación correcta o con un presupuesto mayor al tope da 409 o 400, y no se llama a Meta. Pausar funciona siempre.
5. Los endpoints sin la clave de la app dan 401, y el cron sin `CRON_SECRET` da 401.
6. Ningún error devuelto ni registrado contiene el token.
7. La moneda COP usa offset 1 en el presupuesto (`daily_budget` en pesos) y USD usa offset 100.
8. Capturas a 1440×900 y 390×844 sin scroll horizontal.

## Tests
- `tests/unit/meta-ads-adapter.test.ts`: real con fetch simulado, borrado del token, offsets, cuerpo de la creación.
- `tests/unit/meta-ads-sync.test.ts`: upsert, tasa de cambio, atribución, mock sin escritura.
- `tests/unit/meta-ads-endpoints.test.ts`: acceso, candado de activación, validación de destino y cron.
