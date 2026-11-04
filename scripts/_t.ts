import "./load-env";
import { createDb } from "../src/db/client";
import type { AppDb } from "../src/db/types";
import { parseFilters, resolveWindow } from "../src/features/dashboard/filters";
import { getProspecting } from "../src/features/dashboard/prospecting";
async function main() {
  const conn = createDb();
  for (const sp of [{}, { periodo: "hoy" }, { periodo: "7", canal: "email", segmento: "empresas" }, { periodo: "90" }]) {
    const f = parseFilters(sp); const w = resolveWindow(f);
    const t = Date.now();
    const p = await getProspecting(conn.db as unknown as AppDb, f, w);
    console.log(JSON.stringify(sp), w.label, "|", Date.now() - t, "ms");
    console.log(" funnel", p.funnel.map((s) => `${s.key}=${s.value}`).join(" "), "| meetings", p.results.meetings.value, "spend", p.results.spend.value?.toFixed(2), "prev", p.results.spend.prev?.toFixed(2));
    console.log(" seg", JSON.stringify(p.breakdown.segment.map((r) => [r.label, r.contacted, r.openRate])), "trend", p.trend.length, w.bucket, "health", JSON.stringify({ ...p.health, today: undefined }));
  }
  await conn.close();
}
main();
