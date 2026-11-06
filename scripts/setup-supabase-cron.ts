/**
 * F47 · Schedules Faro's WhatsApp agent jobs inside Supabase (pg_cron + pg_net), every 10 minutes.
 * The CRON_SECRET goes to Supabase Vault and the job reads it on each run, so it is never in the job text or the repo.
 *   npm run cron:supabase          # create or update
 *   npm run cron:supabase -- --off # unschedule
 */
import "./load-env";
import postgres from "postgres";

const JOB = "faro-wa-agent";
const SECRET_NAME = "faro_cron_secret";
const SCHEDULE = "*/10 * * * *";
const URL_BASE = (process.env.FARO_URL || "https://faro-eight-sage.vercel.app").replace(/\/+$/, "");

/** The job's SQL: no secret inside, only the Vault lookup. */
export function jobCommand(url: string): string {
  return `select net.http_get(
  url := '${url}/api/cron/wa-agent',
  headers := jsonb_build_object('Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = '${SECRET_NAME}')),
  timeout_milliseconds := 60000
);`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is empty: pg_cron only exists in Supabase, not in local PGlite.");
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    if (process.argv.includes("--off")) {
      await sql`select cron.unschedule(jobid) from cron.job where jobname = ${JOB}`;
      console.log(`${JOB}: unscheduled`);
      return;
    }
    const secret = process.env.CRON_SECRET;
    if (!secret || secret.length < 16) throw new Error("CRON_SECRET is missing (add the same value as in Vercel to .env.local).");

    await sql`create extension if not exists pg_cron`;
    await sql`create extension if not exists pg_net`;

    const [existing] = await sql<{ id: string }[]>`select id from vault.secrets where name = ${SECRET_NAME}`;
    if (existing) await sql`select vault.update_secret(${existing.id}::uuid, ${secret})`;
    else await sql`select vault.create_secret(${secret}, ${SECRET_NAME}, 'Faro CRON_SECRET for /api/cron/wa-agent')`;

    // cron.schedule with an existing name replaces that job.
    await sql`select cron.schedule(${JOB}, ${SCHEDULE}, ${jobCommand(URL_BASE)})`;

    const [job] = await sql<{ schedule: string; active: boolean; command: string }[]>`select schedule, active, command from cron.job where jobname = ${JOB}`;
    console.log(`${JOB}: ${job?.active ? "active" : "inactive"}, ${job?.schedule}, calls ${URL_BASE}/api/cron/wa-agent`);
    if (job?.command.includes(secret)) throw new Error("the job text contains the secret");

    const recent = await sql<{ status_code: number | null; created: Date; error_msg: string | null }[]>`
      select status_code, created, error_msg from net._http_response order by created desc limit 3`;
    for (const r of recent) console.log(`  last response: ${r.status_code ?? "-"} at ${r.created.toISOString()}${r.error_msg ? ` (${r.error_msg.slice(0, 80)})` : ""}`);
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
