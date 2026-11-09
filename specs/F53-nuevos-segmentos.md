# F53 — Nuevos segmentos con oferta

## Por qué
Medición del 2026-11-07 sobre los 4.885 leads `fit`:
- Solo 237 son personas jurídicas con correo genérico.
- De esos, el correo en frío deja 24 elegibles.
- Una parte grande se cae por `sector_sin_oferta`: F48 solo definió salud y contabilidad.

Leads `fit` por sector de la búsqueda:

| Sector | Leads `fit` | Segmento hoy |
|---|---|---|
| Consultorios y prestadores de salud | 2.400 | salud |
| Clínicas odontológicas | 1.141 | salud |
| Empresas medianas y grandes con supply chain y field service | 612 | ninguno |
| Estudios de diseño interior | 216 | ninguno |
| Colegios de estrato 3 | 178 | ninguno |
| Clínicas dermatológicas y spas | 88 | salud |
| Manufactura | 78 | ninguno |
| Contabilidad | 56 | contabilidad |

## Qué cambia (`features/offer/fit.ts`)
Se agregan tres segmentos. Cada uno define:
- **servicios:** qué ofrecemos, en orden de preferencia (ids de "Tu oferta");
- **dolor:** en las palabras del sector, para la frase de consecuencia;
- **hallazgos:** cuáles pueden abrir el correo.

1. **operaciones**
   - Sectores: supply chain, field service, manufactura, logística, industria.
   - Servicios: flujo-automatizacion, mapa-automatizacion, software-crm, agentes-ia.
   - Dolor: "horas del equipo pasando datos a mano entre sistemas, cotizaciones que tardan días y clientes que esperan respuesta".
   - Hallazgos: whatsapp, form, freshness. Un botón de agendar citas no aplica a una planta.
2. **diseno**
   - Sectores: diseño interior, interiorismo, arquitectura, remodelación.
   - Servicios: landing-agente, landing-webs, agentes-ia.
   - Dolor: "clientes que piden cotización por Instagram o WhatsApp y se enfrían si nadie les responde rápido".
   - Hallazgos: whatsapp, form, freshness, no-website.
3. **educacion**
   - Sectores: colegios, instituciones educativas, jardines.
   - Servicios: agentes-ia, rag.
   - Dolor: "padres que preguntan lo mismo (matrículas, costos, horarios) por teléfono y WhatsApp, y una secretaría que colapsa en temporada de matrículas".
   - Hallazgos: whatsapp, form, freshness.

Además:
- Salud y contabilidad mantienen todos sus hallazgos. Un hallazgo que no aplica al segmento no abre el correo y el lead pasa al siguiente hallazgo que sí aplique.
- Los datos con fuente de salud (Zocdoc, Surescripts) siguen solo para salud. Los demás segmentos usan HBR o Google.
- La página /d ya usa vocabulario de "clientes" fuera de salud (`isHealthSector`). No cambia.
- `enrich:places` ya busca en Places a los candidatos de cualquier segmento con oferta, así que los nuevos entran solos.
- Los demás sectores pequeños (bioimpresión, petshops, restaurantes, abogados) siguen sin segmento.

## Criterios verificables
1. "Empresas medianas y grandes con procesos de supply chain y field service…" y "Manufactura" dan el segmento operaciones.
2. "Estudios de diseño interior" da diseno, y "Colegios (instituciones educativas) de estrato 3" da educacion.
3. "Clínicas dermatológicas y spas" y "Psiquiatría… (salud mental con IA)" siguen en salud. "Empresas medianas" no cae en salud.
4. En operaciones, un lead cuyo único hallazgo es `booking` da `sin_hallazgo`.
5. Se mide de nuevo cuántos elegibles quedan y se generan correos de muestra de cada segmento nuevo, sin enviar.
6. `npm run check` queda en verde.
