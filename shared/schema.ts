import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, timestamp, boolean, jsonb, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Organizations table - each organization is a separate tenant
export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  adminUserId: varchar("admin_user_id"), // Reference to the admin user
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // Links user to organization - nullable for super admin
  loanOfficerId: text("loan_officer_id").notNull(),
  password: text("password"),
  name: text("name").notNull(),
  role: text("role").notNull().default("loan_officer"), // "admin", "loan_officer", or "super_admin"
  isAdmin: boolean("is_admin").notNull().default(false), // Kept for backward compatibility
  isSuperAdmin: boolean("is_super_admin").notNull().default(false), // Platform super admin
  
  // First-time password setup fields
  requiresPasswordSetup: boolean("requires_password_setup").notNull().default(false), // User must set password on first login
  setupToken: text("setup_token"), // Secure token for password setup flow
  
  // Gamification fields
  totalPoints: integer("total_points").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActivityDate: timestamp("last_activity_date"),
  lastLoginDate: timestamp("last_login_date"),
  currentRank: integer("current_rank"),
  branchId: text("branch_id"), // For branch-level leaderboards
  dailyVisitTarget: integer("daily_visit_target").notNull().default(10), // Daily target for visit completions
}, (table) => ({
  // Composite unique constraint for multi-tenant isolation
  uniqueOrgLoanOfficer: unique().on(table.organizationId, table.loanOfficerId),
}));

export const clients = pgTable("clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // Links client to organization (nullable during migration)
  clientId: text("client_id").notNull(),
  name: text("name").notNull(),
  loanOfficerId: text("loan_officer_id").notNull(),
  managerId: text("manager_id"),
  outstanding: real("outstanding").notNull().default(0),
  outstandingAtRisk: real("outstanding_at_risk").notNull().default(0),
  parPerLoan: real("par_per_loan").notNull().default(0),
  lateDays: integer("late_days").notNull().default(0),
  totalDelayedInstalments: integer("total_delayed_instalments").notNull().default(0),
  paidInstalments: integer("paid_instalments").notNull().default(0),
  countReschedule: integer("count_reschedule").notNull().default(0),
  paymentMonthly: real("payment_monthly").notNull().default(0),
  isAtRisk: boolean("is_at_risk").notNull().default(false),
  riskScore: real("risk_score").notNull().default(0),
  lastVisitDate: timestamp("last_visit_date"),
  lastPhoneCallDate: timestamp("last_phone_call_date"),
  feedbackScore: integer("feedback_score").notNull().default(3),
  // Detailed feedback components
  paymentWillingness: integer("payment_willingness").default(3), // 1-5 scale
  financialSituation: integer("financial_situation").default(3), // 1-5 scale  
  communicationQuality: integer("communication_quality").default(3), // 1-5 scale
  complianceCooperation: integer("compliance_cooperation").default(3), // 1-5 scale
  futureOutlook: integer("future_outlook").default(3), // 1-5 scale
  visitNotes: text("visit_notes"), // Free text notes from the visit
  compositeUrgency: real("composite_urgency").notNull().default(0),
  urgencyClassification: text("urgency_classification").notNull().default("Low Urgency"),
  urgencyBreakdown: jsonb("urgency_breakdown").$type<{
    riskScore: { value: number; scaledValue: number; weight: number; normalizedWeight: number; contribution: number };
    daysSinceInteraction: { value: number; scaledValue: number; weight: number; normalizedWeight: number; contribution: number };
    feedbackScore: { value: number; scaledValue: number; weight: number; normalizedWeight: number; contribution: number };
  }>(),
  actionSuggestions: jsonb("action_suggestions").$type<{
    action: 'call' | 'visit' | 'email' | 'restructure' | 'monitor' | 'escalate';
    description: string;
    urgency: 'immediate' | 'within_3_days' | 'within_week' | 'within_month';
    reasoning: string;
  }[]>(),
  // Snooze functionality
  snoozedUntil: timestamp("snoozed_until"),
  snoozedBy: text("snoozed_by"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
}, (table) => ({
  // Composite unique constraint for multi-tenant client isolation
  uniqueOrgClientId: unique().on(table.organizationId, table.clientId),
  // Performance indexes for fast multi-tenant lookups and sorting
  organizationIdIdx: index("clients_organization_id_idx").on(table.organizationId),
  loanOfficerIdIdx: index("clients_loan_officer_id_idx").on(table.loanOfficerId),
  orgOfficerIdx: index("clients_org_officer_idx").on(table.organizationId, table.loanOfficerId),
  // Composite indexes for tenant-scoped sorting (organizationId must be first for efficiency)
  orgUrgencyIdx: index("clients_org_urgency_idx").on(table.organizationId, table.compositeUrgency),
  orgRiskScoreIdx: index("clients_org_risk_score_idx").on(table.organizationId, table.riskScore),
}));

