import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { contacts } from "@shared/schema";

export const meetings = pgTable("meetings", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  date: timestamp("date").notNull(),
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
