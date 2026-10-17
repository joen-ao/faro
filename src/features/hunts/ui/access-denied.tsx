export function AccessDenied({ title = "Acceso restringido", body = "Esta vista es interna. Entra con la clave de acceso del equipo (cookie faro_key)." }: { title?: string; body?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 bg-black px-6 text-white">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-faro-text-2">{body}</p>
    </main>
  );
}
