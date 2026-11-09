import "./load-env";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { coldEmailHtml } from "../src/features/outreach/email-html";
import { getReadyDb } from "../src/db/client";
import type { AppDb } from "../src/db/types";
import { coldEligibility, loadLeadContext, previewOutreach } from "../src/features/outreach/service";
import { dailyCandidates } from "../src/features/outreach/daily";
import { bodyWords } from "../src/features/outreach/cold-email";
import { getOutreachAnthropic } from "../src/integrations/anthropic";
import { createMockEmail } from "../src/integrations/email";
import { getEnv } from "../src/lib/env";

// F48 · Review batch: generates cold emails for eligible leads WITHOUT sending or queueing anything.
// Usage: npx tsx scripts/preview-cold-batch.ts [--n 15] [--app-url https://…]
// Only side effect: AI cost rows (one Haiku/Sonnet call per email, two when the verifier rejects the first draft).
const argv = process.argv;
const val = (k: string) => (argv.indexOf(k) > 0 ? argv[argv.indexOf(k) + 1] : undefined);
const n = Number(val("--n") ?? 15);
const outName = val("--out") ?? null;
const onlySegments = val("--segments")?.split(",") ?? null;
const appUrl = val("--app-url") ?? "https://faro-eight-sage.vercel.app";

async function main() {
  const db = (await getReadyDb()) as unknown as AppDb;
  const env = { ...getEnv(), NEXT_PUBLIC_APP_URL: appUrl, SENDER_LEGAL_NAME: "Mokub, NIT 1001975274-1", SENDER_ADDRESS: "Bogotá", SEND_ENABLED: false } as ReturnType<typeof getEnv>;
  const now = new Date();
  const pool = await dailyCandidates(db, { enabled: true, emailsPerDay: 100, huntIds: null }, 1000);
  const byFinding = new Map<string, string[]>();
  for (const id of pool) {
    const e = coldEligibility(await loadLeadContext(db, id), now);
    if (e.ok && (!onlySegments || onlySegments.includes(e.segment.id))) {
      const k = onlySegments ? e.segment.id : e.finding;
      byFinding.set(k, [...(byFinding.get(k) ?? []), id]);
    }
  }
  // Round-robin across findings so every kind of email shows up in the batch.
  const picked: string[] = [];
  const queues = [...byFinding.values()];
  while (picked.length < n && queues.some((q) => q.length)) for (const q of queues) if (q.length && picked.length < n) picked.push(q.shift()!);

  const gallery: string[] = [];
  const logo = `data:image/png;base64,${readFileSync("public/brand/mokub-logo-white.png").toString("base64")}`;
  const out: string[] = [`# Lote de prueba F48 · ${now.toISOString().slice(0, 10)}`, "", `Generado sin enviar ni encolar. ${picked.length} correos. Pie legal con Mokub, NIT 1001975274-1.`, ""];
  let i = 0;
  for (const leadId of picked) {
    i++;
    const ctx = await loadLeadContext(db, leadId);
    const e = coldEligibility(ctx, now);
    try {
      const p = await previewOutreach(db, { leadId, channel: "email", generate: true, refresh: true }, { ai: getOutreachAnthropic(env), email: createMockEmail(), env }, now);
      const m = p.message!;
      out.push(
        `## ${i}. ${ctx.company.name} · ${ctx.company.city ?? "sin ciudad"}`,
        "",
        `- Hallazgo: \`${e.ok ? e.finding : e.reason}\` · Web: ${ctx.company.website ?? "—"} · Para: ${p.recipient}`,
        `- Palabras sobre la firma: ${bodyWords(m.text)} · IA mock: ${p.isMockAi ? "sí" : "no"}`,
        `- Página /d: ${m.diagnosticUrl}`,
        "",
        `**Asunto:** ${m.subject}`,
        "",
        "```text",
        m.text,
        "```",
        "",
      );
      gallery.push(`<div style="font:13px system-ui;color:#444;margin:28px auto 6px;max-width:600px"><b>${i}. Asunto:</b> ${m.subject.replace(/</g, "&lt;")} · ${bodyWords(m.text)} palabras</div>${coldEmailHtml(m.text, { logoUrl: logo, whatsapp: env.NEXT_PUBLIC_WHATSAPP_NUMBER, photoUrl: env.SENDER_PERSON_PHOTO_URL ?? null })}`);
      console.log(`${i}/${picked.length} ok ${ctx.company.name}`);
    } catch (err) {
      out.push(`## ${i}. ${ctx.company.name}`, "", `Error: ${err instanceof Error ? err.message : String(err)}`, "");
      console.error(`${i} error ${ctx.company.name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  mkdirSync("docs/review", { recursive: true });
  const file = outName ?? `docs/review/lote-prueba-f48-${now.toISOString().slice(0, 10)}.md`;
  writeFileSync(file, out.join("\n"));
  mkdirSync("docs/review/preview", { recursive: true });
  writeFileSync("docs/review/preview/lote.html", `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lote de correos</title><body style="margin:0;padding:8px;background:#dde1e7">${gallery.join("")}</body>`);
  console.log(`Escrito ${file} · por hallazgo: ${JSON.stringify(Object.fromEntries([...byFinding].map(([k, v]) => [k, v.length])))}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
