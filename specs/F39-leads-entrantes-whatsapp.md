# F39 · Registrar en Faro a quien le escribe al agente sin estar en Faro

**Prioridad:** P0. **Contexto:** Mokub va a lanzar su campaña de Meta, y en mokub.co está el número del agente "Mokub · Ventas" (F37). Hoy, cuando alguien que Faro no conoce le escribe al agente, el webhook de Dapta responde `lead_not_found`. La calificación, la reunión agendada y la intención de compra se pierden, y el anuncio que trajo a esa persona nunca suma leads ni calificados en Pauta.

## Alcance
1. **Crear el lead que falta.** Si el webhook no encuentra un lead y la conversación trae un teléfono y no es una baja:
   - Faro crea la empresa, el punto de contacto de WhatsApp (y el correo si lo hay) y el lead, con estado "respondió".
   - Nombre de la empresa: la nueva variable del agente `nombre_negocio`. Si no está, "Contacto de WhatsApp ··· 1212" (últimos 4 dígitos).
   - Después se aplica la calificación como a cualquier lead: reunión agendada, compra, resumen y costo de Dapta.
   - Una segunda conversación del mismo número usa el mismo lead (búsqueda por teléfono, como hoy).
   - Una baja de alguien desconocido no crea nada: solo se suprime el número, como ya pasa.
2. **Saber de dónde vino.** El botón de WhatsApp de mokub.co (spec del proyecto Mokub) agrega al mensaje la referencia del anuncio cuando la visita trae `utm_source=meta`. Ejemplo: "Hola, quiero información (ref. meta-120245000000000)", con `{{ad.id}}` como `utm_content`.
   - El agente ya guarda lo que va después de "ref." en `ref_diagnostico`. Faro lo lee:
     - `meta-<id del anuncio>`: la fuente es `meta_ads`, y el evento de llegada lleva `utm {utm_source: meta, utm_content: <id>}`. Así el lead y su calificación cuentan en el rendimiento por anuncio (CPL y CPQL) y en Meta vs. Faro.
     - Otra referencia que sea el slug de un lead de Faro: se usa ese lead (viene del diagnóstico).
     - Sin referencia: la fuente es `website`, con origen "whatsapp".
   - También cuenta como anuncio si el payload de Dapta trae una marca de "click to WhatsApp" de Meta (`ctwa_clid` o `referral.source_type = ad`).
3. **Agente (Dapta):** nueva versión con:
   - variable `nombre_negocio`, el nombre del negocio, solo si la persona lo dice;
   - una regla: una referencia que empieza por `meta-` viene de un anuncio. Se trata como contacto entrante y no se habla de un diagnóstico.
   
   Se publica solo con aprobación del dueño.
4. **Privacidad (Ley 1581 y decisión F31-D):**
   - a estos contactos no se les manda el teléfono ni el correo a Meta por la API de Conversiones: no hay consentimiento de publicidad;
   - Faro los mide igual, porque la atribución al anuncio sale de la referencia;
   - a los leads que ya existían (empresas de registros públicos) se les mantiene el comportamiento de hoy.

## No-alcance
Leer el `referral` completo de la API de WhatsApp (Dapta no lo expone documentado), anuncios de "click to WhatsApp" directos y unir dos leads del mismo negocio que escribió desde números distintos.

## Criterios de aceptación
1. Una conversación de un número desconocido con reunión agendada crea el lead, la calificación y el evento `meeting_booked`, y el webhook responde 200.
2. Con "ref. meta-123", el lead queda como `meta_ads` y el anuncio 123 suma un lead en Pauta. Si el lead está calificado, también suma un calificado.
3. La segunda conversación del mismo número no crea otro lead.
4. Una baja de un número desconocido no crea lead.
5. Para un lead creado así no se envía ningún evento de la API de Conversiones.
