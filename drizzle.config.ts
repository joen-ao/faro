import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  ...(url ? { dbCredentials: { url } } : { driver: "pglite", dbCredentials: { url: "./.pglite" } }),
});
