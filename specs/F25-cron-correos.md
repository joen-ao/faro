# F25 · Cron diario: 30 correos HTML con mejoras y servicios

**Prioridad:** P1.

## Objetivo
Cada día hábil Faro envía solo hasta 30 correos (configurable) a los leads del perfil con correo genérico de empresa, empezando por los de mayor puntaje. Cada correo es HTML premium y muestra al cliente **lo que encontramos** (mejoras concretas de su diagnóstico), **cómo le ayudamos** (servicios de la oferta que encajan con cada mejora), la oferta de entrada y el enlace a su diagnóstico.

## Programación
- `vercel.json` → `crons: [{ path: "/api/cron/daily-outreach", schedule: "0 14 * * 1-6" }]` (9:00 Bogotá, L–S; domingo nunca).
- La ruta exige `Authorization: Bearer $CRON_SECRET` (Vercel lo envía); sin secreto configurado → 401 en producción.
- `maxDuration = 300`; genera mensajes con concurrencia 4.

## Configuración (`app_settings.daily_outreach`)
`{ enabled: false, emailsPerDay: 30, huntIds: null | string[] }`, editable en `/app/settings/envio` (interruptor, cantidad 1–100, búsquedas incluidas, "Ejecutar ahora", resumen de la última corrida). Apagado por defecto: el primer encendido lo hace el equipo.

## Selección
Leads `fit` no demo de búsquedas reales (o de `huntIds`), con correo genérico de empresa, sin mensaje previo a la empresa, no suprimidos, orden `fit_score desc`. Ya enviados hoy cuentan contra el cupo (idempotente si el cron corre dos veces). Fuera de ventana → no hace nada y lo informa.

## Correo
- `generateMessage` añade dos bloques de plantilla fija (no los escribe la IA):
  - "Lo que vimos:" con hasta 3 hallazgos reales del diagnóstico (`FACT`), uno por línea "• …".
  - "Cómo le ayudamos:" con el servicio que corresponde a cada hallazgo y su resultado (`howWeHelp`).
- `renderEmailHtml` dibuja esos bloques como tarjetas (hallazgo con punto ámbar, servicio con check verde lima), además del saludo, oferta, botón al diagnóstico y pie legal (remitente, motivo, baja de un clic, `List-Unsubscribe`).
- La vista previa de Contacto muestra exactamente lo mismo.

## Criterios de aceptación
1. Sin `CRON_SECRET` válido → 401.
2. Apagado → `{skipped:"disabled"}` y nada se encola.
3. Nunca más de `emailsPerDay` envíos por día (contando los de la cola de hoy).
4. El HTML contiene hallazgos y servicios reales del lead; sin hallazgos, solo la oferta.
5. Respeta ventana, supresión, un mensaje por empresa y `SEND_ENABLED`.
