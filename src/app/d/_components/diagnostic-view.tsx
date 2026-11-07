import { ArrowDown, ArrowUpRight, Check, ChevronDown, CircleHelp, Clock3, MessageCircle, TriangleAlert } from "lucide-react";
import { Attribution } from "@/components/attribution";
import { getEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { cityLabel } from "@/features/icp/presets";
import { BENCHMARK_MIN_N, type Benchmark, type BenchmarkRow } from "@/features/diagnostic/benchmark";
import { whatsappDisplay, whatsappHref } from "@/features/diagnostic/cta";
import type { Finding, FindingStatus, RegistryNote } from "@/features/diagnostic/findings";
import type { Tracking } from "@/features/diagnostic/params";
import { ContactForm } from "./contact-form";
import { TrackOpen } from "./track-open";
import { localize } from "@/features/diagnostic/vocab";
import type { Opportunity } from "@/features/diagnostic/opportunities";
import { displayName } from "@/features/outreach/cold-email";
import { evidenceFor, evidenceForAll, type Evidence } from "@/features/offer/evidence";

/**
 * F51 · The diagnostic page speaks as Mokub: mokub.co colours and type (night hero, light body), one WhatsApp CTA in
 * the hero and one in the closing block, never two side by side. Tokens live in `.mokub-page` (globals.css).
 */
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
  /** Health search: keep the clinic/patient copy (default). False -> "empresa"/"cliente". */
  health?: boolean;
  /** The team's company that offers the services (signs the page; Faro is the tool). */
  seller?: string;
  /** Opportunities from the company's own site + the seller's services (shown first when present). */
  opportunities?: Opportunity[] | null;
  /** Lead pages with services: "Cómo le ayudamos" per finding id and the recommended service for the final block. */
  offer?: { help: Record<string, string>; service: { name: string; outcome: string; entryOffer: string | null } };
}

/** Catalog names may say "tus"; the page always speaks with "usted". */
const usted = (s: string) => s.replace(/\btus\b/g, "sus").replace(/\bTus\b/g, "Sus").replace(/\btu\b/g, "su");

const STATUS: Record<FindingStatus, { label: string; Icon: typeof Check; pill: string; icon: string }> = {
  ok: { label: "A favor", Icon: Check, pill: "bg-[var(--mk-exito-suave)] text-[var(--mk-exito)]", icon: "bg-[var(--mk-exito-suave)] text-[var(--mk-exito)]" },
  opportunity: { label: "Por mejorar", Icon: TriangleAlert, pill: "bg-[var(--mk-alerta-suave)] text-[var(--mk-alerta)]", icon: "bg-[var(--mk-alerta-suave)] text-[var(--mk-alerta)]" },
  unknown: { label: "Sin revisar", Icon: CircleHelp, pill: "bg-[var(--mk-gris)] text-[var(--mk-suave)]", icon: "bg-[var(--mk-gris)] text-[var(--mk-suave)]" },
};

function SourceLine({ f }: { f: Finding }) {
  return (
    <p className="text-xs text-[var(--mk-suave)]">
      {f.sourceUrl ? (
        <>
          Visto en:{" "}
          <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-[var(--mk-borde-fuerte)] underline-offset-2 hover:text-[var(--mk-tinta)]">
            {f.sourceLabel}
          </a>
        </>
      ) : (
        <>Revisado en: {f.sourceLabel}</>
      )}
    </p>
  );
}

function WhatsAppButton({ href, testId, className, label = "Hablar por WhatsApp" }: { href: string; testId: string; className?: string; label?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testId}
      className={cn(
        "inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full bg-[var(--mk-wa)] px-7 text-base font-bold text-white shadow-[0_8px_24px_-8px_rgba(31,122,69,0.65)] transition-[background-color,transform] hover:bg-[var(--mk-wa-hover)] active:translate-y-px",
        className,
      )}
    >
      <MessageCircle aria-hidden className="size-5" strokeWidth={2.25} />
      {label}
    </a>
  );
}

function MokubMark({ brand, onDark }: { brand: string; onDark?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", onDark ? "text-white" : "text-[var(--mk-tinta)]")}>
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static logo, no layout shift */}
      <img src="/brand/mokub-logo.png" alt="" width={30} height={25} className={cn("h-[25px] w-auto", onDark && "brightness-0 invert")} />
      <span className="font-[family-name:var(--font-calsans)] text-xl leading-none tracking-[-0.01em]">{brand}</span>
    </span>
  );
}

