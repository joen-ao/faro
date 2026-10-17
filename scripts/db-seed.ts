import { createDb } from "../src/db/client";
import { migrate } from "../src/db/migrate";
import { seed } from "../src/db/seed";

const conn = createDb();
migrate(conn)
  .then(() => seed(conn.db))
  .then((r) => console.log(r.skippedDemo ? "seed: demo data already present" : `seed applied (${conn.kind}, all demo rows is_demo=true)`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => conn.close());
