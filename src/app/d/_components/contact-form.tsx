"use client";

import { useState } from "react";

type Status = "idle" | "sending" | "ok" | "error";

const field =
  "h-12 w-full rounded-button border border-border bg-faro-surface-2 px-4 text-base text-white placeholder:text-faro-text-3 focus-visible:border-faro-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-faro-accent aria-[invalid=true]:border-[var(--faro-danger)]";

export function ContactForm({
  slug,
  defaultCompany,
  tracking,
  privacyHref = "#privacidad",
}: {
  slug: string;
  defaultCompany?: string;
  tracking: { c?: string; s?: string; utm?: Record<string, string> };
  privacyHref?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setStatus("sending");
    setErrors({});
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          company: f.get("company"),
          email: f.get("email"),
          role: f.get("role") || undefined,
          message: f.get("message"),
          consent: f.get("consent") === "on",
          hp: f.get("hp") ?? "",
          ...tracking,
        }),
      });
      if (res.ok) return setStatus("ok");
      if (res.status === 422) {
        const data = (await res.json()) as { errors?: Record<string, string> };
        setErrors(data.errors ?? {});
      }
      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "ok") {
    return (
      <div role="status" data-testid="contact-ok" className="flex flex-col gap-2 rounded-card border border-faro-accent bg-faro-surface-1 p-6">
        <p className="font-display text-xl font-semibold">Recibimos tu mensaje.</p>
        <p className="text-faro-text-2">Responderemos al correo de la empresa que indicaste. Solo usaremos estos datos para atender tu solicitud.</p>
      </div>
    );
  }

  const err = (k: string) => errors[k];
  return (
    <form onSubmit={onSubmit} noValidate data-testid="contact-form" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-company" className="text-sm font-medium">Empresa</label>
        <input id="c-company" name="company" defaultValue={defaultCompany} required maxLength={160} autoComplete="organization" className={field} aria-invalid={!!err("company")} aria-describedby={err("company") ? "e-company" : undefined} />
        {err("company") && <p id="e-company" className="text-sm text-[var(--faro-danger)]">{err("company")}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-email" className="text-sm font-medium">Correo de la empresa</label>
        <input id="c-email" name="email" type="email" required maxLength={160} inputMode="email" placeholder="info@tuempresa.com" className={field} aria-invalid={!!err("email")} aria-describedby={err("email") ? "e-email" : "h-email"} />
        {err("email") ? (
          <p id="e-email" className="text-sm text-[var(--faro-danger)]">{err("email")}</p>
        ) : (
          <p id="h-email" className="text-xs text-faro-text-3">Un buzón genérico (info@, citas@), no un correo personal.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-role" className="text-sm font-medium">Cargo o área <span className="font-normal text-faro-text-3">(opcional)</span></label>
        <input id="c-role" name="role" maxLength={80} placeholder="Gerencia, recepción, administración" className={field} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="c-message" className="text-sm font-medium">¿Qué necesitan?</label>
        <textarea id="c-message" name="message" required rows={4} maxLength={1000} className={`${field} h-auto min-h-28 py-3`} aria-invalid={!!err("message")} aria-describedby={err("message") ? "e-message" : undefined} />
        {err("message") && <p id="e-message" className="text-sm text-[var(--faro-danger)]">{err("message")}</p>}
      </div>
      {/* Honeypot: off-screen, not focusable, ignored by assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>No llenar<input name="hp" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <div className="flex items-start gap-3">
        <input id="c-consent" name="consent" type="checkbox" required className="mt-1 size-5 shrink-0 accent-[var(--faro-accent)]" aria-invalid={!!err("consent")} />
        <label htmlFor="c-consent" className="text-sm leading-relaxed text-faro-text-2">
          Acepto el <a href={privacyHref} className="text-white underline underline-offset-2">aviso de privacidad</a> y que usen estos datos de la empresa para responderme.
        </label>
      </div>
      {err("consent") && <p className="text-sm text-[var(--faro-danger)]">{err("consent")}</p>}
      {status === "error" && !Object.keys(errors).length && (
        <p role="alert" className="text-sm text-[var(--faro-danger)]">No pudimos enviar el mensaje. Inténtalo de nuevo en unos minutos.</p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="h-12 rounded-button bg-faro-accent px-6 text-base font-semibold text-[var(--faro-accent-ink)] transition-transform active:scale-[0.98] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {status === "sending" ? "Enviando…" : "Enviar mensaje"}
      </button>
    </form>
  );
}
