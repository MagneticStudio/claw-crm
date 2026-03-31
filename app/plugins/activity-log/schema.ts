import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { contacts } from "@shared/schema";

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
