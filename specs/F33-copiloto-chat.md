# F33 · Copiloto de pauta en modo chat

**Prioridad:** P1. **Contexto:** el copiloto de F29 pide llenar un formulario (servicio, destino, presupuesto, ubicación, público) y después editar campo por campo. Las búsquedas (F19) ya funcionan con texto libre que se convierte en un perfil editable. F33 lleva esa misma idea a la pauta: una frase para empezar y un chat para ajustar y preguntar.

## Alcance
1. **Arranque en una frase.** Un cuadro "Describe la campaña", por ejemplo: "Diagnóstico de agentes de IA para clínicas en Bogotá, 40 mil al día, a web.mokub.co".
   - `POST /api/ads/copilot/brief {text}`: Claude extrae servicio (solo del catálogo de Tu oferta), destino, presupuesto diario, ubicación, público, notas y número de variantes.
   - El código vuelve a validar todo:
     - un servicio fuera del catálogo queda vacío;
     - el destino debe ser https en un host permitido; si falta, se usa `https://www.mokub.co/`;
     - un presupuesto sobre el tope se marca, no se recorta.
   - Si falta algo obligatorio (servicio, presupuesto, público), la respuesta trae `missing` y **una** pregunta en español. Nunca se inventa el dato.
   - Si el brief está completo, la página propone las variantes en el mismo paso (como F29). El formulario sigue abajo, lleno y editable.
2. **Chat del copiloto** (`POST /api/ads/copilot/chat {message, history, brief, variants}`). Claude responde con `{reply, edits:[{index, changes}]}`.
   - **Ajustes:** "haz la 2 más corta", "quita los emojis", "cambia el ángulo de la 3 por precio". Solo puede tocar el texto (ángulo, formato, hook, texto principal, título, descripción, botón, hipótesis).
   - El servidor aplica cada cambio y lo vuelve a validar con el mismo esquema y las reglas de políticas de Meta. Un cambio inválido se descarta y se avisa. La página marca qué anuncios cambiaron.
   - **Preguntas:** "¿por qué la 1 tiene mejor CPQL?", "¿qué probarías la próxima semana?". Claude recibe el rendimiento por anuncio (30 días, con sus marcas de "pocos datos") y los aprendizajes. Debe citar números y decir cuando no alcanzan los datos.
   - **Historial:** las últimas 10 vueltas, de hasta 1.000 caracteres cada una. Vive en la página y no se guarda.
3. **Lo que el chat no hace:** crear campañas, activar, pausar ni cambiar presupuestos. Esas acciones siguen en botones con sus candados (reglas de políticas, tope de presupuesto, creación en pausa). Si se lo piden, el chat explica qué botón usar.
4. **Costo y seguridad:**
   - cada llamada se registra en `api_calls` y `cost_entries` como en F29;
   - el texto del equipo, el brief, las variantes y las métricas van como datos, nunca como instrucciones;
   - en modo mock las respuestas son deterministas: arma el brief con reglas simples y el chat entiende "más corta" y "sin emojis".

## No-alcance
Guardar conversaciones, voz, generación de imágenes, y que el chat ejecute acciones en Meta.

## Criterios de aceptación
1. Una frase con servicio, presupuesto y público arma el brief y propone variantes sin tocar el formulario. A una frase incompleta, Faro responde con una pregunta concreta.
2. "Haz la 2 más corta" cambia solo el anuncio 2, revisado por las reglas. Un cambio que rompe una regla se descarta o queda marcado.
3. El chat nunca cambia nada en Meta, y un servicio inventado o un dominio no permitido nunca llegan al brief.
4. Las rutas piden sesión, y todo funciona en modo mock.
