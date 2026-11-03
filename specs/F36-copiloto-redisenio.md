# F36 · Vista Copiloto, rediseñada

**Prioridad:** P0. **Contexto:** el Copiloto (`/app/ads/copilot`) pone en una sola columna el rendimiento, el chat, el formulario del brief, las variantes, el nombre y crear, y abajo las recomendaciones, el piloto automático, el registro, "Pausar todo" y los aprendizajes. Para crear un anuncio hay que bajar mucho y no se entiende qué paso sigue. Con F35, operar y medir se va a Pauta, y el Copiloto queda con **un solo trabajo: crear una campaña con Claude**.

## El flujo: tres pasos visibles
Una barra de pasos arriba muestra en qué paso se está: **1 Describe · 2 Revisa · 3 Crea en pausa**.

1. **Describe:** una conversación, como en las búsquedas.
   - Un cuadro grande "¿Qué quieres promocionar?", con 3 ejemplos tocables que llenan el cuadro.
   - Claude arma el brief (F33). Si falta algo, pregunta una sola cosa por vez.
   - Al lado (o debajo en móvil), **"Lo que ya sabemos"**: hasta 3 aprendizajes de F29, en una línea cada uno, para que el equipo escriba mejor.
2. **Revisa:** cuando hay variantes, la pantalla se divide.
   - **Izquierda (sticky en escritorio): la conversación.** Sirve para pedir cambios ("haz la 2 más corta") o preguntar.
   - **Arriba a la derecha: el brief como resumen**, en chips (servicio · presupuesto/día · ubicación · público · destino). **Editar** lo abre como formulario en el mismo sitio. Un cambio en el brief ofrece "Proponer de nuevo".
   - **Abajo a la derecha: los anuncios como se verán en Meta.** Cada tarjeta es una vista previa:
     - encabezado "Mokub · Patrocinado", texto principal, la imagen o el video (o el espacio para subirlo), el título, la descripción y el botón;
     - arriba de la tarjeta, el ángulo y el formato;
     - abajo, la hipótesis en gris;
     - **Editar texto** abre los campos en la misma tarjeta;
     - un interruptor "Incluir" y "Quitar";
     - los avisos de políticas en rojo dentro de la tarjeta, y "Editado por Claude" cuando el chat la cambió.
3. **Crea en pausa:** una barra fija abajo con el nombre de la campaña (editable), "N anuncios · todo en pausa" y el botón **Crear campaña en pausa**.
   - El botón dice por qué está bloqueado: avisos, subidas en curso o nombre corto.
   - Al crear, la página muestra el éxito con **Ver en Pauta** (`/app/ads`) y **Crear otra**.

## Qué sale de esta vista (va a Pauta, F35)
El rendimiento por anuncio, las recomendaciones, el piloto automático, el registro de cambios, "Pausar todo" y el panel completo de aprendizajes.

## Reglas
- No cambia ninguna API (brief, propose, chat, media, campaigns) ni sus candados: las reglas de políticas, el tope de presupuesto, el host permitido y la creación en pausa.
- El chat sigue sin crear, activar ni cambiar presupuestos.
- "IA en modo de prueba" y "Meta en modo de prueba" se ven como etiquetas pequeñas en el encabezado, y las variantes mock se marcan DEMO.
- El historial vive en la página (F33). Al recargar se empieza de nuevo.
- En móvil (390 px): una columna con la conversación, luego el brief, luego los anuncios, y la barra de crear fija abajo. Sin scroll horizontal y con objetivos táctiles de 44 px o más.
- Accesible: pasos con `aria-current`, el hilo con `aria-live` y etiquetas en todos los campos.

## No-alcance
Guardar borradores, varias campañas a la vez, generar imágenes y vista previa de Instagram o Stories por separado.

## Criterios de aceptación
1. Con una frase completa se llega a los anuncios propuestos sin tocar un formulario, y crear queda a un clic.
2. En la pantalla de Revisa se ven a la vez la conversación, el brief y al menos el primer anuncio, en un portátil de 1280×800.
3. Cada anuncio se ve como un anuncio de Meta, y editar su texto no saca al usuario de la tarjeta.
4. Todo lo que no es crear ya no está en esta página. Las pruebas de F29, F32 y F33 siguen pasando.
