const STEPS = [
  { n: "01", t: "Encontrar", d: "Empresas reales desde OpenStreetMap y registros públicos (RUES, REPS). Todo en un solo lugar, sin duplicados.", tag: "2+ fuentes gratuitas" },
  { n: "02", t: "Contactar", d: "Un primer mensaje por correo genérico de empresa, con remitente identificado, baja de un clic y ventanas horarias.", tag: "1 mensaje por empresa" },
  { n: "03", t: "Medir", d: "Cada centavo queda en un libro de costos. Ves el costo por lead (CPL) de cada fuente, con su recibo.", tag: "CPL por fuente" },
  { n: "04", t: "Calificar con Dapta", d: "Los leads pasan al agente de Dapta, que los califica. Comparas fuentes por costo y por calidad.", tag: "Costo por lead calificado" },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" aria-labelledby="how-title" className="scroll-mt-8 border-y border-faro-border bg-faro-surface-1">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <h2 id="how-title" className="max-w-2xl font-display text-3xl font-bold leading-tight sm:text-4xl">
          Cuatro pasos, una sola pregunta: ¿dónde me conviene buscar?
        </h2>
        <ol className="mt-14 grid gap-px overflow-hidden rounded-card border border-faro-border bg-[color:var(--faro-border)] md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-4 bg-black p-7 transition-colors hover:bg-faro-surface-2 motion-reduce:transition-none">
              <span className="font-display text-5xl font-bold text-faro-accent/90" aria-hidden>{s.n}</span>
              <h3 className="font-display text-xl font-semibold">{s.t}</h3>
              <p className="text-sm leading-relaxed text-faro-text-2">{s.d}</p>
              <span className="mt-auto w-fit rounded-full border border-faro-border px-2.5 py-1 text-xs text-faro-text-3">{s.tag}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
