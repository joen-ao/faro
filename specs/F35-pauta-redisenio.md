# F35 · Sidebar y vista Pauta, rediseñadas

**Prioridad:** P0. **Contexto:** la pauta es hoy lo principal de Faro, pero vive en "Configuración", al fondo del sidebar. Su información está repartida en dos páginas que se pisan:
- **Pauta** (`/app/settings/ads`) tiene el estado de Meta, las campañas con activar y pausar, un formulario para crear una campaña a mano, el gasto manual y los enlaces UTM.
- **Copiloto** (`/app/ads/copilot`) tiene el rendimiento por anuncio, el chat, el brief, las variantes, las recomendaciones, el piloto automático, el registro de cambios, "Pausar todo" y los aprendizajes.

Hay dos lugares para crear campañas, y el rendimiento está en uno mientras la acción de activar está en el otro. Nadie entiende el flujo.

## El flujo (regla de toda la app)
**Crear en el Copiloto → operar y medir en Pauta.** Cada página tiene un trabajo y un botón principal.
- **Copiloto** = crear anuncios (F36). El botón principal es "Crear campaña en pausa".
- **Pauta** = ver cómo va y decidir. Muestra las campañas, sus anuncios, lo que hay que decidir hoy, y activar o pausar. Su botón principal es "Nueva campaña", que lleva al Copiloto.
- Lo técnico o poco frecuente queda plegado en "Ajustes avanzados" al final de Pauta.

## 1. Sidebar
- Arriba sigue "Nueva búsqueda".
- **Tablero** queda solo, como inicio.
- Nuevo grupo **Pauta**, primero:
  - **Campañas** (`/app/ads`), con la insignia "N por decidir" cuando hay recomendaciones pendientes;
  - **Copiloto** (`/app/ads/copilot`).
- Grupo **Prospección**: Búsquedas y Contacto, igual que hoy.
- **Recientes**: igual.
- **Configuración**: Tu oferta y Horario de envío. Pauta y Copiloto salen de aquí.
- `/app/settings/ads` redirige a `/app/ads`, para que no se rompan los enlaces viejos ni los correos.

## 2. Vista Pauta (`/app/ads`)
De arriba a abajo:
1. **Encabezado:** título "Pauta", una línea ("Así van tus anuncios en Meta, medidos hasta el lead calificado") y el botón principal **Nueva campaña** hacia el Copiloto.
   - Debajo va una línea de estado: "Meta conectado · Cuenta X · sincronizado hace 2 h", con el botón pequeño **Sincronizar**.
   - En modo de prueba la línea dice "Meta en modo de prueba" y se marca como tal.
2. **Resumen de 30 días:** cuatro números (Gasto, Leads, Calificados y CPQL, que es el principal). Salen de los datos de Meta por anuncio (`ad_insights`) y de los leads atribuidos (`adPerformance`).
   - Un número con pocos datos se marca "pocos datos".
   - Sin datos se muestra "—" y una línea explica cuándo llegan.
3. **Para decidir hoy** (solo si hay recomendaciones pendientes): una tarjeta por recomendación, con qué pasa, la evidencia en palabras y los botones **Aplicar** / **Descartar**.
   - Las que suben gasto siguen bloqueadas sin `ADS_SPEND_ENABLED`, y la tarjeta dice por qué.
   - Si no hay pendientes, no se muestra la sección; el resumen dice "Nada por decidir".
4. **Campañas:** una fila por campaña con estado (Activa / En pausa), presupuesto diario, gasto de 30 días, leads, calificados, CPQL y la acción principal.
   - **Pausar** es inmediato.
   - **Activar** pide escribir el nombre, como hoy.
   - **Ver anuncios** despliega el rendimiento por anuncio de esa campaña: ángulo, formato, CTR, leads, calificados y CPQL, con las marcas de "pocos datos". Es lo que hoy vive en el Copiloto.
   - Sin campañas: un estado vacío con un solo botón, **Crear la primera campaña**.
   - Al final de la sección va un enlace discreto en rojo, **Pausar todo**, con su confirmación.
5. **Lo que hemos aprendido:** los aprendizajes de F29 (máximo 3 visibles y "ver todos"), con el botón **Actualizar**.
6. **Ajustes avanzados** (plegado, con `<details>`):
   - **Piloto automático:** modo y topes de CPL/CPQL, más "Evaluar ahora";
   - **Registro de cambios en Meta**, con Revertir;
   - **Gasto manual y enlaces UTM**, lo de hoy, más el aviso de gasto sin leads;
   - **Crear campaña a mano**, el formulario de F28, para casos raros;
   - **CPL de meta_ads del tablero** y el gasto cargado.

## Reglas
- No cambia ninguna API ni regla de seguridad: tope de presupuesto, creación en pausa, activar escribiendo el nombre, `ADS_SPEND_ENABLED`, el registro y Revertir.
- Los datos mock se marcan y no se mezclan con los reales.
- La página carga con lecturas livianas y en secuencia, como F31, y un error de Meta se muestra sin romper la página.
- En móvil (390 px) no hay scroll horizontal: las campañas pasan a tarjetas.

## No-alcance
Gráficas por día, editar campañas existentes (presupuesto o texto) y otras plataformas además de Meta.

## Criterios de aceptación
1. Desde el sidebar, Pauta y Copiloto están arriba, en su propio grupo, y `/app/settings/ads` lleva a `/app/ads`.
2. En Pauta se ve, sin desplazarse en un portátil, cuánto se gastó, cuántos leads calificados hubo, su costo y si hay algo por decidir.
3. Activar, pausar, aplicar una recomendación y revertir funcionan desde Pauta igual que antes.
4. Crear campañas solo se ofrece como acción principal en el Copiloto; en Pauta el formulario manual queda plegado.
