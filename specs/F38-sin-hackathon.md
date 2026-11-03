# F38 · Quitar el "30X Hackathon" de todo lo público

**Prioridad:** P0. **Contexto:** el 30X Hackathon terminó hace semanas y el equipo ganó. Faro ya trabaja para vender Mokub (F37), pero los correos, la página de baja, la landing y algunos mensajes siguen diciendo "proyecto del 30X Hackathon". La regla de cumplimiento F09 exige esa frase para dar un mensaje por "identificado", así que hoy no se puede quitar sin bloquear los envíos.

## Alcance
1. **Remitente en correos (F10):**
   - "Quién escribe: Mokub. Puede responder directamente a este correo."
   - Firma: "Mokub", con el nombre legal y la dirección si están configurados.
   - Sin vendedor configurado, el remitente es el nombre del producto.
2. **Regla de cumplimiento (F09):** un mensaje identifica al remitente si:
   - tiene la línea "Quién escribe" (o "Le escribe" en WhatsApp);
   - tiene el enlace o la palabra de baja;
   - dice cómo responder.
   
   Los mensajes viejos con "30X" siguen contando como identificados. El texto del bloqueo dice "(quién escribe, cómo responder y por qué le escribimos)".
3. **`ensureCompliantBody`:** si una edición borró la firma, se vuelve a poner la firma nueva. Ya no se busca "30X Hackathon".
4. **WhatsApp:**
   - La plantilla vieja de clínicas ("Somos Faro, un proyecto del 30X Hackathon") **deja de enviarse**. Ninguna plantilla se ofrece sin su ID configurado (`DAPTA_WA_TEMPLATE_*`).
   - Mientras Meta revisa las de Mokub, no se envía WhatsApp a leads nuevos; el correo sí sigue.
   - El texto de respaldo del adaptador de WhatsApp también habla como Mokub.
5. **Páginas:** se quita la mención de `/baja/*`, del encabezado de la landing ("30X Hackathon · Reto Dapta") y de su pie. "Integrado con Dapta" se queda.
6. **User-Agent** de los buscadores (Overpass, sitios web): `Faro/0.1 (+url)`, sin el hackathon.

## No-alcance
- Cambiar el historial: los mensajes ya enviados se guardan tal cual.
- Los documentos internos (specs, README, DECISIONS), que cuentan la historia del proyecto.
- Agregar "ganador del hackathon": si se quiere, va en otro cambio, con el texto que decida el dueño.

## Criterios de aceptación
1. Un correo nuevo no menciona el hackathon y pasa la revisión de cumplimiento.
2. Una edición que borra la firma la recupera.
3. No sale ningún WhatsApp con la plantilla vieja.
4. En `src`, `grep -i hackathon` solo encuentra comentarios, pruebas de compatibilidad con mensajes viejos y el texto aprobado de la plantilla vieja, guardado como histórico.
