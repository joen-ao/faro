# F34 · Cerrar las tablas públicas de Supabase (RLS)

**Prioridad:** P0 (seguridad). **Contexto:** el 31 de octubre de 2026 Supabase avisó `rls_disabled_in_public` en el proyecto `faro` (ipbknsbibpmgqkqezski). Supabase expone el esquema `public` por su API REST (PostgREST) con la llave `anon`, que es pública por diseño. Sin Row Level Security, cualquiera con la URL del proyecto puede leer, editar y borrar esas tablas. Solo `users` y `metrics_snapshots` tenían RLS.

## Por qué no rompe la app
Faro no usa la API REST de Supabase ni la llave `anon`. Se conecta directo a Postgres por el pooler con el rol `postgres`, que es dueño de las tablas. RLS no aplica al dueño de la tabla (sin `FORCE`), así que la app sigue igual. `users` y `metrics_snapshots` ya funcionan así en producción.

## Alcance
1. **Todas las tablas de `public` con RLS activo y sin políticas.** Así `anon` y `authenticated` no ven ni tocan nada por la API REST.
   - En el esquema de Drizzle, cada `pgTable` lleva `.enableRLS()`, para que la próxima migración generada no lo pierda.
   - La migración `0016_enable_rls` lo activa en las 24 tablas de Faro.
   - Además, un bloque recorre cualquier otra tabla de `public` que no esté en el esquema (por ejemplo, una creada a mano desde el panel) y también le activa RLS.
2. **Quitar permisos a los roles de la API.** `REVOKE ALL` en las tablas y secuencias de `public` para `anon` y `authenticated`, y cambiar los permisos por defecto para que las tablas nuevas tampoco los tengan. Si esos roles no existen (PGlite en local y en pruebas), el paso se salta.
3. **Se aplica sola.** Como las demás migraciones, corre en el primer arranque del servidor después del deploy.
4. **Prueba:** una prueba confirma que, después de migrar, ninguna tabla de `public` queda sin RLS.

## No-alcance
Políticas por usuario, porque Faro no expone datos por la API REST. Tampoco rotar la llave `anon`, porque con RLS y sin permisos ya no sirve para nada. Rotar la contraseña de Postgres queda como recomendación si hubo dudas de una fuga, pero no hay señal de una.

## Criterios de aceptación
1. En producción, `select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity` no devuelve filas.
2. El Security Advisor de Supabase deja de mostrar `rls_disabled_in_public`.
3. La app sigue leyendo y escribiendo igual: el tablero, las búsquedas y el login funcionan después del deploy.
