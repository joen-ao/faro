import { CircleCheck, CircleHelp, MessageCircle, TriangleAlert } from "lucide-react";
import { Attribution } from "@/components/attribution";
import { getEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { BENCHMARK_MIN_N, type Benchmark } from "@/features/diagnostic/benchmark";
import { whatsappHref } from "@/features/diagnostic/cta";
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
}

/**
 * Dapta widget: snippet comes ONLY from env (never from source data). It runs in a sandboxed iframe that keeps
 * allow-same-origin because the Dapta widget needs storage to open its chat; approved by Joen on 2026-10-17.
 * The doc loads the widget in embedded mode with autoOpen, so the chat is open on load (see features/diagnostic/widget.ts).
 */
function WidgetBlock({ snippet }: { snippet: string | undefined }) {
  if (!snippet) {
    return (
      <div data-testid="widget-placeholder" className="flex min-h-40 flex-col justify-center gap-2 rounded-card border border-dashed border-border bg-faro-surface-1 p-6">
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
      className="h-[600px] w-full rounded-card border border-border bg-faro-surface-1"
    />
  );
}

const STATUS: Record<FindingStatus, { label: string; Icon: typeof CircleCheck; tone: string; ring: string }> = {
  ok: { label: "Bien", Icon: CircleCheck, tone: "text-faro-accent", ring: "border-faro-accent/40 bg-faro-accent/10" },
  opportunity: { label: "Oportunidad", Icon: TriangleAlert, tone: "text-faro-warn", ring: "border-faro-warn/40 bg-faro-warn/10" },
  unknown: { label: "Sin revisar", Icon: CircleHelp, tone: "text-white", ring: "border-white/25 bg-white/5" },
};

function FindingCard({ f }: { f: Finding }) {
  const s = STATUS[f.status];
  return (
    <li data-testid="finding" data-status={f.status} className="flex flex-col gap-4 rounded-card border border-border bg-faro-surface-1 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", s.ring, s.tone)}>
          <s.Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
          {s.label}
        </span>
        {f.isExample && <span className="rounded-full bg-faro-surface-3 px-2 py-0.5 text-xs text-white">Ejemplo</span>}
      </div>
      <h3 className="text-pretty font-display text-xl font-semibold leading-snug">{f.title}</h3>
      <p className="text-pretty text-faro-text-2">
        <span className="font-semibold text-white">Por qué importa: </span>
        {f.why}
      </p>
      <p className="mt-auto rounded-button bg-faro-surface-2 p-4 text-pretty text-sm leading-relaxed text-white">
        <span className="block pb-1 text-xs font-semibold text-faro-accent">Recomendación</span>
        {f.recommendation}
      </p>
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
    </li>
  );
}

/** Opportunities first: what may be costing patients leads the page. */
const ORDER: Record<FindingStatus, number> = { opportunity: 0, unknown: 1, ok: 2 };

const pct = (v: number) => `${Math.round(v * 100).toLocaleString("es-CO")} %`;
const yesNo = (v: boolean | null) => (v === null ? "sin dato" : v ? "sí" : "no");

function BenchmarkBlock({ b }: { b: Benchmark }) {
  const who = b.city ? `Clínicas de ${b.city} revisadas` : "Clínicas revisadas en la misma búsqueda";
  return (
    <section aria-labelledby="comparacion" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 id="comparacion" className="text-2xl font-semibold sm:text-3xl">Usted frente a su competencia</h2>
        <p className="max-w-2xl text-pretty text-faro-text-2">
          Comparamos su sitio con los de otras clínicas que encontramos en la misma búsqueda pública. Solo mostramos totales, nunca nombres.
        </p>
      </div>
      <ul data-testid="benchmark" className="divide-y divide-border overflow-hidden rounded-card border border-border bg-faro-surface-1">
        {b.rows.map((r) => (
          <li key={r.key} data-testid={`bench-${r.key}`} className="grid gap-3 p-5 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center sm:gap-6 sm:px-6">
            <p className="font-display text-base font-semibold">{r.label}</p>
            <div className="flex flex-col gap-2">
              <p className="text-sm leading-relaxed">
                <span className="text-faro-text-2">Usted: </span>
                <span className={cn("font-semibold", r.you === true ? "text-faro-accent" : r.you === false ? "text-faro-warn" : "text-white")}>{yesNo(r.you)}</span>
                <span className="text-faro-text-3"> · </span>
                <span className="text-faro-text-2">{who}: </span>
                {r.pct === null ? (
                  <span className="text-white">aún no hay suficientes datos para comparar{r.n > 0 ? ` (n = ${r.n}, mínimo ${BENCHMARK_MIN_N})` : ""}</span>
                ) : (
                  <span className="font-semibold tabular-nums text-white">
                    {pct(r.pct)} <span className="font-normal text-faro-text-2">(n = {r.n})</span>
                  </span>
                )}
              </p>
              {r.pct !== null && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-faro-surface-3" role="img" aria-label={`${pct(r.pct)} de ${r.n} clínicas`}>
                  <div className="h-full rounded-full bg-white/70" style={{ width: `${Math.max(2, r.pct * 100)}%` }} />
                </div>
              )}
            </div>
          </li>
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
        "inline-flex min-h-14 items-center justify-center gap-2.5 rounded-button bg-faro-accent px-6 font-display text-lg font-semibold text-[var(--faro-accent-ink)] transition-[filter,transform] hover:brightness-110 active:translate-y-px",
        className,
      )}
    >
      <MessageCircle aria-hidden className="size-5" strokeWidth={2.25} />
      Hablar por WhatsApp
    </a>
  );
}

