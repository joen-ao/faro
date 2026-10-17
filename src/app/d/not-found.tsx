export default function DiagnosticNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-5 px-5 py-12">
      <p className="font-display text-sm font-semibold text-faro-accent">404</p>
      <h1 data-testid="not-found-title" className="text-4xl font-bold leading-[1.05] sm:text-5xl">No encontramos esta página.</h1>
      <p className="text-lg text-faro-text-2">
        El enlace puede estar incompleto o ya no estar disponible. Si llegaste desde un correo, responde a ese mensaje y te ayudamos.
      </p>
    </main>
  );
}
