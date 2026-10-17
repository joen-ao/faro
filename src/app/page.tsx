import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  { n: "01", t: "Encontrar", d: "Empresas reales desde fuentes abiertas y registros públicos." },
  { n: "02", t: "Contactar", d: "Solo canales genéricos y con reglas de cumplimiento." },
  { n: "03", t: "Medir", d: "Cada dólar trazado hasta el costo por lead." },
  { n: "04", t: "Calificar", d: "Con Dapta, el lead llega listo para vender." },
];

export default function Home() {
  return (
    <main className="relative isolate mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-12 overflow-hidden px-6 py-16">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px]" style={{ background: "var(--faro-glow-violet)" }} />
      <section className="flex flex-col items-start gap-6">
        <Badge>Scaffold F00 · en construcción</Badge>
        <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] sm:text-6xl">
          ¿Dónde están tus próximos clientes y cuánto te cuestan?
        </h1>
        <p className="max-w-xl text-lg text-faro-text-2">
          Faro busca empresas, las contacta con respeto y te dice qué fuente rinde más por cada peso invertido.
        </p>
        <Button size="lg">Encontrar mis clientes</Button>
      </section>
      <section aria-label="Cómo funciona" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s) => (
          <Card key={s.n}>
            <CardHeader>
              <span className="font-display text-sm text-faro-accent">{s.n}</span>
              <CardTitle>{s.t}</CardTitle>
              <CardDescription>{s.d}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </main>
  );
}
