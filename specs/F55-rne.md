# F55 · Registro de Números Excluidos (RNE, Ley 2300) antes de escribir a personas naturales

**Prioridad:** P0 (cumplimiento).

## Por qué
La Ley 2300 de 2023 extiende a los mensajes comerciales por SMS, aplicaciones (WhatsApp), correo y llamadas la obligación de respetar el RNE de la CRC. Según el Concepto CRC 506667 de 2025, cualquier productor o proveedor debe consultarlo antes de contactar. El RNE se actualiza a diario a las 2:00 a. m. y no se puede descargar completo. Se consulta 1 a 1, por consulta masiva (CSV de hasta 10.000 datos y 3 MB) o por API (token de 6 meses), con la empresa registrada en tramitescrcom.gov.co.

## Reglas
- Persona natural (independiente): **cada correo o celular necesita una consulta del RNE de los últimos 30 días**.
  - Si el dato está inscrito → `rne_excluded`: nunca se le escribe, ni a mano.
  - Sin consulta reciente → `rne_pending`: bloqueado, también para el contacto manual.
- Celular personal (no genérico) de una empresa por WhatsApp: la misma regla.
- Buzones genéricos de empresas (`info@`, `contacto@`): sin cambios.
- Envío diario: después de las empresas, incluye independientes con correo libre en el RNE (correo general de servicios).

## Datos
Tabla `rne_checks`, con un registro por valor: `kind` (email o phone), `value` (correo en minúsculas o teléfono E.164), `excluded`, `channels`, `source` (csv, api o manual) y `checked_at`.

## Flujo (consulta masiva)
1. Configuración → Envío → "Descargar datos por consultar" (`GET /api/rne/pending?format=csv`). Una columna `dato`; los teléfonos van sin `+57`.
2. Se sube el archivo en la CRC: RNE Ley 2300 → Consulta masiva.
3. Se sube el resultado en Faro (`POST /api/rne/import`). El lector es tolerante con el separador y las columnas por canal (SI/NO). Si no reconoce la columna de exclusión, no guarda nada y muestra las columnas leídas para adaptarlo.

## Pendiente
Integrar la API (Web Service) de la CRC cuando el registro de la empresa esté aprobado y tengamos el manual técnico; la URL del manual citada en el concepto da 404.
