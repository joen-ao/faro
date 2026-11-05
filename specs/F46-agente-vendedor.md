# F46 · El agente de WhatsApp vende como un asesor y agenda la fecha correcta

**Prioridad:** P1. **Depende de:** F44 y F45 (agente propio conectado al número de prueba).
**Origen:** prueba real del 2026-11-04 con el número de prueba +1 555 178 9279.

## Qué pasó en la prueba

| # | Problema | Causa |
|---|---|---|
| 1 | El agente no sonaba a vendedor: saludo genérico ("¿En qué le puedo ayudar hoy?"), sin presentar lo que hace Mokub ni llevar la conversación. | El rol en `prompt.ts` lo define como "asistente" que responde. No le pide abrir con valor ni llevar la venta. |
| 2 | No preguntó qué servicio le interesaba ni qué necesitaba. Pasó directo a horas y datos. | La regla "Si la persona pide agendar en cualquier momento, agenda de una vez sin más preguntas", y `agendar_diagnostico` no exige saber la necesidad. |
| 3 | La persona escribió "vienes a las 4pm" (quería decir viernes) y el agente reservó el **jueves** 5 a las 4:00 p. m. | El modelo interpretó un día ambiguo como el primero de la lista y no lo confirmó. Además pidió los datos diciendo "el jueves 5 a las 4:00 p. m. está disponible", así que el "sí" de la persona confirmó la fecha equivocada. |
| 4 | El correo al dueño solo decía "Diagnóstico agendado: jueves 5 de noviembre, 16:00 (Bogotá)". Gmail lo marcó como inglés. | `notify.ts` solo recibe `when`. No lleva quién es, qué negocio, qué necesita, el enlace de Meet ni el WhatsApp. |

## Cambios

### A · Rol de asesor comercial (`prompt.ts`)
1. **Rol:** asesor comercial de Mokub (asistente de IA, lo dice si le preguntan). Su trabajo es entender el negocio, conectar el problema con un producto y llevar a la persona al Diagnóstico gratis.
2. **Primer mensaje** cuando la persona escribe sin contexto ("Hola"):
   - agradece;
   - dice en una frase qué hace Mokub (agentes de IA, automatizaciones, páginas web y software a medida para que los negocios vendan más y ahorren tiempo);
   - hace una pregunta concreta sobre el negocio: qué tipo de negocio tiene y qué quiere mejorar.
3. **Descubrimiento mínimo antes de agendar.** Antes de pedir los datos para la reserva, el agente debe saber:
   - qué negocio es (tipo y nombre);
   - qué necesita o qué servicio le interesa.

   Si la persona pide una cita de entrada, no se le frena:
   - en el mismo mensaje se le ofrecen las horas;
   - y se le pregunta para qué servicio o necesidad es la cita.

   Así no se agrega una vuelta extra.
4. **Con la necesidad clara**, recomienda un producto con su precio "desde" y explica en una frase por qué le sirve. Luego propone el diagnóstico.
5. Se quita la regla "agenda de una vez sin más preguntas".
6. **Tono:** cálido, seguro y concreto, de asesor y no de recepcionista. Sigue en máximo 3 frases y una pregunta por mensaje.

### B · Fecha confirmada sin ambigüedad (`prompt.ts` + `tools.ts`)
1. Cuando la persona elige una hora, el agente repite **día de la semana, número, mes y hora**: "viernes 6 de noviembre a las 4:00 p. m.".
2. Si lo que escribió no coincide exactamente con un día ofrecido, el agente pregunta cuál de los días quiere antes de pedir datos. Por ejemplo:
   - un día mal escrito ("vienes");
   - un día que no se ofreció;
   - "ese" o "el primero" cuando hay varios días.
3. `agendar_diagnostico` recibe un campo nuevo, obligatorio: `dia_confirmado`. Es el día de la semana que la persona confirmó ("viernes").
   - El código revisa que ese día coincida con `fecha`.
   - Si no coincide, responde `dia_no_coincide` sin reservar, y el agente vuelve a confirmar.
   - Esto atrapa el caso en que el modelo cruza el día con la fecha.

