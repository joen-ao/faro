import { Attribution } from "@/components/attribution";
import { getEnv } from "@/lib/env";
import type { Finding } from "@/features/diagnostic/findings";
import type { Tracking } from "@/features/diagnostic/params";
import { ContactForm } from "./contact-form";
import { TrackOpen } from "./track-open";

export interface ViewProps {
  /** Page identity for tracking and the form: lead slug, or `icp:<icpSlug>`. */
  slug: string;
  tracking: Tracking;
  /** Present on lead pages only. */
  company?: { name: string; isDemo: boolean };
  findings: Finding[];
  /** Generic ICP variant content. */
  icp?: { audience: string; headline: string; points: string[] };
  optOutHref: string | null;
}

/** Dapta widget: snippet comes ONLY from env and runs in a sandboxed iframe without same-origin access. */
function WidgetBlock({ snippet }: { snippet: string | undefined }) {
  if (!snippet) {
    return (
      <div data-testid="widget-placeholder" className="flex min-h-40 flex-col justify-center gap-2 rounded-card border border-dashed border-border bg-faro-surface-1 p-6">
        <p className="font-display text-lg font-semibold">Asistente de Dapta</p>
        <p className="text-faro-text-2">Asistente de Dapta (no configurado en este entorno). Mientras tanto, déjanos tu mensaje en el formulario y te respondemos.</p>
      </div>
    );
  }
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#0f0f0f;color:#fff;font-family:system-ui,sans-serif}</style></head><body>${snippet}</body></html>`;
  return (
    <iframe
      data-testid="dapta-widget"
      title="Asistente de Dapta"
      sandbox="allow-scripts allow-forms allow-popups"
      referrerPolicy="no-referrer"
      loading="lazy"
      srcDoc={doc}
      className="h-[560px] w-full rounded-card border border-border bg-faro-surface-1"
    />
  );
}