export const visits = pgTable("visits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // Links visit to organization (nullable during migration)
  clientId: text("client_id").notNull(),
  loanOfficerId: text("loan_officer_id").notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled, completed, cancelled
  notes: text("notes"),
  completedAt: timestamp("completed_at"), // Timestamp when visit was marked as completed
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const phoneCalls = pgTable("phone_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // Links phone call to organization (nullable during migration)
  clientId: text("client_id").notNull(),
  loanOfficerId: text("loan_officer_id").notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  scheduledTime: text("scheduled_time").notNull(),
  status: text("status").notNull().default("scheduled"), // scheduled, completed, cancelled
  callType: text("call_type").notNull().default("follow_up"), // follow_up, collection, check_in, emergency
  duration: integer("duration"), // in minutes, filled when completed
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const dataSync = pgTable("data_sync", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // Links sync to organization (null for system-wide syncs)
  lastSyncTime: timestamp("last_sync_time").notNull().default(sql`now()`),
  status: text("status").notNull().default("success"), // success, error, in_progress
  errorMessage: text("error_message"),
  recordsProcessed: integer("records_processed").notNull().default(0),
  progressPercentage: real("progress_percentage").default(0),
  currentStep: text("current_step"),
  provisionedUsers: jsonb("provisioned_users").$type<Array<{
    loanOfficerId: string;
    defaultPassword: string;
    name: string;
  }>>(), // Auto-provisioned loan officer accounts during upload
  provisioningErrors: jsonb("provisioning_errors").$type<string[]>(), // Errors during user provisioning
});

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // Settings now scoped to organization (nullable during migration)
  loanOfficerId: text("loan_officer_id"), // Now optional - can be org-level or user-level
  
  // Risk Score Component Weights (should total 100)
  riskLateDaysWeight: real("risk_late_days_weight").notNull().default(25),
  riskOutstandingAtRiskWeight: real("risk_outstanding_at_risk_weight").notNull().default(20),
  riskParPerLoanWeight: real("risk_par_per_loan_weight").notNull().default(20),
  riskReschedulesWeight: real("risk_reschedules_weight").notNull().default(15),
  riskPaymentConsistencyWeight: real("risk_payment_consistency_weight").notNull().default(10),
  riskDelayedInstalmentsWeight: real("risk_delayed_instalments_weight").notNull().default(10),
  
  // Urgency Score Component Weights (should total 100)
  urgencyRiskScoreWeight: real("urgency_risk_score_weight").notNull().default(50),
  urgencyDaysSinceVisitWeight: real("urgency_days_since_visit_weight").notNull().default(40),
  urgencyFeedbackScoreWeight: real("urgency_feedback_score_weight").notNull().default(10),
  
  // Feedback Score Component Weights (should total 100)
  feedbackPaymentWillingnessWeight: real("feedback_payment_willingness_weight").notNull().default(30),
  feedbackFinancialSituationWeight: real("feedback_financial_situation_weight").notNull().default(25),
  feedbackCommunicationQualityWeight: real("feedback_communication_quality_weight").notNull().default(15),
  feedbackComplianceCooperationWeight: real("feedback_compliance_cooperation_weight").notNull().default(20),
  feedbackFutureOutlookWeight: real("feedback_future_outlook_weight").notNull().default(10),
  
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

// Gamification Tables
export const gamificationRules = pgTable("gamification_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // Organization-specific rules (null for global rules)
  eventType: text("event_type").notNull(), // visit_completed, high_nps, risk_improved, loan_recovered, etc.
  pointValue: integer("point_value").notNull().default(0),
  description: text("description").notNull(),
  autoApprovalThreshold: integer("auto_approval_threshold").notNull().default(100), // Points threshold for auto-approval
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at").notNull().default(sql`now()`),
});

