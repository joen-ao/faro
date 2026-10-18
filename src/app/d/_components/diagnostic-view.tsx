import { ChevronDown, CircleCheck, CircleHelp, MessageCircle, TriangleAlert } from "lucide-react";
import { Attribution } from "@/components/attribution";
import { getEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { BENCHMARK_MIN_N, type Benchmark, type BenchmarkRow } from "@/features/diagnostic/benchmark";
import { whatsappDisplay, whatsappHref } from "@/features/diagnostic/cta";
import type { Finding, FindingStatus, RegistryNote } from "@/features/diagnostic/findings";
import type { Tracking } from "@/features/diagnostic/params";
import { buildWidgetDoc } from "@/features/diagnostic/widget";
import { ContactForm } from "./contact-form";
import { TrackOpen } from "./track-open";

export interface ViewProps {
  /** Page identity for tracking and the form: lead slug, or `icp:<icpSlug>`. */
  slug: string;
  tracking: Tracking;
  /** Present on lead pages only. */
  company?: { name: string; isDemo: boolean };
  findings: Finding[];
  /** Lead pages: aggregate comparison with peers of the same search. */
  benchmark?: Benchmark;
  /** Lead pages: public registry where the company appears ("why we wrote"). */
  registry?: RegistryNote | null;
  /** Generic ICP variant content. */
  icp?: { audience: string; headline: string; points: string[] };
  optOutHref: string | null;
  /** Lead pages with services: "Cómo le ayudamos" per finding id and the recommended service for the final block. */
  offer?: { help: Record<string, string>; service: { name: string; outcome: string; entryOffer: string | null } };
}

/**
 * Dapta widget: snippet comes ONLY from env (never from source data). It runs in a sandboxed iframe that keeps
 * allow-same-origin because the Dapta widget needs storage to open its chat; approved by Joen on 2026-10-17.
 * The doc loads the widget in embedded mode with autoOpen, so the chat is open on load (see features/diagnostic/widget.ts).
 */
function WidgetBlock({ snippet }: { snippet: string | undefined }) {
  if (!snippet) {
    return (
      <div data-testid="widget-placeholder" className="flex min-h-72 flex-col justify-center gap-2 rounded-card border border-dashed border-border bg-faro-surface-2 p-6">
        <p className="font-display text-lg font-semibold">Asistente de Dapta</p>
        <p className="text-faro-text-2">Asistente de Dapta (no configurado en este entorno). Mientras tanto, escríbanos por WhatsApp o déjenos su mensaje en el formulario.</p>
      </div>
    );
  }
  return (
    <iframe
      data-testid="dapta-widget"
      title="Chat con el asistente de Dapta"
      sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
      srcDoc={buildWidgetDoc(snippet)}
      className="h-[560px] w-full rounded-card border border-border bg-faro-surface-1"
    />
  );
}

const STATUS: Record<FindingStatus, { label: string; Icon: typeof CircleCheck; pill: string }> = {
  ok: { label: "A favor", Icon: CircleCheck, pill: "bg-faro-accent/12 text-faro-accent" },
  opportunity: { label: "Oportunidad", Icon: TriangleAlert, pill: "bg-faro-warn/14 text-faro-warn" },
  unknown: { label: "Sin revisar", Icon: CircleHelp, pill: "bg-white/8 text-white" },
};

function StatusPill({ f }: { f: Finding }) {
  const s = STATUS[f.status];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", s.pill)}>
        <s.Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
        {s.label}
      </span>
      {f.isExample && <span className="rounded-full bg-faro-surface-3 px-2 py-0.5 text-xs text-white">Ejemplo</span>}
    </div>
  );
}

function SourceLine({ f }: { f: Finding }) {
  return (
    <p className="text-xs text-faro-text-3">
      {f.sourceUrl ? (
        <>
          Visto en:{" "}
          <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-white/30 underline-offset-2 hover:text-white">
            {f.sourceLabel}
          </a>
        </>
      ) : (
        <>Revisado en: {f.sourceLabel}</>
      )}
    </p>
  );
}