/** F52 · What the gap costs, with its source (never an invented figure). */
function EvidenceStrip({ e }: { e: Evidence }) {
  return (
    <p className="flex gap-3 rounded-xl bg-[var(--mk-alerta-suave)] px-4 py-3 text-sm leading-relaxed text-[var(--mk-tinta)]">
      <span className="shrink-0 font-[family-name:var(--font-calsans)] text-xl leading-tight text-[var(--mk-alerta)]">{e.figure}</span>
      <span>
        {e.text}{" "}
        <a href={e.url} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap text-[var(--mk-suave)] underline underline-offset-2 hover:text-[var(--mk-tinta)]">
          {e.source.replace(/ \(.*\)$/, "")}
        </a>
      </span>
    </p>
  );
}

function StakesBlock({ items }: { items: Evidence[] }) {
  return (
    <section aria-labelledby="en-juego" data-testid="stakes" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--mk-alerta)]">Lo que está en juego</p>
        <h2 id="en-juego" className="max-w-3xl text-balance text-[1.75rem] leading-tight sm:text-[2.25rem]">Cada día sin resolver esto, alguien más se queda con esos clientes</h2>
      </div>
      <ul className={cn("grid gap-4", items.length > 1 && "md:grid-cols-2", items.length > 2 && "lg:grid-cols-3")}>
        {items.map((e) => (
          <li key={e.id} className="flex flex-col gap-3 rounded-[20px] border border-[var(--mk-borde)] bg-white p-6">
            <span className="font-[family-name:var(--font-calsans)] text-[3rem] leading-none text-[var(--mk-acento)]">{e.figure}</span>
            <p className="text-pretty leading-relaxed text-[var(--mk-tinta)]">{e.text}</p>
            <a href={e.url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex items-center gap-1 text-xs text-[var(--mk-suave)] underline underline-offset-2 hover:text-[var(--mk-tinta)]">
              Fuente: {e.source}
              <ArrowUpRight aria-hidden className="size-3" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Opportunity finding when the site gave no AI opportunities: full card with why, recommendation and how we help. */
function FindingCard({ f, help, index, evidence }: { f: Finding; help?: string; index: number; evidence?: Evidence | null }) {
  return (
    <li data-testid="finding" data-status={f.status} className="grid gap-5 rounded-[20px] border border-[var(--mk-borde)] bg-white p-6 sm:p-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:gap-4">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--mk-acento)] text-sm font-bold text-white">{index}</span>
        <div className="flex min-w-0 flex-col gap-2.5">
          <h3 className="text-pretty text-xl leading-snug sm:text-[1.375rem]">{f.title}</h3>
          <p className="text-pretty leading-relaxed text-[var(--mk-texto)]">{f.why}</p>
          {evidence && <EvidenceStrip e={evidence} />}
          <p className="text-pretty leading-relaxed text-[var(--mk-tinta)]">
            <span className="font-semibold">Recomendación: </span>
            {f.recommendation}
          </p>
          <SourceLine f={f} />
        </div>
      </div>
      {help && (
        <div data-testid="how-we-help" className="self-start rounded-2xl bg-[var(--mk-acento-suave)] p-5">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--mk-acento)]">Cómo le ayudamos</p>
          <p className="mt-2 text-pretty text-[0.9375rem] leading-relaxed text-[var(--mk-tinta)]">{usted(help)}</p>
        </div>
      )}
    </li>
  );
}

/** Compact checklist row: what we checked and how it came out. */
function CheckRow({ f, help }: { f: Finding; help?: string }) {
  const s = STATUS[f.status];
  return (
    <li data-testid="finding" data-status={f.status} className="flex gap-3.5 py-4">
      <span aria-hidden className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", s.icon)}>
        <s.Icon className="size-4" strokeWidth={2.5} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2 font-semibold text-[var(--mk-tinta)]">
          {f.title}
          {f.isExample && <span className="rounded-full bg-[var(--mk-gris)] px-2 py-0.5 text-xs font-medium text-[var(--mk-suave)]">Ejemplo</span>}
        </p>
        <p className="text-pretty text-sm leading-relaxed text-[var(--mk-texto)]">{f.status === "opportunity" ? f.recommendation : f.why}</p>
        {help && (
          <p data-testid="how-we-help" className="text-pretty text-sm leading-relaxed text-[var(--mk-acento)]">
            <span className="font-semibold">Cómo le ayudamos: </span>
            {usted(help)}
          </p>
        )}
        <SourceLine f={f} />
      </div>
    </li>
  );
}