export const gamificationSeasons = pgTable("gamification_seasons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // Seasons scoped to organization (nullable during migration)
  name: text("name").notNull(), // e.g., "Q4 2025"
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  visibilityScope: text("visibility_scope").notNull().default("company"), // company, branch
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const gamificationEvents = pgTable("gamification_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // Events scoped to organization (nullable during migration)
  loanOfficerId: text("loan_officer_id").notNull(),
  eventType: text("event_type").notNull(),
  pointsAwarded: integer("points_awarded").notNull(),
  status: text("status").notNull().default("approved"), // pending, approved, rejected
  metadata: jsonb("metadata").$type<{
    clientId?: string;
    clientName?: string;
    visitId?: string;
    feedbackScore?: number;
    riskImprovement?: number;
    loanRecovered?: number;
    [key: string]: any;
  }>(),
  seasonId: varchar("season_id"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
  reviewedAt: timestamp("reviewed_at"),
  reviewedBy: text("reviewed_by"),
});

export const gamificationBadges = pgTable("gamification_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // Organization-specific badges (null for global badges)
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(), // emoji or icon name
  achievementType: text("achievement_type").notNull(), // visits_count, points_total, streak_days, high_nps_count, rank_achievement
  thresholdValue: integer("threshold_value").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const gamificationUserBadges = pgTable("gamification_user_badges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"), // User badges scoped to organization (nullable during migration)
  loanOfficerId: text("loan_officer_id").notNull(),
  badgeId: varchar("badge_id").notNull(),
  unlockedAt: timestamp("unlocked_at").notNull().default(sql`now()`),
});

export const streakHistory = pgTable("streak_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(), // Organization isolation
  loanOfficerId: text("loan_officer_id").notNull(),
  date: timestamp("date").notNull(), // The date for this streak record
  visitsCompleted: integer("visits_completed").notNull().default(0), // Number of visits completed that day
  visitsTarget: integer("visits_target").notNull(), // Daily target for that day
  targetMet: boolean("target_met").notNull().default(false), // Whether target was met
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  // Composite unique constraint - one record per user per day
  uniqueOrgUserDate: unique().on(table.organizationId, table.loanOfficerId, table.date),
  // Indexes for fast querying
  organizationIdIdx: index("streak_history_organization_id_idx").on(table.organizationId),
  orgUserIdx: index("streak_history_org_user_idx").on(table.organizationId, table.loanOfficerId),
  dateIdx: index("streak_history_date_idx").on(table.date),
}));

export const pageAnalytics = pgTable("page_analytics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(), // Organization for multi-tenant isolation
  userId: varchar("user_id").notNull(), // User who visited the page
  loanOfficerId: text("loan_officer_id").notNull(), // For easier querying by loan officer
  pageName: text("page_name").notNull(), // e.g., "Dashboard", "Calendar", "Client Details"
  pageRoute: text("page_route").notNull(), // e.g., "/dashboard", "/calendar", "/client/:id"
  timeSpent: integer("time_spent").notNull().default(0), // Time spent in seconds
  sessionId: text("session_id"), // Optional session identifier
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  // Indexes for fast querying by organization and user
  organizationIdIdx: index("page_analytics_organization_id_idx").on(table.organizationId),
  userIdIdx: index("page_analytics_user_id_idx").on(table.userId),
  orgUserIdx: index("page_analytics_org_user_idx").on(table.organizationId, table.userId),
  createdAtIdx: index("page_analytics_created_at_idx").on(table.createdAt),
}));

export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(), // Organization for multi-tenant isolation
  loanOfficerId: text("loan_officer_id").notNull(), // Which loan officer's portfolio
  snapshotDate: timestamp("snapshot_date").notNull(), // Date of the snapshot
  month: text("month").notNull(), // Month label (e.g., "Jan 2025")
  totalClients: integer("total_clients").notNull().default(0), // Number of clients
  totalOutstanding: real("total_outstanding").notNull().default(0), // Total outstanding amount
  avgRiskScore: real("avg_risk_score").notNull().default(0), // Average risk score
  totalVisits: integer("total_visits").notNull().default(0), // Total number of visits
  completedVisits: integer("completed_visits").notNull().default(0), // Number of completed visits
  highRiskClients: integer("high_risk_clients").notNull().default(0), // Count of high risk clients (>70)
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
}, (table) => ({
  // Indexes for fast querying by organization and loan officer
  organizationIdIdx: index("portfolio_snapshots_organization_id_idx").on(table.organizationId),
  loanOfficerIdIdx: index("portfolio_snapshots_loan_officer_id_idx").on(table.loanOfficerId),
  orgOfficerIdx: index("portfolio_snapshots_org_officer_idx").on(table.organizationId, table.loanOfficerId),
  snapshotDateIdx: index("portfolio_snapshots_snapshot_date_idx").on(table.snapshotDate),
  orgOfficerDateIdx: index("portfolio_snapshots_org_officer_date_idx").on(table.organizationId, table.loanOfficerId, table.snapshotDate),
}));

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
});