export function DiagnosticView({ slug, tracking, company, findings, icp, optOutHref }: ViewProps) {
  const env = getEnv();
  const product = env.NEXT_PUBLIC_PRODUCT_NAME;
  const isIcp = !!icp;
  const trackingProp = { c: tracking.c, s: tracking.s, utm: tracking.utm };

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

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-14 px-5 pb-16 pt-6 sm:px-8 sm:pt-12">
        <section className="flex flex-col gap-5">
          <p className="flex flex-wrap items-center gap-2 text-sm text-faro-text-2">
            <span className="rounded-full border border-border px-3 py-1">{isIcp ? icp.audience : "Diagnóstico público"}</span>
            {company?.isDemo && (
              <span data-testid="demo-badge" className="rounded-full bg-faro-accent px-3 py-1 font-semibold text-[var(--faro-accent-ink)]">Ejemplo</span>
            )}
          </p>
          <h1 data-testid="diag-title" className="max-w-3xl text-balance font-display text-[2.5rem] font-bold leading-[1.05] sm:text-6xl">
            {isIcp ? icp.headline : company?.name}
          </h1>
          <p className="max-w-2xl text-pretty text-lg text-faro-text-2">
            {isIcp
              ? `${product} es un proyecto del 30X Hackathon que ayuda a empresas a ver cómo las encuentran sus clientes. Aquí tienes cómo funciona.`
              : "Esto es lo que cualquier persona puede ver de tu empresa en fuentes públicas. Sin datos de personas, con la fuente de cada dato para que lo verifiques."}
          </p>
        </section>

        <section aria-labelledby="hallazgos" className="flex flex-col gap-5">
          <h2 id="hallazgos" className="text-2xl font-semibold sm:text-3xl">{isIcp ? "Qué revisamos" : "Lo que encontramos"}</h2>
          {isIcp ? (
            <ol className="grid gap-3 sm:grid-cols-3">
              {icp.points.map((p, i) => (
                <li key={p} className="flex flex-col gap-4 rounded-card border border-border bg-faro-surface-1 p-5">
                  <span className="font-display text-sm font-semibold text-faro-accent">0{i + 1}</span>
                  <span className="text-faro-text-2">{p}</span>
                </li>
              ))}
            </ol>
          ) : findings.length === 0 ? (
            <div data-testid="no-findings" className="rounded-card border border-dashed border-border bg-faro-surface-1 p-6 text-faro-text-2">
              Todavía no tenemos datos públicos suficientes de tu empresa para mostrar hallazgos con fuente. No inventamos información: si quieres, cuéntanos más abajo.
            </div>
          ) : (
            <ol data-testid="findings" className="grid gap-3 md:grid-cols-3">
              {findings.map((f, i) => (
                <li key={f.id} data-testid="finding" className="flex flex-col justify-between gap-6 rounded-card border border-border bg-faro-surface-1 p-5">
                  <div className="flex flex-col gap-3">
                    <span className="font-display text-sm font-semibold text-faro-accent">0{i + 1}</span>
                    <p className="text-lg leading-snug">{f.text}</p>
                  </div>
                  <p className="text-sm text-faro-text-2">
                    Fuente:{" "}
                    <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-faro-text-2 underline decoration-white/30 underline-offset-2 hover:text-white">
                      {f.sourceLabel}
                    </a>
                    {f.isExample && <span className="ml-2 inline-block rounded-full bg-faro-surface-3 px-2 py-0.5 text-xs text-white">Ejemplo</span>}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="hablemos" className="grid gap-8 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 id="hablemos" className="text-2xl font-semibold sm:text-3xl">Habla con el asistente</h2>
            <p className="text-faro-text-2">Pregúntale lo que quieras. Integrado con Dapta: te hace unas preguntas breves y deja tu solicitud lista para el equipo.</p>
            <WidgetBlock snippet={env.DAPTA_WIDGET_SNIPPET} />
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="text-2xl font-semibold sm:text-3xl">O escríbenos como empresa</h2>
            <div className="rounded-card border border-border bg-faro-surface-1 p-5 sm:p-6">
              <ContactForm slug={slug} defaultCompany={company?.name} tracking={trackingProp} />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-faro-surface-1">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-10 text-sm text-faro-text-2 sm:px-8 md:grid-cols-3">
          <div data-testid="sender" className="flex flex-col gap-1.5">
            <h2 className="text-base font-semibold text-white">Quién te escribe</h2>
            <p>{product} — proyecto del 30X Hackathon.</p>
            {env.SENDER_LEGAL_NAME && <p>{env.SENDER_LEGAL_NAME}</p>}
            {env.SENDER_ADDRESS && <p>{env.SENDER_ADDRESS}</p>}
            {env.EMAIL_REPLY_TO && (
              <p>
                Responde a:{" "}
                <a href={`mailto:${env.EMAIL_REPLY_TO}`} data-testid="reply-to" className="text-white underline underline-offset-2">{env.EMAIL_REPLY_TO}</a>
              </p>
            )}
          </div>
          <div id="privacidad" className="flex flex-col gap-1.5 scroll-mt-6">
            <h2 className="text-base font-semibold text-white">Aviso de privacidad</h2>
            <p>
              Solo tratamos datos de empresas (nombre, correo genérico, mensaje) para responder tu solicitud. Los datos de esta página vienen de fuentes públicas. Responsable: {env.SENDER_LEGAL_NAME ?? product}. Conforme a la Ley 1581 de 2012 puedes conocer, corregir o pedir la supresión de tus datos en cualquier momento.
            </p>
          </div>
          {isIcp ? (
            <div className="flex flex-col gap-1.5">
              <h2 className="text-base font-semibold text-white">Tus datos</h2>
              <p>Esta página no guarda datos tuyos hasta que envías el formulario. No te escribiremos si no lo envías.</p>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <h2 className="text-base font-semibold text-white">¿No te interesa?</h2>
              <p>No volveremos a escribirte. Es un clic.</p>
              {optOutHref ? (
                <a
                  href={optOutHref}
                  data-testid="optout-link-footer"
                  className="inline-flex h-12 items-center rounded-button border border-white/40 px-5 font-semibold text-white transition-colors hover:bg-white hover:text-black"
                >
                  No me interesa / darme de baja
                </a>
              ) : (
                <p>Para darte de baja, responde al mensaje original y lo procesamos de inmediato.</p>
              )}
            </div>
          )}
          <Attribution className="md:col-span-3" />
        </div>
      </footer>
    </div>
  );
}
