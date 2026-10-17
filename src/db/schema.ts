import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/** Placeholder; the full data model lands in F01. */
export const schemaMeta = pgTable("schema_meta", {
  id: serial("id").primaryKey(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