export const insertClientSchema = createInsertSchema(clients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVisitSchema = createInsertSchema(visits).omit({
  id: true,
  createdAt: true,
});

export const insertPhoneCallSchema = createInsertSchema(phoneCalls).omit({
  id: true,
  createdAt: true,
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const updateSettingsSchema = z.object({
  // Risk Score Component Weights (should total 100)
  riskLateDaysWeight: z.number().min(0).max(100).optional(),
  riskOutstandingAtRiskWeight: z.number().min(0).max(100).optional(),
  riskParPerLoanWeight: z.number().min(0).max(100).optional(),
  riskReschedulesWeight: z.number().min(0).max(100).optional(),
  riskPaymentConsistencyWeight: z.number().min(0).max(100).optional(),
  riskDelayedInstalmentsWeight: z.number().min(0).max(100).optional(),
  
  // Urgency Score Component Weights (should total 100)
  urgencyRiskScoreWeight: z.number().min(0).max(100).optional(),
  urgencyDaysSinceVisitWeight: z.number().min(0).max(100).optional(),
  urgencyFeedbackScoreWeight: z.number().min(0).max(100).optional(),
  
  // Feedback Score Component Weights (should total 100)
  feedbackPaymentWillingnessWeight: z.number().min(0).max(100).optional(),
  feedbackFinancialSituationWeight: z.number().min(0).max(100).optional(),
  feedbackCommunicationQualityWeight: z.number().min(0).max(100).optional(),
  feedbackComplianceCooperationWeight: z.number().min(0).max(100).optional(),
  feedbackFutureOutlookWeight: z.number().min(0).max(100).optional(),
});

export const updateClientFeedbackSchema = z.object({
  clientId: z.string(),
  lastVisitDate: z.string().optional(),
  lastPhoneCallDate: z.string().optional(),
  feedbackScore: z.number().min(1).max(5),
  // Detailed feedback components
  paymentWillingness: z.number().min(1).max(5).optional(),
  financialSituation: z.number().min(1).max(5).optional(),
  communicationQuality: z.number().min(1).max(5).optional(),
  complianceCooperation: z.number().min(1).max(5).optional(),
  futureOutlook: z.number().min(1).max(5).optional(),
  visitNotes: z.string().optional(),
});

export const insertGamificationRuleSchema = createInsertSchema(gamificationRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGamificationSeasonSchema = createInsertSchema(gamificationSeasons).omit({
  id: true,
  createdAt: true,
});

export const insertGamificationEventSchema = createInsertSchema(gamificationEvents).omit({
  id: true,
  createdAt: true,
  reviewedAt: true,
});

export const insertGamificationBadgeSchema = createInsertSchema(gamificationBadges).omit({
  id: true,
  createdAt: true,
});

export const insertGamificationUserBadgeSchema = createInsertSchema(gamificationUserBadges).omit({
  id: true,
  unlockedAt: true,
});

export const insertStreakHistorySchema = createInsertSchema(streakHistory).omit({
  id: true,
  createdAt: true,
});

export const insertPageAnalyticsSchema = createInsertSchema(pageAnalytics).omit({
  id: true,
  createdAt: true,
});

export const insertPortfolioSnapshotSchema = createInsertSchema(portfolioSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;
export type InsertVisit = z.infer<typeof insertVisitSchema>;
export type Visit = typeof visits.$inferSelect;
export type InsertPhoneCall = z.infer<typeof insertPhoneCallSchema>;
export type PhoneCall = typeof phoneCalls.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settings.$inferSelect;
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;
export type UpdateClientFeedback = z.infer<typeof updateClientFeedbackSchema>;
export type DataSync = typeof dataSync.$inferSelect;

export type InsertGamificationRule = z.infer<typeof insertGamificationRuleSchema>;
export type GamificationRule = typeof gamificationRules.$inferSelect;
export type InsertGamificationSeason = z.infer<typeof insertGamificationSeasonSchema>;
export type GamificationSeason = typeof gamificationSeasons.$inferSelect;
export type InsertGamificationEvent = z.infer<typeof insertGamificationEventSchema>;
export type GamificationEvent = typeof gamificationEvents.$inferSelect;
export type InsertGamificationBadge = z.infer<typeof insertGamificationBadgeSchema>;
export type GamificationBadge = typeof gamificationBadges.$inferSelect;
export type InsertGamificationUserBadge = z.infer<typeof insertGamificationUserBadgeSchema>;
export type GamificationUserBadge = typeof gamificationUserBadges.$inferSelect;
export type InsertStreakHistory = z.infer<typeof insertStreakHistorySchema>;
export type StreakHistory = typeof streakHistory.$inferSelect;
export type InsertPageAnalytics = z.infer<typeof insertPageAnalyticsSchema>;
export type PageAnalytics = typeof pageAnalytics.$inferSelect;
export type InsertPortfolioSnapshot = z.infer<typeof insertPortfolioSnapshotSchema>;
export type PortfolioSnapshot = typeof portfolioSnapshots.$inferSelect;
