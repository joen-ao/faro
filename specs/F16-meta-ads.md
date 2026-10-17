# F16 — Meta Ads: UTMs, página genérica del ICP, carga de gasto y atribución

## Objetivo
Medir `meta_ads` como un canal más (SPEC §9.4): enlace UTM listo para pegar en el anuncio, atribución de todo tráfico Meta a `meta_ads`, y carga manual/CSV del gasto que se prorratea (F13) solo entre leads reales. Sin cuenta de Meta: no se crean campañas ni se llama a ninguna API.

## Alcance
- `src/features/ads`: `buildAdLink(icpSlug, campaignId?)`, `parseSpendCsv`, `saveAdSpend` (upsert + `attributeAdSpend`), `listAdSpend`.
- API (todas con `requireAppAccess`): `POST /api/ads/spend`, `POST /api/ads/spend/csv` (≤ 1 MB), `GET /api/ads/spend`.
- Página `/app/settings/ads`: enlace UTM copiable, CPL actual de `meta_ads` (real), formulario manual, carga CSV con errores por fila, listado, casilla "datos de prueba" apagada por defecto.
- Atribución: `utm_source=meta` o `fbclid` en la query ⇒ `utm_source=meta` normalizado en `events.utm`; leads de `/d/icp/*` nacen `meta_ads` y su canal de contacto es `dapta_widget` (eventos `form_submit`/widget, F13).

## No-alcance
API de Meta, creación de campañas, guardar `fbclid` crudo, tablero (F14).

## Interfaces
- `buildAdLink`: `${NEXT_PUBLIC_APP_URL}/d/icp/<slug>?utm_source=meta&utm_medium=paid_social&utm_campaign=<id>`; slug debe existir en `ICP_PAGES`; id `[A-Za-z0-9_.-]{1,80}`, por defecto `META_ADS_CAMPAIGN_ID` (si falta: error claro).
- CSV: cabecera `platform,campaign,date,usd,impressions,clicks` (`platform` opcional ⇒ `meta`). Fila validada con Zod; fecha ISO real; `usd` ≥ 0; texto que empiece por `= + - @` o control ⇒ fila rechazada (inyección de fórmulas). Máx. 1 MB y 5.000 filas. Las filas válidas se guardan; las inválidas se devuelven `{line, error}`.
- Upsert por `(platform, campaign, date)`; luego `attributeAdSpend` por cada campaña (idempotente).

## Criterios de aceptación
1. El enlace generado pasa por `parseTracking` y conserva utm_source/medium/campaign.
2. `fbclid` sin `utm_source` ⇒ `utm_source=meta`; un lead `/d/icp` con ese tráfico queda `meta_ads` / `dapta_widget`.
3. Gasto real de 30 USD con 3 leads reales + 1 demo ⇒ 10 USD por lead real, nada al demo; el CPL de `meta_ads` en `getChannelMetrics.real` lo refleja; `is_demo` nunca entra en `real`.
4. CSV con filas mixtas guarda las válidas y reporta las inválidas; `=HYPERLINK(...)` rechazado; > 1 MB ⇒ 413.
5. Sin `APP_ACCESS_KEY` en producción ⇒ 401 en API y página.
6. Capturas 1440×900 y 390×844, sin scroll horizontal.

## Tests
`tests/unit/ads-*.test.ts` (link, CSV, atribución, gasto→CPL, endpoints) y `tests/e2e/ads.spec.ts` (render + captura).