### C · Necesidad obligatoria para reservar (`tools.ts`)
1. `guardar_datos` suma `necesidad`: lo que la persona quiere resolver, en sus palabras (máx. 200 caracteres).
2. `agendar_diagnostico` responde `falta_necesidad` sin reservar cuando la conversación no tiene `necesidad` ni `producto_interes` guardados. El agente pregunta para qué es la cita y luego reserva.

### D · Correo de reunión completo (`notify.ts` + `engine.ts`)
El aviso `reunion` pasa a llevar todo lo que el equipo necesita para preparar la llamada:
- Fecha y hora (texto de mokub.co) y el enlace de Meet si mokub.co lo devuelve (`meetLink`).
- Nombre, correo y WhatsApp completo de la persona.
- Negocio, servicio de interés, necesidad y origen (anuncio con su referencia, diagnóstico de Faro o escribió directo).
- Enlace a la conversación en Faro.

**Formato:**
- HTML en español: un título, una tabla de dos columnas y un botón "Ver la conversación";
- versión de texto equivalente;
- `lang="es"` en el HTML, para que Gmail no lo tome como inglés.

Los avisos `compra`, `persona` y `falla` usan el mismo formato, con los datos que haya.

### E · Casos nuevos en el eval (`tests/eval/wa-agent/scenarios.ts`, `scripts/eval-wa-agent.ts`)
Segunda prueba real (2026-11-04, 11:15 p. m.): agendó bien, pero pidió la autorización y los datos en dos mensajes. Se agregan escenarios con lo aprendido:

| Escenario | Qué hace el contacto | Revisión automática |
|---|---|---|
| `saludo-solo` | Escribe "ola", tiene una peluquería y quiere más clientes. | `abre_con_valor`: el primer mensaje habla de lo que hace Mokub y pregunta por el negocio. |
| `dia-mal-escrito` | Escribe "el vienes a las 5" cuando le ofrecen jueves y viernes. | `dia_correcto` (crítico): si reserva, es un viernes. |
| `cita-sin-contexto` | Pide "una cita" sin decir para qué. | `necesidad_antes_de_agendar` (crítico): la necesidad o el producto quedaron guardados antes de reservar. |
| `pregunta-plazo` | Pregunta cuánto tardan y pide una fecha de entrega exacta. | El juez revisa que no invente plazos. |
| `regatea` | Pide descuento y compara con un freelancer más barato. | El juez revisa que no invente descuentos y defienda el valor. |

**Revisión nueva en todos los escenarios que agendan:** `datos_en_un_mensaje` (no crítica). El mensaje que pide la autorización también pide el nombre y el correo.

## No-alcance
- La invitación de Google Calendar la crea mokub.co (otro repositorio): su título y texto no cambian aquí.
- Cancelar la reunión de prueba del jueves 5 de noviembre a las 4:00 p. m. lo hace el dueño desde el calendario.

## Criterios de aceptación
1. **Primer mensaje:** a un "Hola" sin contexto, el prompt pide presentar a Mokub en una frase y preguntar por el negocio. Se revisa en el texto del prompt y en el eval.
2. **Sin necesidad no hay reserva:** `agendar_diagnostico` sin `necesidad` ni `producto_interes` devuelve `falta_necesidad`, y no hay llamada a mokub.co.
3. **Día que no coincide:** `agendar_diagnostico` con `dia_confirmado: "viernes"` y una `fecha` que cae jueves devuelve `dia_no_coincide`, sin reservar. Con el día correcto reserva.
4. **Correo de reunión** con nombre, correo, WhatsApp, negocio, interés, necesidad, fecha, enlace de Meet (si existe) y enlace a Faro; HTML con `lang="es"`.
5. `PROMPT_VERSION` sube a `mokub-ventas-f46-v1`.
6. `npm run check` pasa.
