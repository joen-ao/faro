# F41 · Escribirles también a personas naturales y a correos personales

**Prioridad:** P0. **Contexto:** durante el 30X Hackathon, Faro solo escribía de forma automática a personas jurídicas con un buzón genérico (info@, contacto@…), como lo pedía el reto (SPEC §8). El hackathon terminó y el dueño decidió escribirles también a personas naturales: comerciantes inscritos en RUES, contratistas de SECOP y prestadores de REPS. Hoy hay unas 2.600 con correo, casi todas con un correo personal (gmail, hotmail). La tanda diaria solo encuentra 350 candidatos.

**Decisión del dueño (2026-11-03), con el riesgo explicado:** la Ley 1581 pide autorización para tratar datos personales con fines comerciales, salvo los datos públicos, y la SIC sanciona el uso de bases sin autorización. El dueño asume ese riesgo.

## Alcance
1. **Cumplimiento (F09):** se quitan los bloqueos `natural_person` y `personal_email`. Sigue igual todo lo demás:
   - lista de supresión y baja en un clic;
   - un solo mensaje por empresa o persona, sin seguimientos;
   - horario de envío;
   - remitente identificado ("Quién escribe");
   - reglas de EE. UU.;
   - naturaleza jurídica por verificar (`legal_unverified`), solo para empresas.
2. **Canal (`channel.ts`):** se usa primero el buzón genérico. Si no hay, se usa el primer correo personal.
3. **Tanda diaria (F25):**
   - los candidatos son los leads `fit` con cualquier correo, sean empresa o persona natural;
   - el orden es por puntaje, y a igual puntaje van primero las empresas con buzón genérico;
   - el conteo de "listos" en /app/settings/envio usa los mismos criterios.
4. **Contacto manual de independientes (F27):** se mantiene como opción, sin cambios.
5. **Textos públicos y tablero:**
   - en la landing, "Solo empresas" se reemplaza por "Quién escribe, siempre", y se quita la cifra gigante de "personas naturales contactadas" (también de las cifras del evento);
   - en el tablero, "Personas naturales contactadas" pasa a ser informativo, sin "Debe ser 0".

## No-alcance
- Cambiar el puntaje: una persona natural nueva solo llega a `fit` si la búsqueda tiene `includeIndependents`.
- Guardar correos personales que se encuentren en sitios web: el enriquecimiento sigue guardando solo los genéricos.
- WhatsApp, que ya tenía su plantilla de independientes.

## Criterios de aceptación
1. Un lead de persona natural con correo personal pasa el cumplimiento y se puede encolar.
2. Un correo genérico gana sobre uno personal en la misma empresa.
3. La tanda diaria incluye personas naturales con correo personal y nunca dos veces la misma empresa.
4. La supresión, el horario y "un mensaje por empresa" siguen bloqueando.
5. La landing ya no dice "Solo empresas" ni muestra "personas naturales contactadas".
