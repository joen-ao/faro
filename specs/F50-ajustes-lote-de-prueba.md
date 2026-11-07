# F50 — Ajustes al correo en frío tras el lote de prueba

## Por qué
El 2026-11-06 se generó un lote de prueba de 15 correos y 5 páginas, sin enviar nada
(`docs/review/lote-prueba-f48-2026-11-07.md`). Salieron siete problemas que impiden enviar:

1. **Prueba que no corresponde al servicio.** "Banco de la República: de 30 h a 15 min" aparece en correos a clínicas.
2. **Correos largos.** Tienen de 79 a 105 palabras sobre la firma (12 de 15 pasan el tope de 90). El verificador solo mide la parte que escribe el modelo.
3. **Direcciones de relleno.** `support@exampledomain.com` salió de una plantilla web.
4. **"No tiene web" falso.** La empresa no tenía web registrada, pero su correo es de dominio propio y ese dominio tiene un sitio activo (meditecsa.co). También pasa lo contrario: revisamos una web cuyo dominio no coincide con el del correo, así que puede ser de otra empresa.
5. **Destinatarios que no reciben pacientes.** Proveedores de medicamentos o dispositivos, salud ocupacional para empresas, fondos de droga y hospitales o sedes de instituciones grandes.
6. **Saludo con la razón social cruda.** "Hola, equipo de Medicamentos,dispositivos Medicos Y Tecnologias En Salud S.a.s:".
7. **Asunto que parece un rebote.** "sitio web no encontrado".

## Qué cambia

### Correo (`features/outreach/cold-email.ts`)
- **Nombre para mostrar** (`displayName`):
  - Quita la cola después de " - ".
  - Quita los sufijos legales (SAS, S.A.S., Ltda, E.U., S.A.).
  - Si el nombre viene todo en mayúsculas o mal capitalizado, lo pasa a tipo título, con "de, la, del, y, en, el, los, las" en minúscula.
  - Arregla los espacios después de las comas.
  - Se usa en el saludo y en el dato que recibe el modelo.
- **Plantilla más corta.**
  - Prueba: "Más de 15 proyectos en producción. Pruebe nuestro agente en WhatsApp: +57 …".
  - Oferta: "Preparamos un diagnóstico de una página para {dominio}. ¿Se lo enviamos por aquí o por WhatsApp?".
- **Tope sobre el correo armado.**
  - El verificador recibe el texto completo. Si pasa de 90 palabras sobre la firma (sin contar la PD con el enlace), se rechaza el borrador.
  - El modelo ahora tiene 40 palabras para observación + consecuencia (antes 50).
  - Si el modelo falla dos veces, se usa el respaldo fijo, que siempre cabe.
- **Asunto.** Se rechazan los asuntos que suenan a sistema o alarma: "no encontrado", "error", "aviso", "urgente", "notificación", "falla", "alerta". El prompt lo prohíbe de forma explícita.

### Elegibilidad (`features/offer/fit.ts`)
- **Correo válido.** Un correo de relleno no cuenta como genérico. Cuentan como relleno los dominios `example.*`, `exampledomain`, `domain.com`, `yourdomain`, `email.com`, `sentry.*`, `wixpress.com` y los locales `user`, `usuario`, `nombre`, `correo`, `test`. Este filtro también se aplica al elegir el canal.
- **El dominio del correo manda.** Con un correo genérico de dominio propio (no gmail, hotmail ni proveedores parecidos):
  - Si la empresa no tiene web, el motivo es `web_por_revisar` y no se dice "no tiene web".
  - Si la web registrada es de otro dominio, el motivo es `web_dudosa`.
- **Tipos que no reciben pacientes (segmento salud).** Reciben el motivo `tipo_no_objetivo` los nombres con:
  - medicamentos, dispositivos, droguería, farmacia, distribuidora, laboratorio farmacéutico o fondo de droga;
  - seguridad y salud en el trabajo, salud ocupacional o medicina laboral;
  - hospital, universidad o universitaria, o "edificio" (sedes de instituciones grandes).

### Completar la web con el dominio del correo (`scripts/enrich-places.ts`)
- Antes de buscar en Places, si la empresa no tiene web y su correo genérico es de dominio propio, se intenta abrir `https://{dominio}`.
- Si responde y es un sitio propio (`ownSiteRoot`), se guarda como web y se revisa. No se gasta la búsqueda en Places.

### Catálogo "Tu oferta" (datos de producción)
- Agente de IA en WhatsApp: "Más de 15 proyectos en producción."
- Flujo de automatización y Mapa de automatización: "Proceso crítico automatizado en Banco de la República: de 30 h a 15 min."

## Fuera de alcance
El rediseño de la página /d queda para F48 fase 3: un solo CTA, el NIT en el pie, plantillas para cuando no hay web y nada de tú.

## Criterios verificables
1. `displayName("Medicamentos,dispositivos Medicos Y Tecnologias En Salud S.a.s")` da "Medicamentos, Dispositivos Medicos y Tecnologias en Salud" (sin "S.a.s"). `displayName("Centro Nacional de La Salud - Medlucara Ltda")` da "Centro Nacional de la Salud".
2. Un correo armado de más de 90 palabras sobre la firma no pasa el verificador. Ningún correo del nuevo lote pasa de 90.
3. El asunto "sitio web no encontrado" se rechaza.
4. `support@exampledomain.com` no es genérico, y un lead que solo tiene ese correo no es elegible.
5. Sin web y con `info@empresa.co`, el motivo es `web_por_revisar`. Con web `otra.com` y correo `info@empresa.co`, el motivo es `web_dudosa`. Con `info@gmail.com` la regla anterior sigue igual.
6. Los nombres con "Medicamentos", "Seguridad y Salud en el Trabajo", "Hospital" o "Edificio" reciben `tipo_no_objetivo` en salud.
7. El nuevo lote de 15 no repite ninguno de los siete problemas.
8. `npm run check` queda en verde.
