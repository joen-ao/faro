import { createDb } from "../src/db/client";
import { migrate } from "../src/db/migrate";

const conn = createDb();
migrate(conn)
  .then(() => console.log(`migrations applied (${conn.kind})`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => conn.close());
