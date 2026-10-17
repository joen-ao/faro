export default function Loading() {
  const block = "animate-pulse rounded-card bg-faro-surface-2";
  return (
    <main className="mx-auto max-w-[1240px] px-4 py-8 sm:px-8 sm:py-12" aria-busy="true" aria-label="Cargando tablero">
      <div className={`${block} h-12 w-2/3`} />
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${block} h-32`} />
        ))}
      </div>
      <div className={`${block} mt-4 h-24`} />
      <div className={`${block} mt-4 h-72`} />
      <span className="sr-only">Cargando tablero…</span>
    </main>
  );
}
