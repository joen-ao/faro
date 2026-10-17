"use client";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6" role="alert">
      <h1 className="text-2xl font-bold">No pudimos cargar el tablero</h1>
      <p className="mt-2 text-faro-text-2">Falló la lectura de la base de datos. Tus datos no cambiaron. Reintenta; si sigue fallando revisa DATABASE_URL o corre npm run db:migrate.</p>
      <button type="button" onClick={reset} className="mt-6 min-h-11 self-start rounded-button bg-faro-accent px-5 text-sm font-semibold text-[#1a1a1c]">
        Reintentar
      </button>
    </main>
  );
}
