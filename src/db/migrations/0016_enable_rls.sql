ALTER TABLE "ad_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_insights" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_learnings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_recommendations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_spend" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ad_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "companies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "company_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_points" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fit_assessments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "hunts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "icp_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "qualifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppression" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- F34: any other table in public (e.g. created by hand in the Supabase panel) also gets RLS.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END $$;--> statement-breakpoint
-- F34: Supabase's REST API roles get nothing in public (skipped where they don't exist, e.g. PGlite).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', r);
    END IF;
  END LOOP;
END $$;
