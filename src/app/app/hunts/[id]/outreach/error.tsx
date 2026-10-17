"use client";

export default function OutreachError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main role="alert" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-5">
      <h1 className="text-3xl font-bold">No pudimos cargar el contacto</h1>
      <p className="text-faro-text-2">Hubo un error leyendo la búsqueda. No se envió ni cambió nada. Intenta de nuevo.</p>
      <button
        type="button"
        onClick={reset}
        className="h-10 w-fit rounded-button bg-faro-accent px-4 text-sm font-semibold text-[var(--faro-accent-ink)]"
      >
        Reintentar
      </button>
    </main>
  );
}
