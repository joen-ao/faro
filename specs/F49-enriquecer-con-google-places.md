# F49 — Completar leads existentes con Google Places

## Por qué
F48 solo escribe en frío cuando hay un hallazgo real. Hoy casi ningún lead de salud/contabilidad lo tiene:
muchos no tienen web registrada (y "no tiene web" sin revisar Google Maps no es un hecho) y otros tienen web
sin revisar. Medición 2026-11-06: ~134 leads de los sectores con oferta, persona jurídica y correo genérico;
71 con web revisada; 0 con ficha de Google Maps.

## Qué hace
Un script `npm run enrich:places -- [--limit N] [--dry] [--real]` que, para cada empresa candidata
(lead `fit`, no demo, persona jurídica, correo genérico, sector con oferta en `features/offer/fit`, sin búsqueda
previa en Places):

1. Busca en Places API (New) Text Search `"<nombre> <ciudad>"` (1 llamada, `pageSize` 5, sin paginar).
2. Empareja con la empresa solo si el nombre del lugar contiene la palabra más distintiva del nombre registrado
   (`nameTokens` de `enrichment/discover`) y, si la empresa tiene ciudad, la dirección la menciona. Lugares
   cerrados se ignoran.
3. Guarda un `company_source` `google_places`:
   - con coincidencia: `externalId=places:<id>`, `raw={place_id, types, website, matched_name}`;
   - sin coincidencia: `externalId=places-miss:<companyId>`, `raw={matched:false, query}` (para no repetir la búsqueda).
4. Si la empresa no tenía web y el lugar trae una web propia (no redes ni directorios), la guarda en `companies.website`.
5. Si la empresa tiene web y no está revisada, la revisa con `enrichCompany` (fetch directo, sin Apify).

## Reglas que cambian
- `outreachEligibility`: el hallazgo "no tiene web" solo vale con una fuente `google_places` **que tenga `place_id`**
  (lugar emparejado) y sin web. Una búsqueda sin coincidencia no prueba nada.
- Prefiltro SQL de `dailyCandidates`: igual, exige `raw ? 'place_id'`.
- Fondos de empleados, cooperativas, sindicatos y asociaciones no compran para pacientes/clientes: motivo
  `tipo_no_objetivo`, ni se buscan ni reciben correo.
- Ciudades del registro se normalizan para emparejar ("Medellin Para Antioquia" → "medellin", "Bogota, D.C" → "bogota").
- Los lugares de Places nunca crean leads nuevos aquí; solo completan empresas existentes.

## Costo
Cada búsqueda pide `websiteUri`, que cae en el SKU Text Search Enterprise (lista ~35 USD/1.000; los primeros
1.000 al mes son gratis). ~134 empresas ≈ 134 llamadas, dentro del tier gratuito. Se registra con
`recordPlacesCost` (usd 0, valor de lista) y una fila `api_calls` por llamada. `--limit` por defecto 50.

## Términos de Google
Solo se guarda lo necesario (place_id, tipos, web). Nombre/dirección/teléfono del lugar no se copian a la empresa.

## Criterios verificables
1. Empareja "CLINICA ODONTOLOGICA SONRISA SAS" (Bogotá) con "Clínica Sonrisa" en Bogotá; no con "Sonrisas Medellín".
2. Sin coincidencia guarda `places-miss` y la empresa no pasa a "no tiene web".
3. Lugar emparejado sin web → elegible con hallazgo `no-website`.
4. Lugar emparejado con web propia → `companies.website` se llena y la web se revisa; con Instagram no se llena.
5. Una empresa ya buscada no se vuelve a buscar.
6. `--dry` no escribe ni llama a la API real.
7. `npm run check` verde sin red ni llave.
