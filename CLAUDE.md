# CLAUDE.md — Faro (30X Hackathon · Reto Dapta)

Lee primero, en este orden: `SPEC.md` (qué construir), `LOOP.md` (cómo trabajar), `specs/STATUS.md` (dónde vamos), `HANDOFF.md`.

## Reglas rápidas
- Idioma: código y commits en inglés; UI, specs y documentación en español.
- Stack: Next.js App Router + TypeScript estricto + Tailwind + shadcn/ui + Drizzle (PGlite local, Postgres/Supabase en prod) + Zod + Vitest + Playwright + MapLibre.
- Todo servicio externo detrás de un adapter `types.ts` / `real.ts` / `mock.ts`, seleccionado por `<SERVICIO>_MODE`.
- Vistas: usar `/design`; tokens de estilo Dapta en `SPEC.md §10`.
- Video de la landing: `/hyperframes` (instalar con `npx skills add heygen-com/hyperframes` si falta).
- Nunca enviar mensajes reales, gastar dinero, hacer push ni deploy. `SEND_ENABLED=false`.
- Datos mock o demo siempre marcados y fuera de los totales reales.
- Comandos: `npm run dev`, `npm run check` (typecheck + lint + test + build), `npm run e2e:smoke`, `npm run coverage:sources`.
