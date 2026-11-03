-- F31 · Purge every demo row (irreversible; requested by the owner). Idempotent and safe on empty tables.
-- The is_demo / is_mock columns stay: they still keep mock-adapter rows out of real totals.
-- Children first; leads/companies cascade to messages, events, qualifications, cost_entries,
-- company_sources, contact_points and fit_assessments.
DELETE FROM "ad_actions" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "ad_recommendations" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "ad_learnings" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "ad_variants" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "ad_spend" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "cost_entries" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "qualifications" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "events" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "leads" WHERE "is_demo" = true;--> statement-breakpoint
DELETE FROM "companies" WHERE "is_demo" = true;--> statement-breakpoint
-- The seeded demo workspaces (db:seed, /app/hunts/demo, /app/hunts/demo/outreach), only if no lead is left
-- under them; cascades to their icp_profiles and hunts.
DELETE FROM "workspaces" w
WHERE w."name" IN ('Demo Workspace', 'Demo Workspace F19')
  AND NOT EXISTS (
    SELECT 1 FROM "icp_profiles" i
    JOIN "hunts" h ON h."icp_profile_id" = i."id"
    JOIN "leads" l ON l."hunt_id" = h."id"
    WHERE i."workspace_id" = w."id"
  );
