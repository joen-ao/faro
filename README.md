# Faro

Faro ayuda a una pyme a encontrar sus próximos clientes en fuentes abiertas, contactarlos respetando reglas de cumplimiento y medir cuánto cuesta cada lead por fuente y canal. Proyecto del 30X Hackathon (Reto Dapta). Especificación completa en `SPEC.md`.

## Cómo correr

```bash
npm i
cp .env.example .env.local   # sin llaves todo corre en modo mock/demo
npm run dev                  # http://localhost:3000
npm run check                # typecheck + lint + test + build
npm run e2e:smoke            # Playwright; capturas en artifacts/screens/
```

Sin `DATABASE_URL` la base es PGlite local en `./.pglite`. `SEND_ENABLED=false` por defecto: no se envía ningún mensaje real. `GET /api/health` muestra el modo (real/mock) de cada integración, sin secretos.

La primera vez, `npx playwright install chromium`.

## Atribuciones y licencias de datos

- Datos de mapas y establecimientos: © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), licencia ODbL.
- Registros públicos de Colombia (RUES, REPS): [datos.gov.co](https://www.datos.gov.co), licencia CC BY-SA 4.0.
