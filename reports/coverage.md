# Prueba de cobertura de fuentes (F02)

Generado: 17 de octubre de 2026 a las 3:42:54 a. m. (America/Bogota). Datos reales consultados en vivo; nada inventado. Una fuente que falló figura como FALLÓ.

## Resumen

| ICP | Fuente | Empresas | Web | Teléfono | Correo | Persona jurídica | Latencia |
|---|---|---:|---|---|---|---|---:|
| Clínicas odontológicas · Bogotá | OpenStreetMap (Overpass) | 436 | 0.7% (3/436) | 3.4% (15/436) | 0.5% (2/436) | N/D (por verificar) | 37.4 s (caché) |
| Clínicas odontológicas · Bogotá | RUES (datos.gov.co) | 1.445 | N/D (no expuesto) | N/D (no expuesto) | N/D (no expuesto) | 36.1% (1445/4005) | 86.6 s |
| Clínicas odontológicas · Bogotá | REPS (datos.gov.co) | 241 | N/D (no expuesto) | 98.8% (238/241) | 100% (241/241) | 94.1% (241/256) | 2.5 s (caché) |
| Restaurantes · Bogotá | OpenStreetMap (Overpass) | 4.634 | 3.2% (146/4634) | 4.7% (217/4634) | 0.5% (24/4634) | N/D (por verificar) | 38.2 s (caché) |
| Restaurantes · Bogotá | RUES (datos.gov.co) | 7.359 | N/D (no expuesto) | N/D (no expuesto) | N/D (no expuesto) | 26.1% (7359/28187) | 30.0 s |
| Restaurantes · Miami | OpenStreetMap (Overpass) | 704 | 47.7% (336/704) | 45.9% (323/704) | 4.3% (30/704) | N/D (por verificar) | 33.7 s (caché) |

\* Conteo parcial: la consulta devolvió el máximo permitido o es una muestra.

### Contactables: verificados vs por verificar

| ICP | (a) Contactables verificados como persona jurídica | (b) Contactables totales por verificar |
|---|---|---:|
| Clínicas odontológicas · Bogotá | **70** (69 REPS + 1 OSM∩registro) | 72 |
| Restaurantes · Bogotá | **12** (0 REPS + 12 OSM∩registro) | 147 |
| Restaurantes · Miami | N/D (sin registro jurídico gratuito) | 336 |

## Detalle por ICP

### Clínicas odontológicas · Bogotá

- **OpenStreetMap (Overpass)**: 436 empresas.
  - Área: bbox Bogotá 4.45,-74.25,4.84,-73.99 (incluye parte de Soacha/Chía). Servidor: overpass-api.de.
  - Con nombre: 408 de 436; con web o correo genérico: 3.
  - Persona jurídica: no se puede saber desde OSM (por verificar contra RUES/REPS).
- **RUES (datos.gov.co)**: 1.445 empresas (porcentajes sobre 1.417 analizadas).
  - No expone: web, phone, email.
  - CIIU 8622, cámara BOGOTA, matrícula ACTIVA. El dataset no tiene municipio: la cámara de comercio es la aproximación geográfica.
  - Persona jurídica: 1.445 de 4.005 matrículas activas (el resto son personas naturales, excluidas).
  - Posible persona natural / por verificar: 28 razones sociales de E.U. con apariencia de nombre propio (1.9% de la muestra); quedan fuera de solapamiento y de contactables. El % jurídico las incluye.
  - Solo sirve para validar persona jurídica/NIT y para dedupe: no trae teléfono, correo ni web.
- **REPS (datos.gov.co)**: 241 empresas.
  - No expone: web.
  - Sedes de IPS con NIT en Bogotá cuyo nombre contiene: ODONT, DENTAL, DENTIST, ORTODON, ENDODON, PERIODON, SONRIS, SMILE. 150 NIT distintos, 220 nombres de sede distintos.
  - Persona jurídica: 241 de 256 prestadores con ese nombre (el resto son profesionales independientes/personas naturales, excluidos).
  - Correos de REPS con apariencia genérica (info@, contacto@, citas@…): 70 de 241; los demás parecen personales y no se cuentan como contactables.
- **Solapamiento OSM ↔ RUES** (nombre normalizado, aproximado): 30 coincidencias; 7.4% de OSM (408) y 1.8% de RUES (1417).
- **Solapamiento OSM ↔ REPS** (nombre normalizado, aproximado): 18 coincidencias; 4.4% de OSM (408) y 11.6% de REPS (241).

### Restaurantes · Bogotá

- **OpenStreetMap (Overpass)**: 4.634 empresas.
  - Área: bbox Bogotá 4.45,-74.25,4.84,-73.99 (incluye parte de Soacha/Chía). Servidor: overpass-api.de.
  - Con nombre: 4325 de 4634; con web o correo genérico: 147.
  - Persona jurídica: no se puede saber desde OSM (por verificar contra RUES/REPS).
