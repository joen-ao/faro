# F47 · El cron del agente de WhatsApp corre en Supabase

**Prioridad:** P1, antes del corte del número real. **Depende de:** F45 (ruta `/api/cron/wa-agent`).

## Problema
El 2026-11-05 GitHub bloqueó las Actions de la cuenta por facturación. La anotación dice "account is locked due to a billing issue". La cuenta está en el plan gratis, no tiene método de pago y lo cobrado es $0, pero los presupuestos en $0 marcan "Usage blocked". Desde entonces `wa-agent cron` falla cada 10 minutos y manda un correo por cada falla.

Además, el `schedule` de GitHub no es puntual: entre el 4 y el 5 de noviembre corrió unas 6 veces, cuando debía correr cada 10 minutos.

Sin el cron:
- las conversaciones inactivas solo se cierran una vez al día (respaldo de `meta-ads-sync`);
- los seguimientos no salen.

## Solución
El cron pasa a la base de Supabase de Faro, que ya tiene disponibles `pg_cron` y `pg_net`. El Vault (`supabase_vault`) ya está instalado.

1. **Script `npm run cron:supabase`** (`scripts/setup-supabase-cron.ts`), idempotente:
   - `create extension if not exists pg_cron` y `pg_net`;
   - guarda `CRON_SECRET` en el Vault con el nombre `faro_cron_secret`: lo crea si no existe y lo actualiza si existe;
   - programa (o reemplaza) el trabajo `faro-wa-agent` con `*/10 * * * *`. Llama `GET {FARO_URL}/api/cron/wa-agent` con `Authorization: Bearer <secreto leído del Vault en cada ejecución>` y un timeout de 60 s.
   - `--off` desprograma el trabajo.
   - **Al terminar imprime:** si el trabajo está activo, su horario y las últimas 3 respuestas de `net._http_response` (código y fecha), nunca el secreto.
2. **El secreto nunca queda en el repositorio** ni en el texto del trabajo: el SQL del trabajo lo lee de `vault.decrypted_secrets` al correr. El script toma `CRON_SECRET` del entorno (`.env.local`, el mismo valor que en Vercel).
3. **GitHub Actions:** `wa-agent-cron.yml` queda solo con `workflow_dispatch`, como respaldo manual. Se quita el `schedule`, así ya no llegan correos de falla.
4. **Comentarios:** la ruta `/api/cron/wa-agent` y su comentario pasan a nombrar Supabase como quien la llama.
5. **Local (PGlite):** el script se niega a correr sin `DATABASE_URL`, porque PGlite no tiene `pg_cron`.

## No-alcance
- Arreglar la facturación de GitHub (lo revisa el dueño).
- Mover otros crons de Vercel.

## Criterios de aceptación
1. `npm run cron:supabase` deja el trabajo `faro-wa-agent` activo cada 10 minutos. Correrlo dos veces no duplica el trabajo ni el secreto.
2. **Primera llamada a la ruta:** dentro de los 10 minutos siguientes, `net._http_response` muestra una respuesta 200 de `/api/cron/wa-agent`.
3. El secreto no aparece en `cron.job.command`, en el repositorio ni en la salida del script.
4. El workflow de GitHub ya no tiene `schedule`.
5. `npm run check` pasa.
