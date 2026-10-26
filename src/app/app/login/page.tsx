import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FaroWordmark } from "@/components/faro-wordmark";
import { safeNext } from "@/lib/login";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar · Faro", robots: { index: false } };

const ERRORS: Record<string, string> = {
  "1": "La clave no es correcta. Revísala e inténtalo de nuevo.",
  rate: "Demasiados intentos. Espera unos minutos antes de volver a intentar.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const message = error ? (ERRORS[error] ?? ERRORS["1"]) : null;

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center px-4 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" style={{ background: "var(--faro-glow-violet)" }} />
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex rounded-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
          <FaroWordmark />
        </Link>
        <h1 className="mt-8 text-3xl font-bold leading-tight" style={{ fontFamily: "var(--font-poppins)", letterSpacing: "-0.02em" }}>
          Entra al panel del equipo
        </h1>
        <p className="mt-2 text-faro-text-2">Búsquedas, contacto y tablero de CPL son internos. Entra con la clave de acceso del equipo.</p>

        <form method="post" action="/api/auth/login" className="mt-8 space-y-4 rounded-card border border-border bg-faro-surface-1 p-5">
          <input type="hidden" name="next" value={safeNext(next)} />
          <div className="space-y-2">
            <label htmlFor="key" className="block text-sm font-medium">
              Clave de acceso
            </label>
            <input
              id="key"
              name="key"
              type="password"
              required
              autoComplete="current-password"
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? "login-error" : undefined}
              className="h-11 w-full rounded-button border border-border bg-black px-3 text-white outline-none placeholder:text-faro-text-3 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
          {message ? (
            <p id="login-error" role="alert" className="text-sm text-[#ff8a8a]">
              {message}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="w-full">
            Entrar
          </Button>
        </form>
        <p className="mt-4 text-sm text-faro-text-3">
          ¿Buscas la página pública? <Link href="/" className="text-white underline underline-offset-4 hover:text-primary">Volver al inicio</Link>
        </p>
      </div>
    </main>
  );
}
