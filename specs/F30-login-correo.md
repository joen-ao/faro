# F30 · Login con correo y contraseña guardado en Supabase (sin registro)

**Prioridad:** P0. **Reemplaza en la pantalla:** el login con clave de equipo (F23).

## Objetivo
Entrar a `/app` con **correo y contraseña**. Las cuentas viven en la tabla `users` de la base de Faro (Postgres de Supabase). No hay registro ni recuperación por correo. La contraseña la define el dueño y Faro nunca la ve en claro: solo guarda su hash.

## Alcance
- **Tabla `users`** (migración 0012): `id`, `email` (minúsculas, único), `password_hash` (`scrypt$N$r$p$salt$hash`), `created_at`, `updated_at`, `last_login_at`.
  - Tiene **RLS activado y sin políticas**: la API REST de Supabase no puede leerla.
  - La conexión de Faro, como dueña de la tabla, sí puede.
- **`npm run auth:set-password`** (el único camino para crear o cambiar una cuenta):
  - pide el correo (por defecto `anayajoen@gmail.com`) y la contraseña dos veces sin mostrarla;
  - exige al menos 12 caracteres;
  - aplica las migraciones y guarda el hash en la base de `DATABASE_URL`.
- **`POST /api/auth/login`:**
  - busca el correo sin distinguir mayúsculas;
  - verifica con scrypt y `timingSafeEqual`, y si el correo no existe ejecuta scrypt igual, para no revelar por el tiempo de respuesta si la cuenta existe;
  - aplica el freno de intentos de F23;
  - guarda `last_login_at`;
  - emite la cookie `faro_session` (httpOnly, `secure` en producción, `sameSite=lax`, 7 días).
- **Sesión:** `base64url({uid, e, exp}).HMAC-SHA256`. Se firma con `AUTH_SECRET` (al menos 32 caracteres) o, si no existe, con una llave derivada de `APP_ACCESS_KEY`. Se verifica sin consultar la base.
- **`requireAppAccess`** acepta una sesión válida **o** el `x-app-key` de F23, que queda para scripts y llamadas por API.
- **Pantalla `/app/login`:** si existe al menos una cuenta, muestra correo + contraseña; si no, muestra el formulario de clave de antes, para que el despliegue nunca deje a nadie fuera.
- **Logout:** borra las dos cookies.

## No-alcance
Registro web, roles, recuperación por correo, 2FA, OAuth y Supabase Auth.

## Criterios de aceptación
1. Con el correo y la contraseña correctos se redirige a `next` con `faro_session`; con cualquier dato incorrecto, al mismo error genérico.
2. Una sesión adulterada, vencida o firmada con otra llave da 401.
3. La base solo guarda el hash scrypt con sal única, y la tabla tiene RLS.
4. Sin cuentas en `users`, el login con clave funciona igual que antes.
5. Cambiar la contraseña con el comando invalida la anterior.
