export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Cargando contacto" className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-8">
      <div className="h-8 w-64 animate-pulse rounded-button bg-faro-surface-2" />
      <div className="h-14 animate-pulse rounded-card bg-faro-surface-1" />
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-card bg-faro-surface-1" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-card bg-faro-surface-1" />
      </div>
    </main>
  );
}
