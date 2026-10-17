export function DemoVideo() {
  return (
    <section id="demo" aria-labelledby="demo-title" className="mx-auto max-w-6xl scroll-mt-8 px-6 py-24">
      <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <h2 id="demo-title" className="max-w-xl font-display text-3xl font-bold leading-tight sm:text-4xl">
          De una frase a un tablero de costos, en 30 segundos
        </h2>
        <p className="max-w-sm text-faro-text-2">
          Una frase describe a tu cliente, aparecen empresas reales en el mapa, se contactan con reglas claras y el tablero compara el costo por fuente.
        </p>
      </div>
      <figure className="relative">
        <div aria-hidden className="absolute -inset-px rounded-[20px] opacity-60" style={{ background: "linear-gradient(135deg, #cbe850 0%, rgba(203,232,80,0) 35%, rgba(124,58,237,0.5) 100%)" }} />
        <video
          className="relative aspect-video w-full rounded-card bg-faro-surface-1"
          controls
          muted
          playsInline
          preload="none"
          poster="/demo/poster.jpg"
          width={1280}
          height={720}
          aria-describedby="demo-caption"
        >
          <source src="/demo/faro-demo.mp4" type="video/mp4" />
          Tu navegador no reproduce video. Descarga la demostración en /demo/faro-demo.mp4.
        </video>
        <figcaption id="demo-caption" className="mt-4 text-sm text-faro-text-3">
          Demostración con datos de ejemplo: las cifras del video son ilustrativas. Los números reales del evento están más abajo.
        </figcaption>
      </figure>
    </section>
  );
}
