# F51 — Correo HTML con marca Mokub y rediseño de la página /d

## Por qué
Al revisar el lote v2 (2026-11-07) salieron cuatro problemas:
1. La página /d sigue con los colores de Faro (violeta y lima, fondo oscuro) y no con los de Mokub. Además su jerarquía y su CTA son débiles.
2. El bloque final tiene dos botones "Hablar por WhatsApp", uno al lado del otro, más el del hero.
3. El correo sale como texto plano, sin logo ni diseño.
4. El enlace de baja ocupa tres líneas y se sale del ancho del correo.

## Marca Mokub (tomada de mokub.co)
- **Colores:** noche `#0A1220`, capa noche `#13213A`, tinta `#0E1726`, fondo `#FAFAF7`, blanco, borde `#E2E5EB`, acento `#134E8A` (hover `#0D3A68`, suave `#E6EEF8`), WhatsApp `#1F7A45`, éxito `#135C4C` (suave `#E3F4EF`), alerta `#9A3412`, texto sobre noche `#C3CEDF`.
- **Tipografía:** Cal Sans para los títulos e Inter para el texto.
- **Logo:** `public/brand/mokub-logo.png`, a 192 px.

## Qué cambia

### 1. Enlace de baja corto
- El correo usa `/b/{slug}-{firma}` en lugar de `/baja/{token}`. La firma son 10 caracteres de un HMAC del slug con el mismo secreto del token largo.
- La ruta `/b/[code]` verifica la firma y redirige a `/baja/{token}` (token de lead, sin contacto). Si la firma no es válida, muestra 404.
- La cabecera `List-Unsubscribe` sigue con la URL larga de un clic, que no se ve.

### 2. Correo HTML (`features/outreach/email-html.ts`)
- **Envío multiparte.** El HTML es la versión principal y el texto plano va como alternativa, con el mismo contenido.
- **Plantilla en tablas con estilos en línea,** para que funcione en Gmail, Outlook y Apple Mail:
  - logo de Mokub con el nombre arriba;
  - tarjeta blanca sobre fondo `#F2F5F9`;
  - saludo, hallazgo y consecuencia;
  - la prueba en un bloque suave con el número de WhatsApp como enlace (`wa.me`);
  - la pregunta de cierre.
- **Variantes A/B:**
  - A: sin botón.
  - B: botón "Ver el diagnóstico" con el color de acento.
- **Pie en gris pequeño:** razón social con NIT, motivo del contacto, política y "Darse de baja" como texto enlazado.
- **Límites:**
  - El cuerpo sigue en ≤ 90 palabras.
  - Una sola imagen (el logo), con `alt`.
  - Ancho máximo de 600 px.
  - Sin fuentes web en el correo.

### 3. Página /d con marca Mokub (`app/d/_components/diagnostic-view.tsx`)
- **Tema propio** (`.mokub-page`): fondo claro con el hero en noche, como mokub.co. Los tokens de Faro no cambian en el resto de la app.
- **Cabecera:**
  - logo y "Mokub";
  - "No me interesa" como enlace discreto.
- **Hero:**
  - en una línea, para quién es y de qué trata ("Diagnóstico para {empresa}");
  - un título con el resultado, por ejemplo "Encontramos 3 oportunidades para conseguir más pacientes";
  - **un solo CTA** "Hablar por WhatsApp", en el verde de WhatsApp;
  - un enlace secundario para bajar al diagnóstico;
  - un resumen con números.
- **Oportunidades:** tarjetas numeradas. Cada una tiene la cita del sitio y, a un lado, "Cómo le ayudamos".
- **Lo que vimos:** una lista compacta en dos grupos, "Por mejorar" y "A favor". No se repite lo que ya dicen las oportunidades.
- **Comparación:** solo aparece si la empresa tiene web. Sin web, cada fila sería "Usted: no" y no aporta nada.
- **Cierre:**
  - un bloque en noche con el servicio recomendado, la oferta de entrada y **un solo botón** de WhatsApp;
  - al lado, "Qué pasa después", en 3 pasos y sin botón;
  - el formulario sigue disponible como opción plegada.
- **Pie:**
  - logo, razón social con NIT (siempre que exista `SENDER_LEGAL_NAME`), ciudad y correo de respuesta;
  - aviso de privacidad;
  - darse de baja.
- **Siempre de usted:**
  - los nombres de servicio con "tus" se muestran con "sus";
  - en el formulario: "Recibimos su mensaje", "info@suempresa.com", "No incluya nombres", "Inténtelo de nuevo".

## Fuera de alcance
- Las plantillas por nivel de datos.
- Detectar salud ocupacional por el texto de la web.

## Criterios verificables
1. El correo generado incluye `html` con el logo, ≤ 90 palabras sobre la firma y el enlace corto `/b/…` como "Darse de baja". El texto plano lleva el mismo enlace corto.
2. `/b/{slug}-{firma}` redirige a `/baja/…`. Una firma alterada da 404.
3. La variante B tiene el botón "Ver el diagnóstico" y la A no lo tiene.
4. La página /d tiene exactamente dos enlaces de WhatsApp: el del hero y el del cierre, nunca dos seguidos.
5. La página /d usa los colores y las fuentes de Mokub y muestra el NIT en el pie.
6. Una página sin web no muestra el bloque de comparación.
7. `npm run check` queda en verde (salvo las 2 pruebas de login que ya fallaban) y las capturas en escritorio y móvil se revisan.
