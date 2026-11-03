# F40 · La oferta de cada búsqueda usa los precios de "Tu oferta"

**Prioridad:** P0. **Contexto:** al crear una búsqueda, Faro guarda en `icp_profiles.offer` una copia de los servicios elegidos (F26). Esa copia gana sobre "Tu oferta" en el correo, el diagnóstico `/d` y los datos que van a Dapta. Todas las búsquedas de producción se crearon con el catálogo viejo ("450usd", "Desde USD 3.000", "Desde USD 450"). El 3 de noviembre se cargaron en "Tu oferta" los 8 servicios de mokub.co en pesos, pero ningún correo nuevo los usaría: saldrían los precios viejos en USD.

## Alcance
1. **Elegir sigue siendo de la búsqueda; el texto y el precio, del catálogo.** `loadEffectiveOffer` cambia a esto:
   - Cada servicio de la copia de la búsqueda se reemplaza por el servicio de "Tu oferta" que tenga **el mismo id**: nombre, precio, descripción, resultado, oferta de entrada, prueba y palabras clave actuales.
   - Un servicio que ya no existe en "Tu oferta" se descarta, con su precio viejo y todo.
   - Si no queda ninguno, la búsqueda usa todo el catálogo, como una búsqueda vieja sin oferta.
   - Los ángulos de valor se mantienen solo si su servicio sigue en la lista.
2. **No se reescribe la base:** la copia queda como registro de lo que se eligió. El cambio pasa al leer, así que también cubre los cambios futuros de "Tu oferta".
3. **Ningún cambio en cumplimiento, cupos ni envío.**

## No-alcance
Elegir otros servicios para las búsquedas existentes (se hace creando una búsqueda) y volver a calcular el puntaje de encaje.

## Criterios de aceptación
1. Una búsqueda con la copia de `agentes-ia` a "450usd" usa "Desde $1.490.000 + $290.000/mes" cuando "Tu oferta" tiene ese precio.
2. Un servicio de la copia que no está en "Tu oferta" no aparece.
3. Si ningún servicio de la copia sigue en el catálogo, se usa el catálogo completo.
4. Un ángulo de un servicio descartado no aparece.
