import { describe, expect, it } from "vitest";
import { createRealSocrata, createSocrataSource } from "@/integrations/socrata";

// Live smoke test against datos.gov.co. Skipped unless RUN_LIVE=1.
describe.skipIf(process.env.RUN_LIVE !== "1")("socrata live", () => {
  it("RUES dental Bogotá and REPS dental return legal entities only", async () => {
    const src = createSocrataSource(createRealSocrata({ appToken: process.env.SOCRATA_APP_TOKEN || undefined }));
    const rues = await src.searchRues({ ciiu: ["8622"], camara: "BOGOTA" });
    const reps = await src.searchReps({ municipio: "BOGOTA", service: "dental" });
    console.log(
      `LIVE rues rows=${rues.totalRows} kept=${rues.companies.length} excluded=${JSON.stringify(rues.excluded)} | ` +
        `reps rows=${reps.totalRows} kept=${reps.companies.length} excluded=${JSON.stringify(reps.excluded)}`,
    );
    expect(rues.companies.length).toBeGreaterThan(100);
    expect(reps.companies.length).toBeGreaterThan(50);
    for (const c of [...rues.companies, ...reps.companies]) {
      expect(c.isLegalEntity && !c.possibleNaturalPerson && !c.isMock).toBe(true);
    }
  }, 180_000);
});
