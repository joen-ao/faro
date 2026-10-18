export default function Loading() {
  const block = "animate-pulse rounded-card bg-faro-surface-2";
  return (
    <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-8 sm:px-6 sm:pt-9" aria-busy="true" aria-label="Cargando tablero">
      <div className={`${block} h-12 w-2/3`} />
      <div className={`${block} mt-7 h-80 rounded-[20px]`} />
      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-32`} />
        ))}
      </div>
      <div className={`${block} mt-4 h-72`} />
      <span className="sr-only">Cargando tablero…</span>
    </main>
  );
}
