# F54 — Correo general de servicios y plan de volumen

## Por qué
Meta del dueño: **40 clientes con los ~4.900 leads `fit`, o 100 con los 57.000 encontrados.** Hoy solo 46 leads pueden recibir el correo con hallazgo.

Medición del 2026-11-08:

| Grupo | Leads | Qué falta |
|---|---|---|
| `fit`, persona jurídica con correo genérico, con hallazgo | 46 | nada (F48–F53) |
| `fit`, persona jurídica con correo genérico, sin hallazgo, sin segmento o con web por revisar | ~190 | un correo que no dependa del hallazgo |
| `fit` con solo correo personal | 2.518 empresas, de las cuales 2.504 son personas naturales | decisión legal: RNE + Ley 2300 + Ley 1581 |
| `fit` sin correo | ~1.040 | enriquecimiento (web y correo) |
| `found` (puntuados bajo el umbral) | 57.246 | 47.740 son personas jurídicas, pero solo 50 tienen correo y 570 tienen web: **nunca se enriquecieron** |

### Cuentas honestas
- **Referencias de la investigación de F48:**
  - una reunión cada 40 a 200 envíos;
  - se cierra entre el 20 % y el 30 % de las reuniones.
- **Con 4.000 envíos:** salen de 20 a 100 reuniones, es decir, de 5 a 25 clientes.
- **Para 40 clientes:** hacen falta del orden de 6.000 a 30.000 envíos con buena entrega, o una tasa de conversión mejor que el promedio.
- **El volumen depende de tres cosas:**
  1. tener correos (enriquecimiento);
  2. poder escribirles (lo legal);
  3. poder enviar más de 40 al día sin quemar el dominio (buzones de Workspace con calentamiento).

## Qué hace F54

### A. Correo general de servicios (sin hallazgo)
- **A quién:** a un lead `fit`, persona jurídica, con buzón genérico válido, que no sea `tipo_no_objetivo` ni esté ya contactado y que no tenga hallazgo. Esto cubre `sin_hallazgo`, `sector_sin_oferta`, `sin_web_no_verificada`, `web_por_revisar` y `web_dudosa`.
- **Prioridad en el envío diario:** se usa solo cuando el lead no tiene hallazgo. El envío diario llena primero el cupo con los correos de hallazgo.
- **Segmento:** el del sector. Sin sector reconocido, se usa el segmento **general**:
  - servicios: agentes-ia, landing-webs, flujo-automatizacion;
  - dolor: "tiempo del equipo respondiendo lo mismo por WhatsApp y correo, y clientes que se enfrían si nadie responde rápido".
- **Texto 100 % plantilla.** No se gasta IA y no hay riesgo de que se invente nada:
  - **Asunto:** "una idea para {empresa corta}".
  - **Apertura:** "Le escribo porque en Mokub trabajamos con {etiqueta del segmento} y vemos mucho lo mismo: {dolor}."
  - **Dato con fuente** del segmento (HBR o Google).
  - **2 servicios** del segmento, cada uno con su resultado (de "Tu oferta").
  - **Prueba** con la demo del agente.
  - **Pregunta:** "¿Le muestro en 20 minutos cómo se vería en {empresa}?" (en plural si firma el equipo).
  - **Firma, PD con humor y pie legal:** los mismos de F52.
- **Límites:** máximo 130 palabras sobre la firma (dos servicios con su resultado). Sin enlace al diagnóstico, porque no hay hallazgo que mostrar.
- **HTML:** la lista de servicios va como bloque. Por lo demás, el mismo diseño de F52.

### B. Repaso del enriquecimiento (gratis primero)
1. **Webs del dominio del correo:** se vuelven a revisar las que no respondieron. Timeout más largo, http además de https, y con y sin www.
2. **`fit` sin correo:** descubrimiento gratuito de la web (adivinar el dominio y buscador libre, `enrich-hunt`). Después se lee la web para sacar correos y hallazgos.
3. **Places:** sigue dentro del cupo gratuito (unas 880 búsquedas libres este mes).

### C. Necesita decisión del dueño (no se hace en F54)
- **Correos personales de independientes** (2.504 personas naturales): requiere consultar el RNE y el visto bueno de un abogado. Es una decisión legal.
- **Enriquecer los 57.246 `found`:** Places más allá del cupo cuesta unos 35 USD por 1.000 búsquedas, y luego habría que volver a puntuarlos con IA. Requiere aprobar un presupuesto.
- **Subir el envío por encima de 40 al día:** requiere los buzones de Workspace (semana del 2026-11-09).

## Criterios verificables
1. Un lead `fit` con buzón genérico y `sin_hallazgo` recibe el correo general, con los servicios de su segmento y sin cifras inventadas.
2. Un lead `sector_sin_oferta` recibe el correo general con el segmento general.
3. `tipo_no_objetivo` y `correo_no_generico` nunca reciben el correo general.
4. El envío diario pone primero los correos con hallazgo.
5. El correo general tiene ≤ 130 palabras y el HTML muestra la lista de servicios.
6. Se mide el nuevo volumen contactable y se generan 5 muestras sin enviar.
7. `npm run check` queda en verde.
