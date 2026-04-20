import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod";

// --- Shared constants (single source of truth for valid values) ---
export const STAGES = ["LEAD", "MEETING", "PROPOSAL", "NEGOTIATION", "LIVE", "PASS", "RELATIONSHIP"] as const;
export const STATUSES = ["ACTIVE", "HOLD"] as const;
export const INTERACTION_TYPES = ["note", "meeting", "email", "call"] as const;
export const TASK_TYPES = ["task", "meeting"] as const;
export const SEVERITIES = ["info", "warning", "critical"] as const;
export const MEETING_TYPES = ["call", "video", "in-person", "coffee"] as const;
export const CONDITION_TYPES = [
  "no_interaction_for_days",
  "followup_past_due",
  "no_followup_after_meeting",
  "meeting_within_hours",
  "status_is",
  "stage_is",
] as const;
export const EXCEPTION_TYPES = ["has_future_followup", "stage_in"] as const;

// User model — single user, PIN auth + settings
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  pin: text("pin").notNull(),
  apiKey: text("api_key").notNull(),
  mcpToken: text("mcp_token").notNull().default(""),
  orgName: text("org_name").notNull().default("Claw CRM"),
  primaryColor: text("primary_color").notNull().default("#2bbcb3"),
  upcomingDays: integer("upcoming_days").notNull().default(7),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;

// Companies
export const companies = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  website: text("website"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCompanySchema = createInsertSchema(companies).omit({ id: true, createdAt: true });
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companies.$inferSelect;

// Contacts
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  title: text("title"),
  email: text("email"),
  phone: text("phone"),
  website: text("website"),
  linkedinUrl: text("linkedin_url"),
  location: text("location"),
  background: text("background"),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | HOLD
  stage: text("stage").notNull().default("LEAD"), // LEAD | MEETING | PROPOSAL | NEGOTIATION | LIVE | PASS | RELATIONSHIP
  companyId: integer("company_id").references(() => companies.id),
  sortOrder: integer("sort_order").notNull().default(0),
  source: text("source"),
  additionalContacts: text("additional_contacts"),
  cadence: text("cadence"),
  relationshipJournal: text("relationship_journal"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// Interactions
export const interactions = pgTable("interactions", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull().default("note"), // note | meeting | email | call
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInteractionSchema = createInsertSchema(interactions).omit({ id: true, createdAt: true });
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;
export type Interaction = typeof interactions.$inferSelect;

// Items (follow-ups, meetings, etc. — unified by type)
export const followups = pgTable("followups", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  type: text("type").notNull().default("task"), // task | meeting | (plugin-defined)
  dueDate: timestamp("due_date").notNull(),
  content: text("content").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  time: text("time"), // e.g. "2:00 PM" — for meetings
  location: text("location"), // e.g. "Century City" — for meetings
  metadata: jsonb("metadata"), // plugin-specific data
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFollowupSchema = createInsertSchema(followups).omit({
  id: true,
  completedAt: true,
  cancelledAt: true,
  createdAt: true,
});
export type InsertFollowup = z.infer<typeof insertFollowupSchema>;
export type Followup = typeof followups.$inferSelect;

// Rules
export const rules = pgTable("rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  condition: jsonb("condition").notNull(),
  action: jsonb("action").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  lastEvaluatedAt: timestamp("last_evaluated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRuleSchema = createInsertSchema(rules).omit({
  id: true,
  lastEvaluatedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type Rule = typeof rules.$inferSelect;

// Rule violations
export const ruleViolations = pgTable("rule_violations", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id")
    .notNull()
    .references(() => rules.id, { onDelete: "cascade" }),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  severity: text("severity").notNull().default("warning"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRuleViolationSchema = createInsertSchema(ruleViolations).omit({
  id: true,
  resolvedAt: true,
  createdAt: true,
});
export type InsertRuleViolation = z.infer<typeof insertRuleViolationSchema>;
export type RuleViolation = typeof ruleViolations.$inferSelect;

// Briefings — one per contact, stores prep notes
export const briefings = pgTable("briefings", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBriefingSchema = createInsertSchema(briefings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBriefing = z.infer<typeof insertBriefingSchema>;
export type Briefing = typeof briefings.$inferSelect;

// Contact journal revisions — pre-write snapshots of relationship_journal, kept forever
export const contactJournalRevisions = pgTable("contact_journal_revisions", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  source: text("source").notNull(), // "agent" | "user"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ContactJournalRevision = typeof contactJournalRevisions.$inferSelect;

// Activity log — tracks all system and agent actions
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  detail: text("detail").notNull(),
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("system"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ActivityLogEntry = typeof activityLog.$inferSelect;

// Composite type — contact with all related data
export type ContactWithRelations = Contact & {
  company: Company | null;
  interactions: Interaction[];
  followups: Followup[];
  violations: RuleViolation[];
  briefing?: Briefing | null;
};
