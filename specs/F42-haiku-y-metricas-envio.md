# F42 · Haiku para los correos, costos reales por modelo y métricas de entrega

**Prioridad:** P0. **Contexto:** la tanda diaria arranca con 80 correos al día. Hoy hay tres problemas:
- Un solo modelo (`ANTHROPIC_MODEL`, Sonnet 5.5) hace todo, incluso los correos. Un correo es texto corto y con los datos ya dados: Haiku 5.5 alcanza y cuesta 20 veces menos.
- Faro calcula el costo de la IA con la tarifa de un Sonnet viejo (USD 3/15 por millón de tokens). Sonnet 5.5 cuesta USD 2/10 y Haiku 5.5 USD 0,10/0,50.
- El panel de Contacto muestra contactados, aperturas de la propuesta y respuestas, pero no si el correo llegó, rebotó o recibió clics.

## Alcance
1. **Modelo por tarea:**
   - los correos de prospección (cola, tanda diaria y "Ejecutar ahora") usan `ANTHROPIC_OUTREACH_MODEL`, por defecto `claude-haiku-5-5`;
   - lo demás (interpretar la búsqueda, ángulos, puntaje, aprendizajes, Copiloto) sigue con `ANTHROPIC_MODEL` (Sonnet 5.5);
   - en modo mock no cambia nada.
2. **Costo por modelo:**
   - una tabla de precios de lista por modelo (Sonnet 5.5, Haiku 5.5 y Opus 5.5) da la tarifa de cada llamada;
   - un modelo que no está en la tabla usa `cost_rates`, como hoy;
   - el valor por defecto y la semilla pasan a USD 2/10, y en producción se corrigen las filas de `cost_rates`;
   - no se reescriben los costos ya guardados.
3. **Métricas de Contacto:**
   - "Entregados": empresas con un correo que Resend confirmó (`delivered`), con su tasa sobre los contactados;
   - "Rebotaron": correos con rebote duro;
   - "Clic en el correo": empresas que hicieron clic en un enlace del correo;
   - todo se ve por canal y en el total, al lado de "Abrieron el diagnóstico" y "Respondieron";
   - si un correo enviado no tiene evento de entrega, el panel dice que el webhook de Resend no está reportando.
4. **Tanda diaria:** el tope sube a 80 (máximo 100, el límite diario del plan gratis de Resend).

## Criterios de aceptación
1. La tanda diaria genera el correo con el modelo de `ANTHROPIC_OUTREACH_MODEL` (Haiku por defecto), y el puntaje sigue con `ANTHROPIC_MODEL`.
2. Un correo hecho con Haiku 5.5 se cobra a USD 0,10/0,50 por millón de tokens, y uno con Sonnet 5.5 a USD 2/10.
3. El panel muestra entregados, rebotes y clics, con la tasa de entrega.
