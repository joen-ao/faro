# F12 — Página de diagnóstico `/d/[slug]`

## Objetivo
Página pública, ligera y móvil primero a la que llega una empresa desde el correo (`/d/[slug]?c=<canal>&s=<fuente>`): 3 hallazgos públicos con fuente, widget de Dapta, formulario de contacto de empresa, identificación del remitente, aviso de privacidad (Ley 1581), baja de un clic y atribución. SPEC §9.2–9.4, §10 vista 6.

## Alcance
- `src/features/diagnostic/`: `params.ts` (Zod de `c`, `s`, `utm_*`), `findings.ts` (`buildFindings`: máx. 3, cada uno con fuente y URL http/https), `contact.ts` (Zod del formulario + honeypot), `data.ts` (consultas, registro de eventos, seed demo opcional).
- `/d/[slug]` (server component, `force-dynamic`, `noindex`), `/d/icp/[icpSlug]` (variante genérica para pauta, `utm_source=meta`; config en `src/config/icp-pages.ts`), 404 propio.
- `POST /api/events` (registro sin bloquear el render, `widget_open`) y `POST /api/contact` (`form_submit`).
- Widget: `DAPTA_WIDGET_SNIPPET` solo desde env, dentro de un `iframe sandbox` sin `allow-same-origin`; si falta, placeholder honesto + formulario.
- Seed: lead `demo-clinica` (is_demo) con fuentes mock; se carga con `db:seed` y con `FARO_SEED_DEMO=1` (e2e).

## No-alcance
Webhook de Dapta (F13/F15), envío de correos (F10), i18n en/es completo.

## Criterios de aceptación
1. Slug inexistente → 404 diseñado; lead demo muestra marca "Ejemplo".
2. Nunca más de 3 hallazgos, todos con fuente enlazada; textos escapados, sin `dangerouslySetInnerHTML`.
3. Abrir `/d/demo-clinica?c=email&s=osm` registra `widget_open` con canal, fuente y utm validados; formulario registra `form_submit`; honeypot lleno no guarda nada.
4. Botón de baja lleva a `/baja/[token]`.
5. `npm run check` y `npm run e2e:smoke` verdes; capturas 1440 y 390 en `artifacts/screens/F12-diagnostico-*.png`.
