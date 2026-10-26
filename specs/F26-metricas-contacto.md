# F26 · Métricas de contacto: contactados, aperturas, respuestas

**Prioridad:** P1.

## Objetivo
Ver en el tablero cómo va la prospección: a cuántos clientes escribimos, por qué canal, cuántos abrieron su diagnóstico, cuántos respondieron, se dieron de baja o quedaron calificados, y la evolución diaria.

## Datos (`src/features/metrics/outreach.ts` · `getOutreachMetrics(db, {days})`)
Solo datos reales (sin demo ni mock). Por canal (`email`, `whatsapp`, `manual`) y total:
- **Contactados**: empresas distintas con mensaje `sent`/`delivered` (manual = registrado a mano).
- **Simulados**, **Fallidos**, **En cola**.
- **Abrieron**: empresas contactadas con `click` page_view / `widget_open` en su diagnóstico.
- **Respondieron**: evento `reply` (correo, WhatsApp o Dapta) o lead `responded`.
- **Bajas**: evento `opt_out`. **Calificados**: lead `qualified`.
- Tasas: apertura y respuesta sobre contactados.
- Serie diaria (últimos 14 días): enviados, aperturas, respuestas por día (hora Bogotá).
- Últimas 10 respuestas (empresa, canal y fecha; el texto no se guarda, SPEC §8).
- Cupo de hoy del cron (enviados hoy / `emailsPerDay`) y de WhatsApp.

## Vista
Sección "Contacto" en `/app/dashboard`: tarjetas KPI, tabla por canal, barras diarias en CSS y lista de respuestas recientes. `GET /api/metrics/outreach` (clave del equipo) devuelve el mismo JSON.

## Criterios de aceptación
1. Cuenta empresas, no mensajes (dos mensajes a la misma empresa = 1 contactado).
2. Demo/mock nunca suman.
3. Las tasas muestran "—" con 0 contactados.
4. Serie de 14 días completa (días sin datos = 0).
