import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** Driver-agnostic Drizzle database (PGlite or postgres-js). */
export type AppDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export type Workspace = typeof schema.workspaces.$inferSelect;
export type NewWorkspace = typeof schema.workspaces.$inferInsert;
export type IcpProfile = typeof schema.icpProfiles.$inferSelect;
export type NewIcpProfile = typeof schema.icpProfiles.$inferInsert;
export type Hunt = typeof schema.hunts.$inferSelect;
export type NewHunt = typeof schema.hunts.$inferInsert;
export type Company = typeof schema.companies.$inferSelect;
export type NewCompany = typeof schema.companies.$inferInsert;
export type CompanySource = typeof schema.companySources.$inferSelect;
export type NewCompanySource = typeof schema.companySources.$inferInsert;
export type ContactPoint = typeof schema.contactPoints.$inferSelect;
export type NewContactPoint = typeof schema.contactPoints.$inferInsert;
export type FitAssessment = typeof schema.fitAssessments.$inferSelect;
export type NewFitAssessment = typeof schema.fitAssessments.$inferInsert;
export type Lead = typeof schema.leads.$inferSelect;
export type NewLead = typeof schema.leads.$inferInsert;
export type Message = typeof schema.messages.$inferSelect;
export type NewMessage = typeof schema.messages.$inferInsert;
export type LeadEvent = typeof schema.events.$inferSelect;
export type NewLeadEvent = typeof schema.events.$inferInsert;
export type Qualification = typeof schema.qualifications.$inferSelect;
export type NewQualification = typeof schema.qualifications.$inferInsert;
export type CostEntry = typeof schema.costEntries.$inferSelect;
export type NewCostEntry = typeof schema.costEntries.$inferInsert;
export type CostRate = typeof schema.costRates.$inferSelect;
export type NewCostRate = typeof schema.costRates.$inferInsert;
export type AdSpend = typeof schema.adSpend.$inferSelect;
export type NewAdSpend = typeof schema.adSpend.$inferInsert;
export type Suppression = typeof schema.suppression.$inferSelect;
export type NewSuppression = typeof schema.suppression.$inferInsert;
export type ApiCall = typeof schema.apiCalls.$inferSelect;
export type NewApiCall = typeof schema.apiCalls.$inferInsert;

export type SourceChannel = (typeof schema.sourceChannelEnum.enumValues)[number];
export type ContactChannel = (typeof schema.contactChannelEnum.enumValues)[number];
export type LeadStatus = (typeof schema.leadStatusEnum.enumValues)[number];
export type CostCategory = (typeof schema.costCategoryEnum.enumValues)[number];