/** Opportunity: highlighted card with the recommendation beside it (stacked on mobile). */
function OpportunityCard({ f, help }: { f: Finding; help?: string }) {
  return (
    <li data-testid="finding" data-status={f.status} className="grid gap-5 rounded-card border border-faro-warn/45 bg-faro-surface-1 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-3">
        <StatusPill f={f} />
        <h3 className="text-pretty text-xl font-semibold leading-snug sm:text-[1.375rem]">{f.title}</h3>
        <p className="text-pretty leading-relaxed text-faro-text-2">
          <span className="font-semibold text-white">Por qué importa: </span>
          {f.why}
        </p>
        <SourceLine f={f} />
      </div>
      <div className="self-start rounded-button bg-faro-surface-2 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-faro-accent">Recomendación</p>
        <p className="mt-2 text-pretty leading-relaxed text-white">{f.recommendation}</p>
        {help && (
          <div data-testid="how-we-help" className="mt-4 border-t border-white/10 pt-4">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-faro-text-2">Cómo le ayudamos</p>
            <p className="mt-2 text-pretty text-sm leading-relaxed text-white/85">{help}</p>
          </div>
        )}
      </div>
    </li>
  );
}

/** Point in favour (or not reviewed): compact card in the grid. */
function GridCard({ f, help }: { f: Finding; help?: string }) {
  return (
    <li data-testid="finding" data-status={f.status} className="flex flex-col gap-3 rounded-card border border-white/10 bg-faro-surface-1 p-5 sm:p-6">
      <StatusPill f={f} />
      <h3 className="text-pretty text-lg font-semibold leading-snug">{f.title}</h3>
      <p className="text-pretty text-sm leading-relaxed text-faro-text-2">
        <span className="font-semibold text-white">Por qué importa: </span>
        {f.why}
      </p>
      <p className="text-pretty text-sm leading-relaxed text-white">
        <span className="font-semibold text-faro-accent">Recomendación: </span>
        {f.recommendation}
      </p>
      {help && (
        <p data-testid="how-we-help" className="text-pretty text-sm leading-relaxed text-white/85">
          <span className="font-semibold text-white">Cómo le ayudamos: </span>
          {help}
        </p>
      )}
      <div className="mt-auto pt-1">
        <SourceLine f={f} />
      </div>
    </li>
  );
}

/** Opportunities first: what may be costing patients leads the page. */
const ORDER: Record<FindingStatus, number> = { opportunity: 0, unknown: 1, ok: 2 };

const pct = (v: number) => `${Math.round(v * 100).toLocaleString("es-CO")} %`;

const YOU: Record<"yes" | "no" | "na", { text: string; cls: string }> = {
  yes: { text: "Usted: sí", cls: "bg-faro-accent/14 text-faro-accent" },
  no: { text: "Usted: no", cls: "bg-faro-warn/14 text-faro-warn" },
  na: { text: "Sin dato", cls: "bg-faro-surface-2 text-faro-text-3" },
};

