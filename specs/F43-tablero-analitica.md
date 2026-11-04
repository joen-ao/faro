# F43 · Tablero con filtros globales y lectura de negocio

**Prioridad:** P0. **Contexto:** Faro ya envía 80 correos al día y el dueño necesita saber qué funciona: qué segmento responde, cuánto cuesta una reunión, qué cambió ayer. Revisión del tablero actual (`/app/dashboard`) contra buenas prácticas de business analytics.

## Diagnóstico
| Práctica | Hoy | Problema |
|---|---|---|
| Un filtro global que manda en toda la página | Solo 7/30/90 días, y solo en la parte de arriba | "Contacto" ignora el período: muestra totales históricos y siempre los últimos 14 días. No hay "Hoy", "Ayer" ni fechas a elección |
| Cortes por dimensión | No hay | No se puede ver solo correo, solo empresas o independientes, ni una búsqueda. No se sabe qué segmento responde mejor |
| Métricas de resultado primero, sin métricas de vanidad | La cabecera muestra "Leads nuevos 62.500" y "CPL $0.000" | Son registros públicos importados, no leads: inflan y esconden lo que importa. Faltan las **reuniones agendadas** (F37), que son el resultado de Mokub |
| Embudo de un mismo grupo, con conversión y caída por paso | El embudo de prospección empieza en "Encontrados 62.500" y termina en Calificados; la entrega y la apertura viven en otra tarjeta | No se ve el camino real de un correo: enviado → entregado → abrió la propuesta → respondió → reunión |
| Tendencia con granularidad acorde al período | Solo semanal en la parte de negocio y 14 días fijos en Contacto | Con "Hoy" o "7 días" una tendencia semanal no dice nada |
| Comparación contra el período anterior | Solo en la parte de arriba | Contacto no compara |
| Salud operativa aparte de los resultados | Cumplimiento al final, entregas y rebotes mezclados con resultados | Todo junto en una sola tarjeta larga |

## Lo que se construye
1. **Barra de filtros fija arriba**, guardada en la URL, que aplica a toda la página:
   - **Período:** Hoy · Ayer · 7 días · 30 días · 90 días · Personalizado (desde–hasta), en días de Bogotá. Siempre se compara con el período anterior de igual largo.
   - **Canal:** Todos · Correo · WhatsApp · Meta (pauta).
   - **Segmento:** Todos · Empresas · Independientes.
   - **Búsqueda:** todas o una.
   
   Los filtros activos se leen en una línea ("Correo · Empresas · 7 días, comparado con los 7 anteriores") y hay un botón para limpiarlos.
2. **Resultados** (cuatro cifras con su cambio y una mini tendencia):
   - Reuniones agendadas;
   - Leads calificados (la métrica norte);
   - Costo por reunión;
   - Costo por lead calificado (CPQL).
   
   Un número con pocos datos se marca así, como hoy.
3. **Embudo de prospección** del grupo contactado en el período: Contactados → Entregados → Abrieron la propuesta → Respondieron → Reunión → Calificados.
   - Cada paso muestra la cantidad, la conversión desde el paso anterior y la caída.
   - Debajo va el costo por contactado y por respuesta.
   - Meta entra como un grupo que llega solo (empieza en "Respondieron").
4. **Tendencia:** por día hasta 31 días y por semana desde ahí. Muestra enviados, abrieron la propuesta, respondieron y reuniones.
5. **Desglose** (tabla ordenable con pestañas: Segmento, Fuente, Búsqueda y Ciudad). Columnas: contactados, entrega %, apertura %, respuesta %, reuniones, calificados y costo. Las filas con menos de 20 contactados se marcan "pocos datos". Es lo que dice qué segmento escalar.
6. **Meta vs. Faro:** se mantiene con el veredicto. Se oculta si el filtro de canal deja uno solo.
7. **Salud del envío:**
   - hoy x/80 correos y x/50 WhatsApp;
   - tasa de entrega, rebotes, quejas y bajas;
   - el aviso de correos sin confirmación de entrega;
   - los cuatro indicadores de cumplimiento, que hoy están en un panel aparte.
8. **Detalle con recibos (F13/F14):** plegado, igual que hoy.
9. Salen de la cabecera "Leads nuevos" y "CPL" de registros importados. "Gasto total" pasa a Salud/Costos con su desglose por categoría (IA, envío, datos, pauta).

## Datos
- **Prospección** (embudo, tendencia, desglose y salud): se calcula en vivo con los filtros. Lee mensajes, eventos, calificaciones y costos solo de los leads contactados, que son cientos o miles y no los 62.000 registros. Una lectura por tabla y en secuencia, por el pooler de Supabase.
- **Meta vs. Faro:**
  - con los períodos de siempre (7/30/90) se sigue leyendo de la copia guardada (F31);
  - con Hoy, Ayer o fechas personalizadas se calcula en vivo; para eso `computeBusinessMetrics` acepta `from/to`.
- **Reuniones:** el evento `meeting_booked` (F37).
- **Segmento:** `companies.is_legal_entity`.
- **Fuente:** `leads.primary_source`.
- **Búsqueda:** `leads.hunt_id`.
- **Ciudad:** `companies.city`, normalizada (sin tildes y en minúscula), mostrando el nombre más común.
- Todo con las reglas de F13: sin demo, sin mock y sin mensajes simulados.

## No-alcance
- Desglose por servicio ofrecido: el mensaje no guarda qué servicio se ofreció; queda para otro cambio.
- Exportar a CSV.
- Alertas.

## Criterios de aceptación
1. Con "Hoy" + "Correo" + "Empresas", todas las secciones muestran solo correos de hoy a empresas, y la URL se puede compartir con esos filtros.
2. El embudo cuadra: cada paso es menor o igual al anterior y Contactados coincide con el número de empresas de la tabla de desglose.
3. La cabecera ya no muestra "Leads nuevos 62.500" ni "CPL $0.000"; muestra reuniones, calificados, costo por reunión y CPQL.
4. La tendencia es diaria con 7 o 30 días y semanal con 90.
5. En 390 px no hay scroll horizontal (la tabla de desglose se desplaza dentro de su caja) y los filtros caben.
