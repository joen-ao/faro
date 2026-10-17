# F06 — Enriquecimiento web (fetch directo + Apify)

## Objetivo
Dado el sitio web de una empresa, obtener **contactos genéricos** y **señales** para el scoring (F08), respetando SPEC §8 (robots.txt, solo genéricos, sin nombres de personas) y registrando costo (SPEC §7, scraping).

## Alcance
- `src/integrations/website-fetch/`: `fetchSite(url)` descarga la home y como máximo 2 páginas de contacto (`/contacto`, `/contact`, enlaces con "contacto/contact"), mismo dominio. Reglas: robots.txt propio (grupos `Faro` y `*`, Allow/Disallow con `*` y `$`, gana la regla más larga, caché por dominio; robots 4xx = permitido, 5xx/error = no se rastrea), UA `Faro-30XHackathon/0.1 (+<NEXT_PUBLIC_APP_URL>)`, timeout 8 s, máx. 1 MB, solo http/https, SSRF (`src/lib/ssrf.ts`: IPs privadas, localhost, metadata, DNS y cada redirect, `redirect: manual`, máx. 3), solo GET (nunca envía formularios), intervalo mínimo por dominio. Mock marcado `isMock`.
- Extracción (`extract.ts`): correos (mailto + texto + `[at]`/`(arroba)`), solo `isGenericEmail`; teléfonos E.164 (`tel:` y texto, CO/US); formulario de contacto (`<form>` con campo email y mensaje/textarea → `web_form` con URL de evidencia); `wa.me`/`api.whatsapp.com` (dato, no se envía nada); señales (agenda online, sitio sin formulario de citas, redes presentes, año de copyright); `websiteText` ≤ 8 KB sin scripts/estilos ni bloques de equipo/doctores.
- `src/integrations/apify/`: adapter REST (`run-sync-get-dataset-items`) del actor `APIFY_CONTACT_ACTOR_ID`; real solo con `APIFY_TOKEN` + modo real; mock `isMock`. Bloquea cualquier URL de `google.*/maps`. Costo = `usageTotalUsd` de la corrida, prorrateado por empresa con `prorateSharedCost` (categoría `scraping`). Mismo filtro de genéricos.
- `enrichCompany(db, companyId)`: guarda `company_source` `website` (raw: websiteText, señales, páginas; licencia "Sitio web público de la empresa"), `contact_points` sin duplicar (`is_generic`), `api_calls`. `POST /api/leads/[id]/enrich` con `requireAppAccess`.

## No-alcance
Redes sociales, Google Maps, JS rendering, envío, UI.

## Criterios verificables
1. Disallow de robots respetado (no se pide la página). 2. `camila.perez@`, `drgomez@` descartados; `info@`, `citas@` conservados. 3. Formulario detectado. 4. SSRF: `127.0.0.1`, `169.254.169.254`, redirect a IP privada bloqueados. 5. Tamaño máx. y timeout. 6. Apify rechaza Google Maps; prorrateo exacto. 7. Cobertura ≥ 70 % en ambas carpetas; `npm run check` verde sin red.

## Verificación en vivo
(se completa tras la prueba)