function BenchRow({ r }: { r: BenchmarkRow }) {
  const you = YOU[r.you === null ? "na" : r.you ? "yes" : "no"];
  return (
    <li
      data-testid={`bench-${r.key}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-5 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4.5rem_6.5rem] md:gap-x-6"
    >
      <p className="font-medium">{r.label}</p>
      <span className={cn("justify-self-end rounded-full px-3 py-1 text-center text-[0.8125rem] font-bold md:order-last md:w-full", you.cls)}>{you.text}</span>
      {r.pct === null ? (
        <p className="col-span-2 text-sm text-faro-text-2 md:col-span-2">
          Aún no hay suficientes datos para comparar{r.n > 0 ? ` (n = ${r.n}, mínimo ${BENCHMARK_MIN_N})` : ""}
        </p>
      ) : (
        <>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-faro-surface-2" role="img" aria-label={`${pct(r.pct)} de ${r.n} clínicas`}>
            <div className="h-full rounded-full bg-white/45" style={{ width: `${Math.max(2, r.pct * 100)}%` }} />
          </div>
          <p className="text-right tabular-nums">
            {pct(r.pct)} <span className="block text-xs text-faro-text-3">n = {r.n}</span>
          </p>
        </>
      )}
    </li>
  );
}

function BenchmarkBlock({ b }: { b: Benchmark }) {
  const peers = Math.max(0, ...b.rows.map((r) => r.n));
  const title =
    peers >= BENCHMARK_MIN_N ? `Usted frente a ${peers} clínicas${b.city ? ` de ${b.city}` : ""}` : "Usted frente a su competencia";
  return (
    <section aria-labelledby="comparacion" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 id="comparacion" className="text-2xl font-semibold sm:text-[1.75rem]">{title}</h2>
        <p className="max-w-2xl text-pretty text-faro-text-3">
          Comparamos su sitio con los de otras clínicas de la misma búsqueda pública. Solo mostramos totales, nunca nombres.
        </p>
      </div>
      <ul data-testid="benchmark" className="divide-y divide-white/8 rounded-card border border-white/10 bg-faro-surface-1 px-5 sm:px-6">
        {b.rows.map((r) => (
          <BenchRow key={r.key} r={r} />
        ))}
      </ul>
    </section>
  );
}

function WhatsAppButton({ href, testId, className }: { href: string; testId: string; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      className={cn(
        "inline-flex min-h-14 items-center justify-center gap-2.5 rounded-button bg-faro-accent px-6 text-base font-bold text-[var(--faro-accent-ink)] transition-[filter,transform] hover:brightness-110 active:translate-y-px",
        className,
      )}
    >
      <MessageCircle aria-hidden className="size-5" strokeWidth={2.25} />
      Hablar por WhatsApp
    </a>
  );
}

export function DiagnosticView({ slug, tracking, company, findings, benchmark, registry, icp, optOutHref, offer }: ViewProps) {
  const env = getEnv();
  const product = env.NEXT_PUBLIC_PRODUCT_NAME;
  const isIcp = !!icp;
  const trackingProp = { c: tracking.c, s: tracking.s, utm: tracking.utm };
  const wa = whatsappHref(env.NEXT_PUBLIC_WHATSAPP_NUMBER, company?.name, slug);
  const sorted = [...findings].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const opportunityCards = sorted.filter((f) => f.status === "opportunity");
  const gridCards = sorted.filter((f) => f.status !== "opportunity");
  const opportunities = opportunityCards.length;
  const good = findings.filter((f) => f.status === "ok").length;

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px]" style={{ background: "var(--faro-glow-violet)" }} />
      {!isIcp && <TrackOpen slug={slug} tracking={trackingProp} />}

      <header className="mx-auto flex w-full max-w-[1080px] items-center justify-between gap-3 px-5 py-4">
        <p className="flex items-center gap-2.5 text-sm text-faro-text-2">
          <span aria-hidden className="size-2.5 rounded-full bg-faro-accent" />
          <strong className="font-display text-white">{product}</strong>
          <span className="hidden sm:inline">· proyecto del 30X Hackathon</span>
        </p>
        {optOutHref && (
          <a
            href={optOutHref}
            data-testid="optout-link"
            className="inline-flex h-10 items-center rounded-button border border-border px-3.5 text-sm text-white/75 transition-colors hover:border-white/40 hover:text-white"
          >
            No me interesa
          </a>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-14 px-5 pb-12 sm:gap-16">
        <section className="flex flex-wrap items-end gap-8 pt-8 sm:pt-12 lg:gap-10">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-5">
            {(isIcp || company?.isDemo) && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-faro-text-2">
                {isIcp && <span className="rounded-full border border-border px-3 py-1">{icp.audience}</span>}
                {company?.isDemo && (
                  <span data-testid="demo-badge" className="rounded-full bg-faro-accent px-3 py-1 font-semibold text-[var(--faro-accent-ink)]">Ejemplo</span>
                )}
              </p>
            )}
            <h1 data-testid="diag-title" className="text-balance font-bold">
              {isIcp ? (
                <span className="block text-[2.25rem] leading-[1.05] tracking-[-0.035em] sm:text-[3.5rem]">{icp.headline}</span>
              ) : (
                <>
                  <span className="block font-sans text-[0.8125rem] font-medium uppercase tracking-[0.2em] text-faro-accent">
                    Diagnóstico de captación de pacientes<span className="sr-only"> ·</span>
                  </span>
                  <span className="mt-4 block text-[2.25rem] leading-[1.04] tracking-[-0.035em] sm:text-[3.75rem]">{company?.name}</span>
                </>
              )}
            </h1>
            <p className="max-w-[35rem] text-pretty text-lg leading-relaxed text-white/70">
              {isIcp
                ? `${product} es un proyecto del 30X Hackathon que ayuda a clínicas a ver qué les cuesta pacientes nuevos y cómo arreglarlo. Aquí tiene cómo funciona.`
                : "Revisamos su presencia digital como lo haría un paciente nuevo: esto es lo que puede estar costándole citas y cómo arreglarlo, paso a paso."}
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
              <WhatsAppButton href={wa} testId="whatsapp-cta-hero" className="w-full sm:w-auto" />
              <a href="#hallazgos" className="text-center text-[0.9375rem] text-white/75 underline decoration-white/30 underline-offset-4 hover:text-white">
                {isIcp ? "Ver cómo funciona ↓" : "Ver el diagnóstico ↓"}
              </a>
            </div>
          </div>
          {!isIcp && findings.length > 0 && (
            <div data-testid="diag-summary" className="flex w-full flex-col gap-3.5 rounded-card border border-white/12 bg-faro-surface-1 p-5 sm:w-auto sm:flex-[0_1_300px]">
              <p className="text-[0.8125rem] text-faro-text-3">Resumen</p>
              <div className="flex gap-3">
                <p className="flex-1 rounded-xl bg-faro-warn/10 p-3.5">
                  <span className="block font-display text-[2.125rem] font-bold leading-tight text-faro-warn">{opportunities}</span>
                  <span className="text-[0.8125rem] text-white/70">{opportunities === 1 ? "oportunidad" : "oportunidades"}</span>
                </p>
                <p className="flex-1 rounded-xl bg-faro-accent/10 p-3.5">
                  <span className="block font-display text-[2.125rem] font-bold leading-tight text-faro-accent">{good}</span>
                  <span className="text-[0.8125rem] text-white/70">{good === 1 ? "punto a favor" : "puntos a favor"}</span>
                </p>
              </div>
              <p className="text-[0.8125rem] leading-normal text-faro-text-3">Solo datos públicos de su empresa y de su sitio web.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="hallazgos" className="flex scroll-mt-6 flex-col gap-5">
          <h2 id="hallazgos" className="text-2xl font-semibold sm:text-[1.75rem]">{isIcp ? "Qué revisamos" : "Lo que encontramos"}</h2>
          {isIcp ? (
            <ol className="grid gap-3.5 sm:grid-cols-3">
              {icp.points.map((p) => (
                <li key={p} className="rounded-card border border-white/10 bg-faro-surface-1 p-5 text-faro-text-2">
                  {p}
                </li>
              ))}
            </ol>
          ) : (
            <div data-testid="findings" className="flex flex-col gap-3.5">
              {opportunityCards.length > 0 && (
                <ul aria-label="Oportunidades" className="flex flex-col gap-3.5">
                  {opportunityCards.map((f) => (
                    <OpportunityCard key={f.id} f={f} help={offer?.help[f.id]} />
                  ))}
                </ul>
              )}
              {gridCards.length > 0 && (
                <ul aria-label="Puntos a favor y pendientes" className="grid gap-3.5 md:grid-cols-[repeat(auto-fit,minmax(300px,1fr))]">
                  {gridCards.map((f) => (
                    <GridCard key={f.id} f={f} help={offer?.help[f.id]} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {!isIcp && benchmark && <BenchmarkBlock b={benchmark} />}

        <section
          id="hablar"
          aria-labelledby="hablemos"
          className="grid gap-8 rounded-[24px] border border-faro-accent/30 p-5 sm:p-9 lg:grid-cols-2 lg:gap-9"
          style={{ background: "linear-gradient(90deg, rgba(203,232,80,0.12) 0%, rgba(0,0,0,0) 80%), var(--faro-surface-1)" }}
        >
          <div className="flex min-w-0 flex-col gap-4">
            <h2 id="hablemos" className="text-balance text-[1.75rem] font-bold leading-[1.1] tracking-[-0.03em] sm:text-4xl">
              ¿Le ayudamos a conseguir más pacientes?
            </h2>
            {offer && !isIcp ? (
              <div data-testid="offer-cta" className="flex max-w-xl flex-col gap-2">
                <p className="text-pretty leading-relaxed text-white">
                  <span className="font-semibold">{offer.service.name}.</span> <span className="text-white/75">{offer.service.outcome}</span>
                </p>
                <p className="text-pretty leading-relaxed text-white/70">
                  {offer.service.entryOffer ? `Para empezar: ${offer.service.entryOffer} ` : ""}Escríbanos por WhatsApp y le decimos por dónde empezar. Sin compromiso.
                </p>
              </div>
            ) : (
              <p className="max-w-xl text-pretty leading-relaxed text-white/70">
                Escríbanos por WhatsApp y le decimos por dónde empezar con su clínica. Sin costo y sin compromiso.
              </p>
            )}
            <WhatsAppButton href={wa} testId="whatsapp-cta" className="w-full sm:w-auto sm:self-start" />
            <p className="text-[0.8125rem] text-faro-text-3">
              {whatsappDisplay(env.NEXT_PUBLIC_WHATSAPP_NUMBER)} · responde el asistente de {product}, integrado con Dapta
            </p>
            <details data-testid="contact-details" open={isIcp} className="group mt-2 border-t border-white/10 pt-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-button text-white/85 hover:text-white [&::-webkit-details-marker]:hidden">
                Prefiero dejar un mensaje como empresa
                <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-4 rounded-card border border-border bg-faro-surface-2 p-5 sm:p-6">
                <ContactForm slug={slug} defaultCompany={company?.name} tracking={trackingProp} />
              </div>
            </details>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <p className="text-sm text-faro-text-2">O pregúntele al asistente aquí mismo: responde sus dudas y deja su solicitud lista para el equipo.</p>
            <WidgetBlock snippet={env.DAPTA_WIDGET_SNIPPET} />
          </div>
        </section>

        {!isIcp && registry && (
          <p data-testid="why-we-wrote" className="-mt-6 rounded-xl border border-white/10 px-5 py-4 text-pretty text-sm leading-relaxed text-faro-text-3">
            <strong className="text-white/80">Por qué le escribimos:</strong> su empresa aparece en{" "}
            <a href={registry.url} target="_blank" rel="noopener noreferrer" className="text-white/80 underline decoration-white/30 underline-offset-2 hover:text-white">
              {registry.label}
            </a>
            , una fuente pública de empresas.{registry.isExample ? " (Ejemplo)" : ""}
          </p>
        )}
      </main>

      <footer id="baja" className="border-t border-white/8">
        <div className="mx-auto grid w-full max-w-[1080px] gap-7 px-5 py-9 text-sm leading-relaxed text-faro-text-3 md:grid-cols-3 md:gap-12">
          <div data-testid="sender" className="flex flex-col gap-1.5">
            <h2 className="font-sans text-sm font-bold tracking-normal text-white">Quién le escribe</h2>
            <p>{product} — proyecto del 30X Hackathon.</p>
            {env.SENDER_LEGAL_NAME && <p>{env.SENDER_LEGAL_NAME}</p>}
            {env.SENDER_ADDRESS && <p>{env.SENDER_ADDRESS}</p>}
            {env.EMAIL_REPLY_TO && (
              <p>
                Responda a:{" "}
                <a href={`mailto:${env.EMAIL_REPLY_TO}`} data-testid="reply-to" className="text-white underline underline-offset-2">{env.EMAIL_REPLY_TO}</a>
              </p>
            )}
          </div>
          <div id="privacidad" className="flex scroll-mt-6 flex-col gap-1.5">
            <h2 className="font-sans text-sm font-bold tracking-normal text-white">Aviso de privacidad</h2>
            <p>
              Solo tratamos datos de empresas (nombre, correo genérico, mensaje) para responder su solicitud. Los datos de esta página vienen de fuentes públicas y del sitio web público de la empresa. Responsable: {env.SENDER_LEGAL_NAME ?? product}. Conforme a la Ley 1581 de 2012 puede conocer, corregir o pedir la supresión de sus datos en cualquier momento.
            </p>
          </div>
          {isIcp ? (
            <div className="flex flex-col gap-1.5">
              <h2 className="font-sans text-sm font-bold tracking-normal text-white">Sus datos</h2>
              <p>Esta página no guarda datos suyos hasta que envía el formulario. No le escribiremos si no lo envía.</p>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2.5">
              <h2 className="font-sans text-sm font-bold tracking-normal text-white">¿No le interesa?</h2>
              <p>No volveremos a escribirle. Es un clic.</p>
              {optOutHref ? (
                <a
                  href={optOutHref}
                  data-testid="optout-link-footer"
                  className="inline-flex h-11 items-center rounded-button border border-white/20 px-4 text-white transition-colors hover:bg-white hover:text-black"
                >
                  No me interesa / darme de baja
                </a>
              ) : (
                <p>Para darse de baja, responda al mensaje original y lo procesamos de inmediato.</p>
              )}
            </div>
          )}
          <Attribution className="md:col-span-3" />
        </div>
      </footer>
    </div>
  );
}