- **RUES (datos.gov.co)**: 7.359 empresas (porcentajes sobre 7.305 analizadas).
  - No expone: web, phone, email.
  - CIIU 5611, cámara BOGOTA, matrícula ACTIVA. El dataset no tiene municipio: la cámara de comercio es la aproximación geográfica.
  - Persona jurídica: 7.359 de 28.187 matrículas activas (el resto son personas naturales, excluidas).
  - Posible persona natural / por verificar: 54 razones sociales de E.U. con apariencia de nombre propio (0.7% de la muestra); quedan fuera de solapamiento y de contactables. El % jurídico las incluye.
  - Solo sirve para validar persona jurídica/NIT y para dedupe: no trae teléfono, correo ni web.
- **Solapamiento OSM ↔ RUES** (nombre normalizado, aproximado): 130 coincidencias; 3% de OSM (4323) y 1.1% de RUES (7305).

### Restaurantes · Miami

- **OpenStreetMap (Overpass)**: 704 empresas.
  - Área: bbox Miami 25.70,-80.32,25.86,-80.12 (Miami, Miami Beach, Coral Gables y alrededores). Servidor: overpass-api.de.
  - Con nombre: 691 de 704; con web o correo genérico: 336.
  - Persona jurídica: no se puede saber desde OSM (por verificar contra RUES/REPS).
  - RUES y REPS solo cubren Colombia: no aplican a Miami.

## Recomendación de ICP principal

**Recomendación (ICP principal, envíos reales): Clínicas odontológicas · Bogotá.**

| ICP | (a) Contactables verificados como persona jurídica | (b) Contactables totales por verificar |
|---|---|---:|
| Clínicas odontológicas · Bogotá | **70** (69 REPS + 1 OSM∩registro) | 72 |
| Restaurantes · Bogotá | **12** (0 REPS + 12 OSM∩registro) | 147 |
| Restaurantes · Miami | N/D (sin registro jurídico gratuito) | 336 |

Criterio: los envíos reales exigen persona jurídica verificable (SPEC §8), así que se decide por (a). "Clínicas odontológicas · Bogotá" tiene 70 contactables verificados frente a 12 de "Restaurantes · Bogotá"; 69 vienen de correos genéricos de REPS y 1 de empresas OSM con web o correo que además aparecen por nombre en RUES/REPS.

(b) es el potencial tras enriquecimiento: "Restaurantes · Miami" llega a 336, pero sin verificar persona jurídica (Miami solo aplica a búsqueda/demo, solo correo). Google Places (F05) y el enriquecimiento web (F06) deberían acercar (b) a (a).

OJO: en OSM solo 0.7% de "Clínicas odontológicas · Bogotá" trae web o correo genérico; el filtro "con sitio web" dependerá de F05/F06.

Caveats: solapamiento por nombre exacto normalizado (subestima el cruce real de F07); correos genéricos por heurística (F09 la endurece); razones sociales de E.U. con apariencia de nombre propio se descartan como posible persona natural.

## Metodología y límites

- OSM vía Overpass: `node` + `way` con `out center tags`, bbox fijo por ciudad; dental = `amenity=dentist` ∪ `healthcare=dentist`; restaurantes = `amenity=restaurant`. Web/teléfono/correo salen de `website|contact:website|url`, `phone|contact:phone|contact:mobile`, `email|contact:email`.
- RUES (`c82u-588k`): CIIU principal 8622 (odontología) / 5611 (restaurantes), `camara_comercio=BOGOTA` (el dataset no tiene municipio), `estado_matricula=ACTIVA`, excluye `PERSONA NATURAL`. El dataset no incluye teléfono, correo, web ni dirección: sirve para validar persona jurídica y NIT, no para contactar.
- REPS (`c36g-9fc2`): sedes en Bogotá de IPS con NIT (excluye `Profesional Independiente`); dental se detecta por palabras en el nombre (odont, dental, sonris, smile…), por lo que puede omitir IPS con otro nombre y trae algunos falsos positivos.
- Solapamiento: coincidencia exacta del nombre normalizado (sin tildes, sufijos S.A.S./LTDA/IPS y palabras genéricas); subestima el cruce real que hará F07.
- Fuera del alcance de este reporte: Google Places (F05) y enriquecimiento web (F06), que subirán los % de web/correo.

## Atribuciones

- Datos de mapa: © OpenStreetMap contributors, licencia ODbL 1.0 (https://www.openstreetmap.org/copyright).
- Datos de Colombia: Datos Abiertos Colombia (datos.gov.co), Cámaras de Comercio (RUES) y Ministerio de Salud (REPS), licencia CC BY-SA 4.0.
- Cliente: User-Agent `Faro-30XHackathon/0.1`, ≤1 consulta cada 2 s a Overpass, caché en disco.
