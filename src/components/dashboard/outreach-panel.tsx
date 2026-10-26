import { cn } from "@/lib/utils";
import type { OutreachChannel, OutreachMetrics } from "@/features/metrics/outreach";

const LABEL: Record<OutreachChannel, string> = { email: "Correo", whatsapp: "WhatsApp", manual: "Manual" };
const n = (v: number) => v.toLocaleString("es-CO");
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`);
const fmtDay = (d: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));
const fmtAt = (iso: string) => new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function Kpi({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div className="rounded-card border border-white/10 bg-faro-surface-1 p-4">
      <p className="text-[13px] text-faro-text-3">{label}</p>
      <p className={cn("mt-1.5 font-display text-3xl font-bold tabular-nums tracking-tight", accent ? "text-faro-accent" : "text-white")}>{value}</p>
      <p className="mt-1 text-[12.5px] text-faro-text-3">{note}</p>
    </div>
  );
}

/** F26 · Prospecting at a glance: contacted, opened, replied, by channel and day. */
export function OutreachPanel({ m }: { m: OutreachMetrics }) {
  const t = m.totals;
  const max = Math.max(1, ...m.days.map((d) => d.sent));
  return (
    <section aria-labelledby="outreach-metrics" className="rounded-card border border-border bg-card p-5 sm:p-6" data-testid="outreach-metrics">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id="outreach-metrics" className="font-display text-lg font-semibold">Contacto: a quién escribimos y quién respondió</h3>
          <p className="mt-1 text-sm text-faro-text-2">Empresas, no mensajes. Solo datos reales; los simulados y de prueba no cuentan.</p>
        </div>
        <p className="text-sm tabular-nums text-faro-text-2">
          Hoy: {n(m.today.emails)}/{n(m.today.emailsPerDay)} correos{m.today.dailyEnabled ? "" : " (envío diario apagado)"} · {n(m.today.whatsapp)}/{n(m.today.whatsappLimit)} WhatsApp
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Contactados" value={n(t.contacted)} note="empresas con mensaje enviado" accent />
        <Kpi label="Abrieron el diagnóstico" value={n(t.opened)} note={`tasa ${pct(t.openRate)}`} />
        <Kpi label="Respondieron" value={n(t.replied)} note={`tasa ${pct(t.replyRate)}`} />
        <Kpi label="Calificados" value={n(t.qualified)} note="por el agente de Dapta o a mano" />
        <Kpi label="Bajas" value={n(t.optedOut)} note="no se les escribe más" />
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-[12.5px] text-faro-text-3">
              <th className="py-2 font-medium">Canal</th>
              {["Contactados", "Abrieron", "Respondieron", "Calificados", "Bajas", "Simulados", "En cola", "Con error"].map((h) => (
                <th key={h} className="py-2 text-right font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {(Object.keys(m.byChannel) as OutreachChannel[]).map((c) => {
              const s = m.byChannel[c];
              return (
                <tr key={c} className="tabular-nums">
                  <td className="py-2.5 font-semibold text-white">{LABEL[c]}</td>
                  <td className="py-2.5 text-right">{n(s.contacted)}</td>
                  <td className="py-2.5 text-right">{n(s.opened)} <span className="text-faro-text-3">({pct(s.openRate)})</span></td>
                  <td className="py-2.5 text-right">{n(s.replied)} <span className="text-faro-text-3">({pct(s.replyRate)})</span></td>
                  <td className="py-2.5 text-right">{n(s.qualified)}</td>
                  <td className="py-2.5 text-right">{n(s.optedOut)}</td>
                  <td className="py-2.5 text-right text-faro-text-3">{n(s.simulated)}</td>
                  <td className="py-2.5 text-right text-faro-text-3">{n(s.queued)}</td>
                  <td className="py-2.5 text-right text-faro-text-3">{n(s.failed)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <p className="text-[13px] text-faro-text-3">Últimos {m.days.length} días · enviados <span className="text-faro-accent">■</span> abrieron <span className="text-white">■</span> respondieron <span className="text-[#25D366]">■</span></p>
          <div className="mt-3 flex h-36 items-end gap-1.5" role="img" aria-label="Enviados, aperturas y respuestas por día">
            {m.days.map((d) => (
              <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${fmtDay(d.day)}: ${d.sent} enviados, ${d.opened} abrieron, ${d.replied} respondieron`}>
                <div className="flex h-28 w-full items-end justify-center gap-[2px]">
                  <span className="w-1/3 rounded-t bg-faro-accent" style={{ height: `${(d.sent / max) * 100}%` }} />
                  <span className="w-1/3 rounded-t bg-white/80" style={{ height: `${(d.opened / max) * 100}%` }} />
                  <span className="w-1/3 rounded-t bg-[#25D366]" style={{ height: `${(d.replied / max) * 100}%` }} />
                </div>
                <span className="truncate text-[10.5px] text-faro-text-3">{fmtDay(d.day)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[13px] text-faro-text-3">Respuestas recientes</p>
          {m.recentReplies.length === 0 ? (
            <p className="mt-3 text-sm text-faro-text-2">Aún no hay respuestas. Llegan solas desde el correo, WhatsApp y el agente de Dapta.</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/[0.06] text-sm">
              {m.recentReplies.map((r, i) => (
                <li key={`${r.at}-${i}`} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-white">{r.company}</span>
                  <span className="shrink-0 text-faro-text-3">{LABEL[r.channel]} · {fmtAt(r.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