export function DiagnosticView({ slug, tracking, company, findings, benchmark, registry, icp, optOutHref }: ViewProps) {
  const env = getEnv();
  const product = env.NEXT_PUBLIC_PRODUCT_NAME;
  const isIcp = !!icp;
  const trackingProp = { c: tracking.c, s: tracking.s, utm: tracking.utm };
  const wa = whatsappHref(env.NEXT_PUBLIC_WHATSAPP_NUMBER, company?.name, slug);
  const opportunities = findings.filter((f) => f.status === "opportunity").length;
  const good = findings.filter((f) => f.status === "ok").length;

  return (
    <div className="relative isolate min-h-dvh overflow-x-clip">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]" style={{ background: "var(--faro-glow-violet)" }} />
      {!isIcp && <TrackOpen slug={slug} tracking={trackingProp} />}

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span aria-hidden className="size-2.5 rounded-full bg-faro-accent" />
          <span className="font-display">{product}</span>
          <span className="hidden font-normal text-faro-text-3 sm:inline">· proyecto del 30X Hackathon</span>
        </div>
        {optOutHref && (
          <a
            href={optOutHref}
            data-testid="optout-link"
            className="rounded-button border border-border px-4 py-2 text-sm text-faro-text-2 transition-colors hover:border-white/40 hover:text-white"
          >
            No me interesa
          </a>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-5 pb-16 pt-6 sm:px-8 sm:pt-12">
        <section className="flex flex-col gap-6">
          {(isIcp || company?.isDemo) && (
            <p className="flex flex-wrap items-center gap-2 text-sm text-faro-text-2">
              {isIcp && <span className="rounded-full border border-border px-3 py-1">{icp.audience}</span>}
              {company?.isDemo && (
                <span data-testid="demo-badge" className="rounded-full bg-faro-accent px-3 py-1 font-semibold text-[var(--faro-accent-ink)]">Ejemplo</span>
              )}
            </p>
          )}
          <h1 data-testid="diag-title" className="max-w-4xl text-balance font-display font-bold">
            {isIcp ? (
              <span className="block text-[2.5rem] leading-[1.05] sm:text-6xl">{icp.headline}</span>
            ) : (
              <>
                <span className="block text-lg font-semibold tracking-normal text-faro-text-2 sm:text-xl">Diagnóstico de captación de pacientes ·</span>
                <span className="mt-2 block text-[2.25rem] leading-[1.05] sm:text-6xl">{company?.name}</span>
              </>
            )}
          </h1>
          <p className="max-w-2xl text-pretty text-lg text-faro-text-2 sm:text-xl">
            {isIcp
              ? `${product} es un proyecto del 30X Hackathon que ayuda a clínicas a ver qué les cuesta pacientes nuevos y cómo arreglarlo. Aquí tiene cómo funciona.`
              : "Revisamos su presencia digital como lo haría un paciente nuevo: esto es lo que puede estar costándole citas y cómo arreglarlo, paso a paso."}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <WhatsAppButton href={wa} testId="whatsapp-cta-hero" className="w-full sm:w-auto" />
            {!isIcp && findings.length > 0 && (
              <p data-testid="diag-summary" className="text-sm text-faro-text-2">
                <span className="font-semibold text-faro-warn">{opportunities} {opportunities === 1 ? "oportunidad" : "oportunidades"}</span>
                {" · "}
                <span className="font-semibold text-faro-accent">{good} {good === 1 ? "punto a favor" : "puntos a favor"}</span>
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="hallazgos" className="flex flex-col gap-5">
          <h2 id="hallazgos" className="text-2xl font-semibold sm:text-3xl">{isIcp ? "Qué revisamos" : "Lo que encontramos en su presencia digital"}</h2>
          {isIcp ? (
            <ol className="grid gap-3 sm:grid-cols-3">
              {icp.points.map((p) => (
                <li key={p} className="rounded-card border border-border bg-faro-surface-1 p-5 text-faro-text-2">
                  {p}
                </li>
              ))}
            </ol>
          ) : (
            <ul data-testid="findings" className="grid gap-4 md:grid-cols-2">
              {[...findings].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map((f) => (
                <FindingCard key={f.id} f={f} />
              ))}
            </ul>
          )}
        </section>

        {!isIcp && benchmark && <BenchmarkBlock b={benchmark} />}

        {!isIcp && registry && (
          <p data-testid="why-we-wrote" className="-mt-6 max-w-3xl text-pretty text-sm text-faro-text-3">
            Por qué le escribimos: su empresa aparece en{" "}
            <a href={registry.url} target="_blank" rel="noopener noreferrer" className="text-faro-text-2 underline decoration-white/30 underline-offset-2 hover:text-white">
              {registry.label}
            </a>
            , una fuente pública de empresas.{registry.isExample ? " (Ejemplo)" : ""}
          </p>
        )}

        <section aria-labelledby="hablemos" className="flex flex-col gap-8 rounded-card border border-border bg-faro-surface-1 p-5 sm:p-8">
          <div className="flex flex-col gap-4">
            <h2 id="hablemos" className="text-balance text-2xl font-semibold sm:text-4xl">¿Le ayudamos a arreglarlo?</h2>
            <p className="max-w-2xl text-pretty text-faro-text-2">
              Escríbanos por WhatsApp y le decimos por dónde empezar con su clínica. Sin costo y sin compromiso.
            </p>
            <WhatsAppButton href={wa} testId="whatsapp-cta" className="min-h-16 w-full text-xl sm:w-auto sm:self-start sm:px-10" />
          </div>
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h3 className="font-display text-xl font-semibold">O pregúntele al asistente aquí mismo</h3>
              <p className="text-sm text-faro-text-2">Integrado con Dapta: responde sus dudas y deja su solicitud lista para el equipo.</p>
              <WidgetBlock snippet={env.DAPTA_WIDGET_SNIPPET} />
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="font-display text-xl font-semibold">O escríbanos como empresa</h3>
              <div className="rounded-card border border-border bg-faro-surface-2 p-5 sm:p-6">
                <ContactForm slug={slug} defaultCompany={company?.name} tracking={trackingProp} />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-faro-surface-1">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-10 text-sm text-faro-text-2 sm:px-8 md:grid-cols-3">
          <div data-testid="sender" className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold text-white">Quién le escribe</h2>
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
            <h2 className="text-base font-semibold text-white">Aviso de privacidad</h2>
            <p>
              Solo tratamos datos de empresas (nombre, correo genérico, mensaje) para responder su solicitud. Los datos de esta página vienen de fuentes públicas y del sitio web público de la empresa. Responsable: {env.SENDER_LEGAL_NAME ?? product}. Conforme a la Ley 1581 de 2012 puede conocer, corregir o pedir la supresión de sus datos en cualquier momento.
            </p>
          </div>
          {isIcp ? (
            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-semibold text-white">Sus datos</h2>
              <p>Esta página no guarda datos suyos hasta que envía el formulario. No le escribiremos si no lo envía.</p>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <h2 className="text-base font-semibold text-white">¿No le interesa?</h2>
              <p>No volveremos a escribirle. Es un clic.</p>
              {optOutHref ? (
                <a
                  href={optOutHref}
                  data-testid="optout-link-footer"
                  className="inline-flex h-12 items-center rounded-button border border-white/40 px-5 font-semibold text-white transition-colors hover:bg-white hover:text-black"
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
