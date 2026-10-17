import type { Metadata } from "next";
import { Attribution } from "@/components/attribution";
import { handleOptOut } from "@/features/compliance/handle";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Baja confirmada · Faro", robots: { index: false, follow: false } };

export default async function BajaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await handleOptOut(token);
  const ok = result.ok;

  return (
    <main className="relative isolate flex min-h-dvh flex-col justify-between overflow-hidden px-5 py-8 sm:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px]" style={{ background: "var(--faro-glow-violet)" }} />
      <header className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <span aria-hidden className="size-2.5 rounded-full bg-faro-accent" />
        <span className="font-display">Faro</span>
        <span className="text-faro-text-3 font-normal">· proyecto del 30X Hackathon</span>
      </header>

      <section aria-live="polite" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 py-12">
        <div
          aria-hidden
          className={`grid size-14 place-items-center rounded-full border text-2xl ${ok ? "border-faro-accent text-faro-accent" : "border-[var(--faro-danger)] text-[var(--faro-danger)]"}`}
        >
          {ok ? "✓" : "!"}
        </div>
        {ok ? (
          <>
            <h1 data-testid="optout-title" className="text-4xl font-bold leading-[1.05] sm:text-5xl">
              Listo. No volverás a recibir mensajes nuestros.
            </h1>
            <p className="text-lg text-faro-text-2">
              Registramos tu baja al instante. Tu contacto quedó en nuestra lista de supresión y no se usará de nuevo, para ninguna búsqueda.
            </p>
            <ul className="flex flex-col gap-2 rounded-card border border-border bg-faro-surface-1 p-5 text-sm text-faro-text-2">
              <li>No hace falta que respondas ni confirmes nada.</li>
              <li>No enviamos seguimientos automáticos.</li>
              <li>Si fue un error, escríbenos al correo del mensaje y lo revisamos.</li>
            </ul>
          </>
        ) : (
          <>
            <h1 data-testid="optout-title" className="text-4xl font-bold leading-[1.05] sm:text-5xl">
              Este enlace de baja no es válido.
            </h1>
            <p className="text-lg text-faro-text-2">
              No pudimos verificarlo, así que no se cambió nada. Responde al mensaje original pidiendo la baja y la procesamos de inmediato.
            </p>
          </>
        )}
      </section>

      <footer className="mx-auto w-full max-w-xl">
        <Attribution compact />
      </footer>
    </main>
  );
}
