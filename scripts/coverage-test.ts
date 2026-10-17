import "./load-env";
/**
 * F02: coverage test. Calls the REAL OSM/Overpass and datos.gov.co APIs (no key needed) and writes
 * reports/coverage.md. Failed sources are reported as failed, never invented.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ICPS, runIcp } from "../src/features/coverage/run";
import { renderReport, scoreIcp, type CoverageRun } from "../src/features/coverage/report";
import { createRealOverpass } from "../src/integrations/overpass/real";
import { createRealSocrata } from "../src/integrations/socrata/real";

async function main() {
  const overpass = createRealOverpass({ cacheDir: ".cache/overpass" });
  const socrata = createRealSocrata({ cacheDir: ".cache/socrata", appToken: process.env.SOCRATA_APP_TOKEN || undefined });
  const socrataNoCache = createRealSocrata({ appToken: process.env.SOCRATA_APP_TOKEN || undefined });
  const tz = "America/Bogota";
  const run: CoverageRun = { generatedAt: "", timeZone: tz, icps: [] };

  for (const icp of ICPS) {
    console.log(`> ${icp.title}`);
    const r = await runIcp(icp, { overpass, socrata, socrataNoCache });
    run.icps.push(r.report);
    for (const s of r.report.sources) console.log(`  ${s.label}: ${s.ok ? `${s.total} empresas` : `FALLÓ (${s.error})`}`);
  }

  run.generatedAt = new Date().toLocaleString("es-CO", { timeZone: tz, dateStyle: "long", timeStyle: "medium" });
  const scores = run.icps.map((i) => scoreIcp(i));
  const file = path.join(process.cwd(), "reports", "coverage.md");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, renderReport(run, scores));
  console.log(`Wrote ${file}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
