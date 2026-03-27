import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User model — single user, PIN auth
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  pin: text("pin").notNull(), // hashed PIN
  apiKey: text("api_key").notNull(), // for MCP/agent access
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

export const insertCompanySchema = createInsertSchema(companies).omit({
  id: true,
  createdAt: true,
});

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
  background: text("background"), // free text notes
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | HOLD | PASS
  stage: text("stage").notNull().default("LEAD"), // LEAD | MEETING | PROPOSAL | NEGOTIATION | LIVE | HOLD | PASS | RELATIONSHIP
  companyId: integer("company_id").references(() => companies.id),
  sortOrder: integer("sort_order").notNull().default(0),
  source: text("source"), // referral source
  additionalContacts: text("additional_contacts"), // secondary contacts info
  cadence: text("cadence"), // e.g., "Weekly (Wednesdays)"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

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

export const insertInteractionSchema = createInsertSchema(interactions).omit({
  id: true,
  createdAt: true,
});

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

export const insertFollowupSchema = createInsertSchema(followups).omit({
  id: true,
  completedAt: true,
  createdAt: true,
});

export type InsertFollowup = z.infer<typeof insertFollowupSchema>;
export type Followup = typeof followups.$inferSelect;

// Rules — business logic stored as data
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
  ruleId: integer("rule_id").notNull().references(() => rules.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  severity: text("severity").notNull().default("warning"), // info | warning | critical
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

// Composite types for API responses
export type ContactWithRelations = Contact & {
  company: Company | null;
  interactions: Interaction[];
  followups: Followup[];
  violations: RuleViolation[];
};
