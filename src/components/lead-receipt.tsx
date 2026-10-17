import type { LeadReceipt as Receipt, ReceiptLine } from "@/features/metrics/receipt";

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 4 });

/** Zigzag paper edge, top and bottom. */
const TEAR =
  "conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%, conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 14px 100%";

function Leader() {
  return <span aria-hidden className="mx-2 mb-[3px] min-w-6 flex-1 self-end border-b border-dotted border-white/25" />;
}

function Line({ line }: { line: ReceiptLine }) {
  return (
    <li className="py-1.5">
      <div className="flex items-end text-[13px] leading-5">
        <span className="text-white/90">
          {qty(line.quantity)} {line.unit}
          <span className="text-[#9b9999]"> × {usd(line.rate)}</span>
        </span>
        <Leader />
        {line.coveredByFreeTier ? (
          <span className="tabular-nums">
            <s className="text-[#9b9999]">{usd(line.listUsd)}</s> <span className="text-white">{usd(0)}</span>
          </span>
        ) : (
          <span className="tabular-nums text-white">{usd(line.usd)}</span>
        )}
      </div>
      {line.coveredByFreeTier && <p className="text-[11px] uppercase tracking-wider text-[#CBE850]">cubierto por tier gratuito</p>}
      {line.evidence && <p className="mt-0.5 break-words text-[11px] leading-4 text-[#9b9999]">↳ {line.evidence}</p>}
    </li>
  );
}

/** Itemized lead cost in receipt style (SPEC §10 view 4). Total equals the sum of the lead's cost_entries. */
export function LeadReceipt({ receipt }: { receipt: Receipt }) {
  const used = receipt.categories.filter((c) => c.lines.length > 0);
  const empty = receipt.categories.filter((c) => c.lines.length === 0);
  return (
    <article
      aria-label={`Recibo de lead: ${receipt.companyName}`}
      className="relative mx-auto w-full max-w-md bg-[#0f0f0f] px-5 pb-10 pt-9 font-mono text-white [font-variant-numeric:tabular-nums] sm:px-7"
      style={{ WebkitMask: TEAR, mask: TEAR, WebkitMaskComposite: "source-in", maskComposite: "intersect" }}
    >
      <header className="border-b border-dashed border-white/25 pb-4 text-center">
        <p className="text-[11px] uppercase tracking-[0.3em] text-[#9b9999]">Faro · recibo de lead</p>
        <h2 className="mt-2 break-words font-sans text-lg font-bold leading-tight tracking-tight">{receipt.companyName}</h2>
        <p className="mt-1 text-[11px] text-[#9b9999]">
          fuente {receipt.sourceChannel} · {receipt.entryCount} {receipt.entryCount === 1 ? "registro" : "registros"}
        </p>
        {receipt.isDemo && (
          <p className="mt-3 inline-block rotate-[-2deg] border-2 border-[#ff6b6b] px-3 py-0.5 text-xs font-bold tracking-[0.35em] text-[#ff6b6b]">
            DEMO
          </p>
        )}
      </header>

      {used.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#9b9999]">Sin costos registrados para este lead.</p>
      ) : (
        <div className="divide-y divide-dashed divide-white/15">
          {used.map((c) => (
            <section key={c.category} className="py-3" aria-label={c.label}>
              <h3 className="flex items-end font-mono text-xs font-bold uppercase tracking-[0.2em] text-white/60">
                {c.label}
                <Leader />
                <span className="tabular-nums text-white">{usd(c.subtotalUsd)}</span>
              </h3>
              <ul className="mt-1">
                {c.lines.map((l) => (
                  <Line key={l.id} line={l} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {empty.length > 0 && (
        <p className="border-t border-dashed border-white/15 pt-3 text-[11px] text-[#9b9999]">
          Sin cargos: {empty.map((c) => c.label.toLowerCase()).join(", ")}.
        </p>
      )}

      <footer className="mt-4 -mx-2 rounded-[10px] bg-[#CBE850] px-4 py-3 text-[#1a1a1c]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-[0.25em]">Total</span>
          <span className="font-sans text-2xl font-bold tracking-tight">{usd(receipt.totalUsd)}</span>
        </div>
        {receipt.listTotalUsd > receipt.totalUsd && (
          <p className="mt-1 text-[11px] font-medium">valor de lista {usd(receipt.listTotalUsd)} · lo demás cubierto por tier gratuito</p>
        )}
      </footer>
      <p className="mt-4 text-center text-[10px] uppercase tracking-widest text-[#9b9999]">
        Cada línea sale de cost_entries · {receipt.isDemo ? "datos de prueba, no reales" : "datos reales"}
      </p>
    </article>
  );
}
