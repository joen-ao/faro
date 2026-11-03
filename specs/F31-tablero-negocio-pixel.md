# F31 · Fin del demo, tablero de negocio rápido (Meta vs. Faro) y píxel de Meta

**Prioridad:** P0. **Contexto:** Faro dejó de ser un proyecto de hackathon y ahora opera la captación de Mokub. El modo demo solo mete ruido. El tablero tardaba o se caía porque recalculaba todo en cada visita (unos 64.000 leads). Además, Meta no sabía qué leads se volvían calificados.

## A · Quitar el demo
- **Código:** se quitan
  - el interruptor `?demo=1` del tablero y la sección DEMO;
  - la casilla "datos de prueba" y "Filas de prueba" en Pauta;
  - `/app/hunts/demo` y la búsqueda demo;
  - el outreach demo, `FARO_ALLOW_DEMO` y la siembra demo de `db:seed`;
  - `features/dashboard/demo-db.ts`, `features/metrics/demo.ts`, `features/hunts/demo.ts` y `features/outreach/demo.ts`;
  - el panel "Reto Dapta" (`challenge`), que era propio de la hackathon.
- **Lo que se queda:** las columnas `is_demo` e `is_mock` y sus filtros. Siguen protegiendo los totales de lo que generen los adapters en modo mock, aunque ya no se puedan crear datos demo.
- **Datos:** la migración `0013_purge_demo` borra las filas con `is_demo = true` de todas las tablas que la tienen (leads, companies, events, messages, qualifications, cost_entries, ad_spend y las de pauta F29). Lo que cuelga de esas filas se borra en cascada. Es irreversible y lo pidió el dueño.

## B · Tablero rápido: métricas precalculadas
- **Tabla `metrics_snapshots`** con las columnas `key`, `range_days`, `data` (jsonb), `computed_at` y `duration_ms`.
- **`getSnapshot(db, key, maxAgeMin, compute)`:**
  - si la copia tiene menos de 15 minutos, la página la lee en un instante;
  - si está vencida, muestra la última y la recalcula en segundo plano con `after()`, una sola a la vez gracias a un candado consultivo de Postgres (`pg_try_advisory_lock`);
  - si no existe ninguna, la calcula una vez, ahí mismo.
- **"Actualizar ahora"** (`POST /api/dashboard/refresh`) fuerza el recálculo y muestra "Actualizado hace X min".
- **Pauta y el copiloto** usan la misma copia para el CPL de `meta_ads` y no recalculan nada al abrirse.

## C · Tablero con buenas prácticas de analítica de negocio
Principios: una métrica norte; cada KPI con su definición, su período y la comparación con el período anterior; tamaños de muestra visibles y "pocos datos" cuando no alcanza; separar el resultado (calificados, CPQL) de la actividad (contactados, gasto); y que todo número se pueda rastrear hasta su recibo, como en F13.

1. **Encabezado:** el rango (7, 30 o 90 días, por defecto 30), "actualizado hace X min" y el botón para actualizar.
2. **KPIs** (tarjetas con delta frente al período anterior y mini-tendencia semanal):
   - **Leads calificados** (métrica norte)
   - **CPQL** (costo por lead calificado)
   - **CPL**
   - **Tasa de calificación** (con intervalo Wilson)
   - **Gasto total**
   - **Leads nuevos**
3. **Meta vs. Faro**, lado a lado. "Meta" son los leads `meta_ads`: pauta atribuida por UTM o `fbclid`. "Faro" son los de la prospección saliente: osm, rues, reps, google_places y website contactados. Para cada uno: gasto, leads, contactados o clics, respuestas, calificados, tasa de calificación (intervalo), CPL, CPQL y la mediana de horas hasta la primera respuesta. Debajo, un veredicto honesto: cuál rinde mejor por CPQL, con qué confianza, o "datos insuficientes".
4. **Tendencia semanal:** leads y calificados por semana (de lunes a domingo, en hora de Bogotá), una línea por grupo (Meta y Faro). Es una cohorte por la semana en que nació cada lead.
5. **Embudo por canal:** encontrados → del perfil → contactados → respondieron → calificados, con la tasa de cada paso.
6. **Detalle:** la matriz fuente × canal de F14, plegada, y el panel de cumplimiento.

## D · Píxel de Meta y API de Conversiones (en Faro)
- **En Meta, con Claude in Chrome:**
  - crear el conjunto de datos (píxel) "Mokub" en el portfolio mokub.co;
  - asignarlo a `faro-api` con control total;
  - guardar `META_PIXEL_ID` en `.env.local`; el dueño lo agrega en Vercel.
  - Las condiciones de Meta las acepta el dueño.
- **Navegador:** el código base del píxel carga en las páginas públicas de Faro (`/`, `/d/*`) solo si existe `META_PIXEL_ID`.
  - Envía `PageView`.
  - Envía `Lead` al enviar el formulario de diagnóstico, con el mismo `event_id` que el servidor.
- **Servidor (API de Conversiones, con el token de `faro-api`):**
  - `Lead` cuando nace un lead entrante por `/d/*` (`recordContact`);
  - el evento personalizado `QualifiedLead` cuando Dapta marca `calificado = true` (webhook F15);
  - correo y teléfono normalizados y con hash SHA-256;
  - `fbc` armado a partir de `fbclid`, más `client_ip_address` y `client_user_agent` cuando existan;
  - `event_id` para que Meta deduplique el evento del navegador y el del servidor;
  - `META_CAPI_TEST_CODE` opcional para el modo de prueba de Events Manager;
  - ningún dato se guarda ni se registra en claro.
- **Sin `META_PIXEL_ID`, no se envía nada.** Los fallos de la API se registran en `api_calls` y nunca rompen el flujo del lead.
- **Endpoint para mokub.co** (`POST /api/public/lead`, con CORS solo para `mokub.co` y `www.mokub.co`, honeypot y freno de intentos): recibe el formulario de mokub.co con sus UTM y `fbclid`, crea el lead en Faro (fuente `meta_ads` si viene de Meta, si no `website`) y dispara el `Lead` por la API de Conversiones. Conectar el formulario de mokub.co se hace en el repo `mokub-web-services` y es trabajo aparte.

## No-alcance
- Cambios en el repo de mokub.co.
- Optimizar campañas por conversion leads (requiere formularios instantáneos y 200 leads al mes).
- Banner de cookies; queda como deuda legal.

## Criterios de aceptación
1. No queda ninguna ruta ni interruptor demo, y después de la migración no hay filas `is_demo`.
2. El tablero lee la copia precalculada; con una copia existente, la página responde sin recalcular, y nunca corren dos recálculos a la vez.
3. Los KPIs muestran su delta frente al período anterior. Meta vs. Faro usa las mismas definiciones que F13 (CPL y CPQL reales, sin mock), con "pocos datos" por debajo de los mínimos del playbook.
4. Con `META_PIXEL_ID`, `/d/*` carga el píxel y envía `PageView`. Un envío del formulario manda `Lead` por navegador y por servidor con el mismo `event_id`. Una calificación de Dapta manda `QualifiedLead`. Sin la variable, nada carga ni se envía.
5. La API de Conversiones nunca envía correo ni teléfono en claro; el token y los datos personales nunca aparecen en los registros.
6. `/api/public/lead` rechaza otros orígenes, el honeypot y las ráfagas, y crea leads atribuidos.
