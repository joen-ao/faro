import "./load-env";
import { createDb } from "../src/db/client";
import { migrate } from "../src/db/migrate";
import { seedCostRates } from "../src/db/seed";

// F31: no demo data anymore. Only the default cost rates (real configuration).
const conn = createDb();
migrate(conn)
  .then(() => seedCostRates(conn.db))
  .then(() => console.log(`seed applied (${conn.kind}): default cost_rates`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => conn.close());
