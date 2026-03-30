import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User model — single user, PIN auth
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  pin: text("pin").notNull(),
  apiKey: text("api_key").notNull(),
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
  location: text("location"),
  background: text("background"),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | HOLD
  stage: text("stage").notNull().default("LEAD"), // LEAD | MEETING | PROPOSAL | NEGOTIATION | LIVE | PASS | RELATIONSHIP
  companyId: integer("company_id").references(() => companies.id),
  sortOrder: integer("sort_order").notNull().default(0),
  source: text("source"),
  additionalContacts: text("additional_contacts"),
  cadence: text("cadence"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

// Interactions
export const interactions = pgTable("interactions", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
  content: text("content").notNull(),
  type: text("type").notNull().default("note"), // note | meeting | email | call
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInteractionSchema = createInsertSchema(interactions).omit({ id: true, createdAt: true });
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;
export type Interaction = typeof interactions.$inferSelect;

// Follow-ups
export const followups = pgTable("followups", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  dueDate: timestamp("due_date").notNull(),
  content: text("content").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertFollowupSchema = createInsertSchema(followups).omit({ id: true, completedAt: true, createdAt: true });
export type InsertFollowup = z.infer<typeof insertFollowupSchema>;
export type Followup = typeof followups.$inferSelect;

// Meetings
export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(), // date + time combined
  type: text("type").notNull().default("call"), // call | video | in-person | coffee
  location: text("location"),
  notes: text("notes"),
  completed: boolean("completed").notNull().default(false),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({ id: true, cancelledAt: true, createdAt: true });
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetings.$inferSelect;

// Briefings — one per contact (upsert)
export const briefings = pgTable("briefings", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBriefingSchema = createInsertSchema(briefings).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBriefing = z.infer<typeof insertBriefingSchema>;
export type Briefing = typeof briefings.$inferSelect;

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

export const insertRuleSchema = createInsertSchema(rules).omit({ id: true, lastEvaluatedAt: true, createdAt: true, updatedAt: true });
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type Rule = typeof rules.$inferSelect;

// Rule violations
export const ruleViolations = pgTable("rule_violations", {
  id: serial("id").primaryKey(),
  ruleId: integer("rule_id").notNull().references(() => rules.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  severity: text("severity").notNull().default("warning"), // info | warning | critical
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRuleViolationSchema = createInsertSchema(ruleViolations).omit({ id: true, resolvedAt: true, createdAt: true });
export type InsertRuleViolation = z.infer<typeof insertRuleViolationSchema>;
export type RuleViolation = typeof ruleViolations.$inferSelect;

// Activity log — audit trail for system, agent, and user actions
export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(), // "rule.evaluated", "meeting.created", "contact.updated", etc.
  detail: text("detail").notNull(), // human-readable description
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("system"), // "system", "agent", "user", "rule:1"
  metadata: jsonb("metadata"), // structured data for troubleshooting
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ActivityLogEntry = typeof activityLog.$inferSelect;

// Composite types for API responses
export type ContactWithRelations = Contact & {
  company: Company | null;
  interactions: Interaction[];
  followups: Followup[];
  violations: RuleViolation[];
  meetings: Meeting[];
  briefing: Briefing | null;
};
