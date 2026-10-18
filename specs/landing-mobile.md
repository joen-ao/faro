# Landing en móvil (≤ 639 px): spec

Fecha: 18 oct 2026. Alcance: solo la landing `/` en pantallas de menos de 640 px. **El escritorio no cambia.**

## Regla técnica

Todo cambio usa la variante `max-sm:` de Tailwind, o elementos que solo existen en móvil (`sm:hidden`). Ninguna clase base ni ninguna variante `sm:`/`md:`/`lg:` se modifica. Se verifica comparando píxel a píxel la captura de 1440 px antes y después.

## Diagnóstico (captura 390 × 844 con datos reales de producción)

| # | Sección | Problema |
|---|---|---|
| 1 | Nav | "Entrar" y "Encontrar mis clientes" llenan toda la barra; el logo queda apretado. |
| 2 | Banda de cifras | Las 4 cifras van en una sola columna: 586 px de alto para 4 números. |
| 3 | Todas las secciones de pantalla completa | `min-h-dvh` + `py-24` dejan huecos negros grandes entre secciones (el contenido ya es más alto que la pantalla). |
| 4 | Cómo funciona | 1.507 px de alto: pasos con mucho aire y el embudo muy separado de los pasos. |
| 5 | Pauta vs. fuentes | "Sin datos aún" en tamaño gigante gris; columnas con relleno de escritorio. |
| 6 | Diagnóstico | Las etiquetas flotantes se montan sobre el borde del teléfono; el teléfono tiene un vacío grande (alto mínimo de 520 px); las etiquetas de las 3 cifras se parten en dos líneas. |
| 7 | Cumplimiento | El "0" gigante queda solo con su texto debajo y mucho espacio; los 4 puntos tienen relleno de escritorio (1.541 px de sección). |
| 8 | CTA final | Relleno superior e inferior excesivo. |

## Cambios

1. **Nav:** el botón principal dice "Empezar" en móvil (el texto completo sigue en ≥ 640 px); botones de 40 px de alto con espaciado compacto.
2. **Cifras:** cuadrícula de 2 × 2, número de 32 px y etiqueta de 13 px; `py-10`.
3. **Secciones de pantalla completa:** sin alto mínimo de pantalla en móvil y `py-16`.
4. **Cómo funciona:** pasos con `pb-6`, título a 36 px, embudo con `gap-10` respecto a los pasos.
5. **Pauta:** columnas con `py-8`; "Sin datos aún" a 24 px.
6. **Diagnóstico:** etiquetas flotantes en flujo normal (una arriba y otra abajo del teléfono, centradas, sin tapar el borde); teléfono sin alto mínimo; etiquetas de cifras a 12 px.
7. **Cumplimiento:** el "0" a 80 px en la misma fila que su texto; los 4 puntos con `py-6` e ícono a 12 px del título.
8. **CTA final:** `pt-12 pb-20`.

## Criterios de aceptación

- A 390 px no hay scroll horizontal y nada se superpone.
- La landing en móvil baja de ~8.100 px a menos de ~6.000 px de alto, sin quitar contenido.
- La captura de escritorio de 1440 px es idéntica píxel a píxel antes y después.
- `npm run check` y los e2e en verde.
