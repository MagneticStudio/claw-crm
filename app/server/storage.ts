import {
  users, type User,
  companies, type Company, type InsertCompany,
  contacts, type Contact, type InsertContact, type ContactWithRelations,
  interactions, type Interaction, type InsertInteraction,
  followups, type Followup, type InsertFollowup,
  rules, type Rule, type InsertRule,
  ruleViolations, type RuleViolation, type InsertRuleViolation,
  activityLog,
} from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { pool } from "./db";
import { eq, desc, asc, and, isNull, lte, gte } from "drizzle-orm";
import { sseManager } from "./sse";
import { getPlugins } from "../plugins";

// Lazy import to avoid circular dependency
let evaluateRulesForContact: ((contactId: number) => Promise<void>) | null = null;
async function triggerRulesEvaluation(contactId: number) {
  if (!evaluateRulesForContact) {
    const module = await import("./rules-engine");
    evaluateRulesForContact = module.evaluateRulesForContact;
  }
  evaluateRulesForContact(contactId).catch((err) =>
    console.error("Reactive rules evaluation failed:", err)
  );
}

const PostgresSessionStore = connectPg(session);

export class Storage {
  sessionStore: any;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ pool, createTableIfMissing: true });
  }

  // --- Activity Log (core helper — used by all mutations) ---
  async logActivity(event: string, detail: string, opts?: { contactId?: number; source?: string; metadata?: Record<string, unknown> }): Promise<void> {
    try {
      await db.insert(activityLog).values({
        event, detail,
        contactId: opts?.contactId ?? null,
        source: opts?.source || "system",
        metadata: opts?.metadata,
      });
      sseManager.broadcast({ type: "activity_logged", event });
    } catch {
      // Don't let logging failures break the app
    }
  }

  // --- User ---
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByApiKey(apiKey: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.apiKey, apiKey));
    return user;
  }

  async getFirstUser(): Promise<User | undefined> {
    const [user] = await db.select().from(users).limit(1);
    return user;
  }

  async createUser(pin: string, apiKey: string): Promise<User> {
    const [user] = await db.insert(users).values({ pin, apiKey }).returning();
    return user;
  }

  // --- Companies ---
  async getCompanies(): Promise<Company[]> {
    return db.select().from(companies).orderBy(asc(companies.name));
  }

  async getCompany(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company;
  }

  async createCompany(data: InsertCompany): Promise<Company> {
    const [company] = await db.insert(companies).values(data).returning();
    return company;
  }

  async updateCompany(id: number, data: Partial<InsertCompany>): Promise<Company | undefined> {
    const [company] = await db.update(companies).set(data).where(eq(companies.id, id)).returning();
    return company;
  }

  // --- Contacts ---
  async getContacts(): Promise<Contact[]> {
    return db.select().from(contacts).orderBy(asc(contacts.sortOrder), asc(contacts.id));
  }

  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }

  async getContactWithRelations(id: number): Promise<ContactWithRelations | undefined> {
    const contact = await this.getContact(id);
    if (!contact) return undefined;
    return this.enrichContact(contact);
  }

  async getContactsWithRelations(): Promise<ContactWithRelations[]> {
    const allContacts = await this.getContacts();
    return Promise.all(allContacts.map((c) => this.enrichContact(c)));
  }

  private async enrichContact(contact: Contact): Promise<ContactWithRelations> {
    const [company, contactInteractions, contactFollowups, contactViolations] = await Promise.all([
      contact.companyId ? this.getCompany(contact.companyId) : Promise.resolve(null),
      db.select().from(interactions).where(eq(interactions.contactId, contact.id)).orderBy(asc(interactions.date)),
      db.select().from(followups).where(and(eq(followups.contactId, contact.id), isNull(followups.cancelledAt))).orderBy(asc(followups.dueDate)),
      db.select().from(ruleViolations).where(and(eq(ruleViolations.contactId, contact.id), isNull(ruleViolations.resolvedAt))),
    ]);

    const result: ContactWithRelations = {
      ...contact,
      company: company ?? null,
      interactions: contactInteractions,
      followups: contactFollowups,
      violations: contactViolations,
    };

    // Let plugins enrich the contact with their data
    const pluginCtx = this.getPluginContext();
    for (const plugin of getPlugins()) {
      if (plugin.enrichContact) {
        try {
          const extra = await plugin.enrichContact(contact.id, pluginCtx);
          Object.assign(result, extra);
        } catch {
          // Plugin enrichment failed — skip, don't crash
        }
      }
    }

    return result;
  }

  /** Build the plugin context object */
  getPluginContext() {
    return {
      db,
      broadcast: (data: Record<string, unknown>) => sseManager.broadcast(data),
      logActivity: this.logActivity.bind(this),
      requireAuth: null as any, // Set by routes.ts when registering
    };
  }

  async createContact(data: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values(data).returning();
    sseManager.broadcast({ type: "contact_created", contactId: contact.id });
    this.logActivity("contact.created", `Created ${contact.firstName} ${contact.lastName}`, { contactId: contact.id, source: "agent" });
    return contact;
  }

  async updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [contact] = await db.update(contacts).set({ ...data, updatedAt: new Date() }).where(eq(contacts.id, id)).returning();
    if (contact) {
      sseManager.broadcast({ type: "contact_updated", contactId: id });
      triggerRulesEvaluation(id);
      const changes = Object.keys(data).join(", ");
      this.logActivity("contact.updated", `Updated ${contact.firstName} ${contact.lastName}: ${changes}`, { contactId: id, source: "agent", metadata: data as any });
    }
    return contact;
  }

  async deleteContact(id: number): Promise<boolean> {
    const contact = await this.getContact(id);
    const result = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    if (result.length > 0) {
      sseManager.broadcast({ type: "contact_deleted", contactId: id });
      if (contact) this.logActivity("contact.deleted", `Deleted ${contact.firstName} ${contact.lastName}`, { contactId: id, source: "agent" });
    }
    return result.length > 0;
  }

  // --- Interactions ---
  async getInteractions(contactId: number): Promise<Interaction[]> {
    return db.select().from(interactions).where(eq(interactions.contactId, contactId)).orderBy(asc(interactions.date));
  }

  async createInteraction(data: InsertInteraction): Promise<Interaction> {
    const [interaction] = await db.insert(interactions).values(data).returning();
    await db.update(contacts).set({ updatedAt: new Date() }).where(eq(contacts.id, data.contactId));
    sseManager.broadcast({ type: "interaction_created", contactId: data.contactId, interactionId: interaction.id });
    triggerRulesEvaluation(data.contactId);
    return interaction;
  }

  async updateInteraction(id: number, data: Partial<InsertInteraction>): Promise<Interaction | undefined> {
    const [interaction] = await db.update(interactions).set(data).where(eq(interactions.id, id)).returning();
    if (interaction) sseManager.broadcast({ type: "interaction_updated", contactId: interaction.contactId });
    return interaction;
  }

  async deleteInteraction(id: number): Promise<boolean> {
    const [deleted] = await db.delete(interactions).where(eq(interactions.id, id)).returning();
    if (deleted) sseManager.broadcast({ type: "interaction_deleted", contactId: deleted.contactId });
    return !!deleted;
  }

  // --- Items (follow-ups, meetings, etc.) ---
  async getFollowups(contactId?: number): Promise<Followup[]> {
    if (contactId) return db.select().from(followups).where(and(eq(followups.contactId, contactId), isNull(followups.cancelledAt))).orderBy(asc(followups.dueDate));
    return db.select().from(followups).where(isNull(followups.cancelledAt)).orderBy(asc(followups.dueDate));
  }

  async getOverdueFollowups(): Promise<Followup[]> {
    return db.select().from(followups).where(and(eq(followups.completed, false), isNull(followups.cancelledAt), lte(followups.dueDate, new Date()))).orderBy(asc(followups.dueDate));
  }

  async createFollowup(data: InsertFollowup): Promise<Followup> {
    const [followup] = await db.insert(followups).values(data).returning();
    sseManager.broadcast({ type: "followup_created", contactId: data.contactId, followupId: followup.id });
    triggerRulesEvaluation(data.contactId);
    return followup;
  }

  async updateFollowup(id: number, data: Partial<InsertFollowup>): Promise<Followup | undefined> {
    const [followup] = await db.update(followups).set(data).where(eq(followups.id, id)).returning();
    if (followup) sseManager.broadcast({ type: "followup_updated", contactId: followup.contactId });
    return followup;
  }

  async completeFollowup(id: number): Promise<Followup | undefined> {
    const [followup] = await db.update(followups).set({ completed: true, completedAt: new Date() }).where(eq(followups.id, id)).returning();
    if (followup) {
      sseManager.broadcast({ type: "followup_completed", contactId: followup.contactId });
      triggerRulesEvaluation(followup.contactId);
    }
    return followup;
  }

  async deleteFollowup(id: number): Promise<boolean> {
    const [deleted] = await db.delete(followups).where(eq(followups.id, id)).returning();
    if (deleted) sseManager.broadcast({ type: "followup_deleted", contactId: deleted.contactId });
    return !!deleted;
  }

  // --- Rules ---
  async getRules(enabledOnly?: boolean): Promise<Rule[]> {
    if (enabledOnly) return db.select().from(rules).where(eq(rules.enabled, true)).orderBy(asc(rules.name));
    return db.select().from(rules).orderBy(asc(rules.name));
  }

  async getRule(id: number): Promise<Rule | undefined> {
    const [rule] = await db.select().from(rules).where(eq(rules.id, id));
    return rule;
  }

  async createRule(data: InsertRule): Promise<Rule> {
    const [rule] = await db.insert(rules).values(data).returning();
    return rule;
  }

  async updateRule(id: number, data: Partial<InsertRule>): Promise<Rule | undefined> {
    const [rule] = await db.update(rules).set({ ...data, updatedAt: new Date() }).where(eq(rules.id, id)).returning();
    return rule;
  }

  async deleteRule(id: number): Promise<boolean> {
    const result = await db.delete(rules).where(eq(rules.id, id)).returning();
    return result.length > 0;
  }

  // --- Rule Violations ---
  async getViolations(contactId?: number): Promise<RuleViolation[]> {
    if (contactId) return db.select().from(ruleViolations).where(and(eq(ruleViolations.contactId, contactId), isNull(ruleViolations.resolvedAt))).orderBy(desc(ruleViolations.createdAt));
    return db.select().from(ruleViolations).where(isNull(ruleViolations.resolvedAt)).orderBy(desc(ruleViolations.createdAt));
  }

  async createViolation(data: InsertRuleViolation): Promise<RuleViolation> {
    const [violation] = await db.insert(ruleViolations).values(data).returning();
    sseManager.broadcast({ type: "violation_created", contactId: data.contactId, violationId: violation.id });
    this.logActivity("violation.created", data.message, { contactId: data.contactId, source: `rule:${data.ruleId}`, metadata: { ruleId: data.ruleId, severity: data.severity } });
    return violation;
  }

  async resolveViolation(id: number): Promise<RuleViolation | undefined> {
    const [violation] = await db.update(ruleViolations).set({ resolvedAt: new Date() }).where(eq(ruleViolations.id, id)).returning();
    if (violation) sseManager.broadcast({ type: "violation_resolved", contactId: violation.contactId });
    return violation;
  }

  async resolveViolationsForRule(ruleId: number, contactId: number): Promise<void> {
    await db.update(ruleViolations).set({ resolvedAt: new Date() })
      .where(and(eq(ruleViolations.ruleId, ruleId), eq(ruleViolations.contactId, contactId), isNull(ruleViolations.resolvedAt)));
  }

  async hasActiveViolation(ruleId: number, contactId: number): Promise<boolean> {
    const [existing] = await db.select().from(ruleViolations)
      .where(and(eq(ruleViolations.ruleId, ruleId), eq(ruleViolations.contactId, contactId), isNull(ruleViolations.resolvedAt)))
      .limit(1);
    return !!existing;
  }

  // --- Pipeline view ---
  async getPipeline(): Promise<Record<string, Contact[]>> {
    const allContacts = await this.getContacts();
    const pipeline: Record<string, Contact[]> = {};
    for (const contact of allContacts) {
      if (!pipeline[contact.stage]) pipeline[contact.stage] = [];
      pipeline[contact.stage].push(contact);
    }
    return pipeline;
  }
}

export const storage = new Storage();