const ORDER: Record<FindingStatus, number> = { opportunity: 0, unknown: 1, ok: 2 };
const pct = (v: number) => `${Math.round(v * 100).toLocaleString("es-CO")} %`;

const YOU: Record<"yes" | "no" | "na", { text: string; cls: string }> = {
  yes: { text: "Usted: sí", cls: "bg-[var(--mk-exito-suave)] text-[var(--mk-exito)]" },
  no: { text: "Usted: no", cls: "bg-[var(--mk-alerta-suave)] text-[var(--mk-alerta)]" },
  na: { text: "Sin dato", cls: "bg-[var(--mk-gris)] text-[var(--mk-suave)]" },
};

function BenchRow({ r }: { r: BenchmarkRow }) {
  const you = YOU[r.you === null ? "na" : r.you ? "yes" : "no"];
  return (
    <li
      data-testid={`bench-${r.key}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-5 md:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_4.5rem_6.5rem] md:gap-x-6"
    >
      <p className="font-medium text-[var(--mk-tinta)]">{r.label}</p>
      <span className={cn("justify-self-end rounded-full px-3 py-1 text-center text-[0.8125rem] font-bold md:order-last md:w-full", you.cls)}>{you.text}</span>
      {r.pct === null ? (
        <p className="col-span-2 text-sm text-[var(--mk-suave)] md:col-span-2">
          Aún no hay suficientes datos para comparar{r.n > 0 ? ` (n = ${r.n}, mínimo ${BENCHMARK_MIN_N})` : ""}
        </p>
      ) : (
        <>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--mk-gris)]" role="img" aria-label={`${pct(r.pct)} de ${r.n}`}>
            <div className="h-full rounded-full bg-[var(--mk-acento)]" style={{ width: `${Math.max(2, r.pct * 100)}%` }} />
          </div>
          <p className="text-right tabular-nums text-[var(--mk-tinta)]">
            {pct(r.pct)} <span className="block text-xs text-[var(--mk-suave)]">n = {r.n}</span>
          </p>
        </>
      )}
    </li>
  );
}

function BenchmarkBlock({ b, L }: { b: Benchmark; L: (t: string) => string }) {
  const peers = Math.max(0, ...b.rows.map((r) => r.n));
  const city = b.city ? cityLabel(b.city) : null;
  const wide = b.scope === "hunt";
  const title = L(peers < BENCHMARK_MIN_N ? "Usted frente a su competencia" : wide ? `Usted frente a ${peers} clínicas revisadas en su búsqueda` : `Usted frente a ${peers} clínicas${city ? ` de ${city}` : ""}`);
  return (
    <section aria-labelledby="comparacion" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--mk-acento)]">Comparación</p>
        <h2 id="comparacion" className="text-[1.75rem] leading-tight sm:text-[2rem]">{title}</h2>
        <p className="max-w-2xl text-pretty text-[var(--mk-suave)]">
          {wide
            ? L(`Clínicas revisadas en su búsqueda${city ? `: en ${city} aún hay menos de ${BENCHMARK_MIN_N} con sitio revisado, así que comparamos con todas las de la búsqueda` : ""}. Solo mostramos totales, nunca nombres.`)
            : L(`Comparamos su sitio con los de otras clínicas${city ? ` de ${city}` : ""} de la misma búsqueda pública. Solo mostramos totales, nunca nombres.`)}
        </p>
      </div>
      <ul data-testid="benchmark" className="divide-y divide-[var(--mk-borde)] rounded-[20px] border border-[var(--mk-borde)] bg-white px-5 sm:px-7">
        {b.rows.map((r) => (
          <BenchRow key={r.key} r={r} />
        ))}
      </ul>
    </section>
  );
}

const NEXT_STEPS = [
  { title: "Nos escribe por WhatsApp", text: "Le responde el asistente de Mokub, de día y de noche, con este diagnóstico a mano." },
  { title: "Agenda 20 minutos", text: "Le muestra las horas libres y deja la videollamada en su calendario." },
  { title: "Sale con un plan", text: "Qué arreglar primero, cuánto cuesta y en cuánto tiempo. Sin compromiso." },
];

export function DiagnosticView({ slug, tracking, company, findings, benchmark, registry, icp, optOutHref, offer, health = true, seller, opportunities: opps }: ViewProps) {
  const L = (text: string) => localize(text, health);
  const env = getEnv();
  const product = env.NEXT_PUBLIC_PRODUCT_NAME;
  const brand = seller ?? product;
  const isIcp = !!icp;
  const trackingProp = { c: tracking.c, s: tracking.s, utm: tracking.utm };
  const wa = whatsappHref(env.NEXT_PUBLIC_WHATSAPP_NUMBER, company?.name, slug, health);
  const sorted = [...findings].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const opportunityFindings = sorted.filter((f) => f.status === "opportunity");
  const restFindings = sorted.filter((f) => f.status !== "opportunity");
  const hasOpps = !isIcp && !!opps?.length;
  // AI opportunities lead; the site checks then become a compact checklist. Without them, gaps get full cards.
  const gapCards = hasOpps ? [] : opportunityFindings;
  const checklist = hasOpps ? sorted : restFindings;
  const opportunities = hasOpps ? opps!.length : opportunityFindings.length;
  const good = findings.filter((f) => f.status === "ok").length;
  // A comparison of someone without a website is a column of "no": it says nothing (F51).
  const noWebsite = findings.some((f) => f.id === "no-website" && f.status === "opportunity");
  const showBenchmark = !isIcp && !!benchmark && !noWebsite;
  const shownName = company ? displayName(company.name) : undefined;
  // F52: the figures go beside each gap card; when AI opportunities lead (gaps in the checklist), they get their own block.
  const stakes = isIcp || !hasOpps ? [] : evidenceForAll(opportunityFindings.map((f) => f.id), health);
  const legal = env.SENDER_LEGAL_NAME && !env.SENDER_LEGAL_NAME.toLowerCase().includes(product.toLowerCase()) ? env.SENDER_LEGAL_NAME : null;
  const headline = isIcp
    ? icp.headline
    : opportunities > 0
      ? L(`${opportunities} ${opportunities === 1 ? "oportunidad" : "oportunidades"} para conseguir más pacientes`)
      : L("Su presencia digital, revisada como la vería un paciente nuevo");

  return (
    <div className="mokub-page relative isolate min-h-dvh overflow-x-clip">
      {!isIcp && <TrackOpen slug={slug} tracking={trackingProp} />}

      {/* Hero on night, like mokub.co */}
      <div className="relative bg-[var(--mk-noche)] text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-0 opacity-90"
          style={{ background: "radial-gradient(900px 420px at 85% -10%, rgba(19,78,138,0.55), transparent 70%), radial-gradient(600px 300px at 0% 100%, rgba(38,166,154,0.12), transparent 70%)" }}
        />
        <header className="relative mx-auto flex w-full max-w-[1120px] items-center justify-between gap-3 px-5 py-5">
          <MokubMark brand={brand} onDark />
          {optOutHref && (
            <a href={optOutHref} data-testid="optout-link" className="rounded-full px-3 py-2 text-sm text-[var(--mk-sobre-noche)] underline-offset-4 transition-colors hover:text-white hover:underline">
              No me interesa
            </a>
          )}
        </header>

        <section className="relative mx-auto grid w-full max-w-[1120px] gap-10 px-5 pb-16 pt-8 sm:pb-20 sm:pt-12 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end lg:gap-14">
          <div className="flex min-w-0 flex-col gap-6">
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white/[0.08] px-3.5 py-1.5 text-sm text-[var(--mk-hook)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">
                {isIcp ? icp.audience : L("Diagnóstico de captación de pacientes")}
              </span>
              {company?.isDemo && (
                <span data-testid="demo-badge" className="rounded-full bg-[var(--mk-aqua)] px-3 py-1.5 text-sm font-semibold text-[var(--mk-aqua-tinta)]">
                  Ejemplo
                </span>
              )}
            </p>
            <h1 data-testid="diag-title" className="flex flex-col gap-3">
              {!isIcp && (
                <span className="font-sans text-lg font-medium tracking-normal text-[var(--mk-sobre-noche)]">
                  {shownName}
                  <span className="sr-only"> · {L("Diagnóstico de captación de pacientes")}</span>
                </span>
              )}
              <span className="text-balance text-[2.5rem] leading-[1.04] tracking-[-0.015em] text-white sm:text-[3.6rem]">{headline}</span>
            </h1>
            <p className="max-w-[36rem] text-pretty text-lg leading-relaxed text-[var(--mk-sobre-noche)]">
              {isIcp
                ? `${brand} ayuda a clínicas a ver qué les cuesta pacientes nuevos y cómo arreglarlo. Aquí tiene cómo funciona.`
                : L("Revisamos su presencia digital como lo haría un paciente nuevo. Esto es lo que encontramos y cómo lo resolvemos.")}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <WhatsAppButton href={wa} testId="whatsapp-cta-hero" className="w-full sm:w-auto" />
              <a href="#diagnostico" className="inline-flex items-center justify-center gap-1.5 text-[0.9375rem] font-medium text-white/85 underline-offset-4 hover:text-white hover:underline">
                {isIcp ? "Ver cómo funciona" : "Ver el diagnóstico"} <ArrowDown aria-hidden className="size-4" />
              </a>
            </div>
            <p className="flex items-center gap-2 text-sm text-[var(--mk-sobre-noche)]/80">
              <Clock3 aria-hidden className="size-4" />
              Responde el asistente de {brand}, de día y de noche. Sin compromiso.
            </p>
          </div>

          {!isIcp && findings.length > 0 && (
            <div data-testid="diag-summary" className="flex flex-col gap-4 rounded-[20px] bg-[var(--mk-capa)] p-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              <p className="text-sm text-[var(--mk-sobre-noche)]">Resumen del diagnóstico</p>
              <div className="grid grid-cols-2 gap-3">
                <p className="rounded-2xl bg-white/[0.05] p-4">
                  <span className="block font-[family-name:var(--font-calsans)] text-[2.5rem] leading-none text-[#F4B183]">{opportunities}</span>
                  <span className="mt-1.5 block text-sm text-[var(--mk-sobre-noche)]">{opportunities === 1 ? "oportunidad" : "oportunidades"}</span>
                </p>
                <p className="rounded-2xl bg-white/[0.05] p-4">
                  <span className="block font-[family-name:var(--font-calsans)] text-[2.5rem] leading-none text-[var(--mk-aqua-claro)]">{good}</span>
                  <span className="mt-1.5 block text-sm text-[var(--mk-sobre-noche)]">{good === 1 ? "punto a favor" : "puntos a favor"}</span>
                </p>
              </div>
              <p className="text-[0.8125rem] leading-normal text-[var(--mk-sobre-noche)]/75">Solo datos públicos de su empresa y de su sitio web.</p>
            </div>
          )}
        </section>
      </div>

      <main id="diagnostico" className="mx-auto flex w-full max-w-[1120px] scroll-mt-4 flex-col gap-16 px-5 py-14 sm:gap-20 sm:py-20">
        {stakes.length > 0 && <StakesBlock items={stakes} />}
        {hasOpps && (
          <section aria-labelledby="oportunidades" data-testid="opportunities" className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--mk-acento)]">Oportunidades</p>
              <h2 id="oportunidades" className="text-[1.75rem] leading-tight sm:text-[2.25rem]">Lo que haríamos en {shownName ?? "su empresa"}</h2>
              <p className="max-w-2xl text-pretty text-[var(--mk-suave)]">Leímos lo que dice su sitio web y lo cruzamos con lo que hacemos en {brand}.</p>
            </div>
            <ol className="flex flex-col gap-4">
              {opps!.map((o, i) => (
                <li key={`${o.serviceId}-${i}`} className="grid gap-5 rounded-[20px] border border-[var(--mk-borde)] bg-white p-6 sm:p-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:gap-4">
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--mk-acento)] text-sm font-bold text-white">{i + 1}</span>
                    <div className="flex min-w-0 flex-col gap-2.5">
                      <h3 className="text-pretty text-xl leading-snug sm:text-[1.375rem]">{o.title}</h3>
                      <p className="text-pretty leading-relaxed text-[var(--mk-texto)]">{o.why}</p>
                      {o.evidence && (
                        <blockquote className="rounded-xl border-l-[3px] border-[var(--mk-borde-fuerte)] bg-[var(--mk-fondo)] px-4 py-2.5 text-sm text-[var(--mk-texto)]">
                          <span className="text-[var(--mk-suave)]">En su sitio: </span>«{o.evidence}»
                        </blockquote>
                      )}
                    </div>
                  </div>
                  <div className="self-start rounded-2xl bg-[var(--mk-acento-suave)] p-5">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--mk-acento)]">Cómo le ayudamos · {usted(o.serviceName)}</p>
                    <p className="mt-2 text-pretty text-[0.9375rem] leading-relaxed text-[var(--mk-tinta)]">{usted(o.howWeHelp)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section aria-labelledby="hallazgos" className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--mk-acento)]">{isIcp ? "Cómo funciona" : "Diagnóstico"}</p>
            <h2 id="hallazgos" className="text-[1.75rem] leading-tight sm:text-[2.25rem]">{isIcp ? "Qué revisamos" : hasOpps ? "Lo que revisamos en su sitio" : gapCards.length ? L("Lo que le puede estar costando pacientes") : "Lo que encontramos"}</h2>
          </div>
          {isIcp ? (
            <ol className="grid gap-4 sm:grid-cols-3">
              {icp.points.map((p, i) => (
                <li key={p} className="flex flex-col gap-3 rounded-[20px] border border-[var(--mk-borde)] bg-white p-6 text-[var(--mk-texto)]">
                  <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-[var(--mk-acento-suave)] text-sm font-bold text-[var(--mk-acento)]">{i + 1}</span>
                  {p}
                </li>
              ))}
            </ol>
          ) : (
            <div data-testid="findings" className="flex flex-col gap-4">
              {gapCards.length > 0 && (
                <ul aria-label="Por mejorar" className="flex flex-col gap-4">
                  {gapCards.map((f, i) => (
                    <FindingCard key={f.id} f={f} help={offer?.help[f.id]} index={i + 1} evidence={evidenceFor(f.id, health)} />
                  ))}
                </ul>
              )}
              {checklist.length > 0 && (
                <ul aria-label="Lo que revisamos" className="grid gap-x-10 divide-y divide-[var(--mk-borde)] rounded-[20px] border border-[var(--mk-borde)] bg-white px-6 sm:px-7 md:grid-cols-2 md:divide-y-0 [&>li]:md:border-b [&>li]:md:border-[var(--mk-borde)] [&>li:nth-last-child(-n+2)]:md:border-b-0">
                  {checklist.map((f) => (
                    <CheckRow key={f.id} f={f} help={hasOpps ? undefined : offer?.help[f.id]} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {showBenchmark && <BenchmarkBlock b={benchmark!} L={L} />}

        {/* Closing: one CTA, the next steps beside it (no second button). */}
        <section id="hablar" aria-labelledby="hablemos" className="grid overflow-hidden rounded-[28px] bg-[var(--mk-noche)] text-white lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-5 p-7 sm:p-10">
            <h2 id="hablemos" className="text-balance text-[2rem] leading-[1.08] text-white sm:text-[2.6rem]">
              {L("¿Le ayudamos a conseguir más pacientes?")}
            </h2>
            {offer && !isIcp ? (
              <div data-testid="offer-cta" className="flex max-w-xl flex-col gap-3">
                <p className="text-pretty leading-relaxed text-[var(--mk-sobre-noche)]">
                  <span className="font-semibold text-white">{usted(offer.service.name)}.</span> {offer.service.outcome}
                </p>
                {offer.service.entryOffer && (
                  <p className="w-fit rounded-2xl bg-white/[0.08] px-4 py-2 text-sm text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]">
                    Para empezar: {offer.service.entryOffer.replace(/\.$/, "")}
                  </p>
                )}
              </div>
            ) : (
              <p className="max-w-xl text-pretty leading-relaxed text-[var(--mk-sobre-noche)]">{L("Escríbanos por WhatsApp y le decimos por dónde empezar con su clínica. Sin costo y sin compromiso.")}</p>
            )}
            <div className="flex flex-col gap-2.5 pt-1">
              <WhatsAppButton href={wa} testId="whatsapp-cta" className="w-full sm:w-auto sm:self-start" label="Escribir por WhatsApp" />
              <p className="text-[0.8125rem] text-[var(--mk-sobre-noche)]/80">
                {whatsappDisplay(env.NEXT_PUBLIC_WHATSAPP_NUMBER)} · responde el asistente de {brand}
              </p>
            </div>
            <details data-testid="contact-details" open={isIcp} className="group mt-2 border-t border-white/10 pt-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[var(--mk-sobre-noche)] hover:text-white [&::-webkit-details-marker]:hidden">
                Prefiero dejar un mensaje como empresa
                <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mokub-form mt-4 rounded-[20px] bg-white p-5 text-[var(--mk-tinta)] sm:p-6">
                <ContactForm slug={slug} defaultCompany={company?.name} tracking={trackingProp} />
              </div>
            </details>
          </div>
          <div data-testid="assistant-block" className="flex min-w-0 flex-col justify-center gap-6 bg-[var(--mk-capa)] p-7 sm:p-10">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--mk-azul-claro)]">Qué pasa después</p>
            <ol className="flex flex-col gap-5">
              {NEXT_STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-sm font-bold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)]">{i + 1}</span>
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-white">{s.title}</p>
                    <p className="text-pretty text-sm leading-relaxed text-[var(--mk-sobre-noche)]">{L(s.text)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-sm text-[var(--mk-sobre-noche)]/80">
              Por WhatsApp también le puede escribir una persona del equipo, en el mismo chat.
            </p>
          </div>
        </section>

        {!isIcp && registry && (
          <p data-testid="why-we-wrote" className="-mt-8 text-pretty text-sm leading-relaxed text-[var(--mk-suave)] sm:-mt-12">
            <strong className="font-semibold text-[var(--mk-tinta)]">Por qué le escribimos:</strong> su empresa aparece en{" "}
            <a href={registry.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[var(--mk-acento)] underline decoration-[var(--mk-acento)]/30 underline-offset-2 hover:decoration-[var(--mk-acento)]">
              {registry.label}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
            , una fuente pública de empresas.{registry.isExample ? " (Ejemplo)" : ""}
          </p>
        )}
      </main>

      <footer id="baja" className="border-t border-[var(--mk-borde)] bg-white">
        <div className="mx-auto grid w-full max-w-[1120px] gap-8 px-5 py-10 text-sm leading-relaxed text-[var(--mk-suave)] md:grid-cols-3 md:gap-12">
          <div data-testid="sender" className="flex flex-col gap-2">
            <MokubMark brand={brand} />
            {legal && <p className="text-[var(--mk-tinta)]">{legal}</p>}
            {env.SENDER_ADDRESS && <p>{env.SENDER_ADDRESS}</p>}
            {env.EMAIL_REPLY_TO && (
              <p>
                Responda a:{" "}
                <a href={`mailto:${env.EMAIL_REPLY_TO}`} data-testid="reply-to" className="text-[var(--mk-acento)] underline underline-offset-2">{env.EMAIL_REPLY_TO}</a>
              </p>
            )}
          </div>
          <div id="privacidad" className="flex scroll-mt-6 flex-col gap-1.5">
            <h2 className="font-sans text-sm font-bold tracking-normal text-[var(--mk-tinta)]">Aviso de privacidad</h2>
            <p>
              Solo tratamos datos de empresas (nombre, correo genérico, mensaje) para responder su solicitud. Los datos de esta página vienen de fuentes públicas y del sitio web público de la empresa. Responsable: {env.SENDER_LEGAL_NAME ?? product}. Conforme a la Ley 1581 de 2012 puede conocer, corregir o pedir la supresión de sus datos en cualquier momento.
            </p>
          </div>
          {isIcp ? (
            <div className="flex flex-col gap-1.5">
              <h2 className="font-sans text-sm font-bold tracking-normal text-[var(--mk-tinta)]">Sus datos</h2>
              <p>Esta página no guarda datos suyos hasta que envía el formulario. No le escribiremos si no lo envía.</p>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-2.5">
              <h2 className="font-sans text-sm font-bold tracking-normal text-[var(--mk-tinta)]">¿No le interesa?</h2>
              <p>No volveremos a escribirle. Es un clic.</p>
              {optOutHref ? (
                <a
                  href={optOutHref}
                  data-testid="optout-link-footer"
                  className="inline-flex h-11 items-center rounded-full border border-[var(--mk-borde-fuerte)] px-5 font-medium text-[var(--mk-tinta)] transition-colors hover:bg-[var(--mk-tinta)] hover:text-white"
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
