# F30 · Login con correo y contraseña (sin registro)

**Prioridad:** P0. **Reemplaza en la pantalla:** el login con clave de equipo (F23).

## Objetivo
Entrar a `/app` con **correo y contraseña** de una sola cuenta autorizada (`anayajoen@gmail.com`), sin registro ni recuperación por correo. La contraseña la define el dueño y Faro nunca la ve en claro: solo guarda su hash.

## Alcance
- **Variables:**
  - `AUTH_EMAIL`: el correo autorizado.
  - `AUTH_PASSWORD_HASH`: scrypt con sal, formato `scrypt$N$r$p$salt$hash` en base64url.
  - `AUTH_SECRET`: al menos 32 caracteres; firma las sesiones.
- **Script `npm run auth:hash`:**
  - pide la contraseña dos veces sin mostrarla en pantalla;
  - exige al menos 12 caracteres;
  - imprime `AUTH_PASSWORD_HASH=…` y un `AUTH_SECRET` aleatorio, que el dueño pega en Vercel.
- **`POST /api/auth/login`** con `email` y `password`:
  - compara el correo sin distinguir mayúsculas y en tiempo constante;
  - verifica la contraseña con scrypt y `timingSafeEqual`;
  - aplica el mismo freno de intentos de F23 (10 cada 10 min por cliente);
  - si todo es válido, emite la cookie `faro_session` (httpOnly, `secure` en producción, `sameSite=lax`, 7 días).
- **Sesión:** `base64url({e, exp}).HMAC-SHA256(AUTH_SECRET)`. Expira a los 7 días, y si cambia `AUTH_SECRET` o `AUTH_EMAIL` todas las sesiones quedan inválidas.
- **`requireAppAccess`** acepta una sesión válida **o** el `x-app-key` de F23. Este último es para scripts y llamadas por API, no se muestra en la pantalla.
- **Pantalla `/app/login`:**
  - con `AUTH_EMAIL` y `AUTH_PASSWORD_HASH` configurados muestra correo + contraseña;
  - si faltan, muestra el formulario de clave anterior, para que el despliegue nunca deje a nadie fuera.
- **Logout:** borra las dos cookies.

## No-alcance
Registro, varios usuarios, recuperación de contraseña por correo, 2FA y OAuth.

## Criterios de aceptación
1. Con el correo y la contraseña correctos se redirige a `next` (o al tablero) con la cookie `faro_session`; con el correo o la contraseña incorrectos, al mismo error genérico.
2. Una sesión adulterada, vencida o firmada con otro secreto da 401 y redirige al login.
3. Nunca se guarda ni se registra la contraseña; el hash usa scrypt con sal única.
4. Sin las variables de F30, el login con clave sigue funcionando igual que antes.
5. El freno de intentos aplica también a este login.
