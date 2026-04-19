import {
  users,
  type User,
  companies,
  type Company,
  type InsertCompany,
  contacts,
  type Contact,
  type InsertContact,
  type ContactWithRelations,
  interactions,
  type Interaction,
  type InsertInteraction,
  followups,
  type Followup,
  type InsertFollowup,
  rules,
  type Rule,
  type InsertRule,
  ruleViolations,
  type RuleViolation,
  type InsertRuleViolation,
  activityLog,
  briefings,
  contactJournalRevisions,
  type ContactJournalRevision,
} from "@shared/schema";
import { hashJournal, isDestructiveChange, JOURNAL_SIZE_LIMIT } from "@shared/journal";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "./db";
import { pool } from "./db";
import { eq, desc, asc, and, isNull, lte } from "drizzle-orm";
import { sseManager } from "./sse";

// Lazy import to avoid circular dependency
let evaluateRulesForContact: ((contactId: number) => Promise<void>) | null = null;
async function triggerRulesEvaluation(contactId: number) {
  if (!evaluateRulesForContact) {
    const module = await import("./rules-engine");
    evaluateRulesForContact = module.evaluateRulesForContact;
  }
  evaluateRulesForContact(contactId).catch((err) => console.error("Reactive rules evaluation failed:", err));
}

// Lazy import for search index invalidation
let _searchInvalidate: (() => void) | null = null;
function invalidateSearch() {
  if (!_searchInvalidate) {
    import("./search").then((m) => {
      _searchInvalidate = m.searchService.invalidate.bind(m.searchService);
      _searchInvalidate();
    });
  } else {
    _searchInvalidate();
  }
}

const PostgresSessionStore = connectPg(session);

export class Storage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({ pool, createTableIfMissing: true });
  }

  // --- Activity Log (core helper — used by all mutations) ---
  async logActivity(
    event: string,
    detail: string,
    opts?: { contactId?: number; source?: string; metadata?: Record<string, unknown> },
  ): Promise<void> {
    try {
      await db.insert(activityLog).values({
        event,
        detail,
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

  async createUser(pin: string, apiKey: string, mcpToken?: string, orgName?: string): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({ pin, apiKey, mcpToken: mcpToken || "", orgName: orgName || "Claw CRM" })
      .returning();
    return user;
  }

  async updateUser(
    id: number,
    data: Partial<{ pin: string; apiKey: string; mcpToken: string; orgName: string; primaryColor: string }>,
  ): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
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
      db
        .select()
        .from(followups)
        .where(and(eq(followups.contactId, contact.id), isNull(followups.cancelledAt)))
        .orderBy(asc(followups.dueDate)),
      db
        .select()
        .from(ruleViolations)
        .where(and(eq(ruleViolations.contactId, contact.id), isNull(ruleViolations.resolvedAt))),
    ]);

    const result: ContactWithRelations = {
      ...contact,
      company: company ?? null,
      interactions: contactInteractions,
      followups: contactFollowups,
      violations: contactViolations,
    };

    // Enrich with briefing data
    const [briefingRow] = await db.select().from(briefings).where(eq(briefings.contactId, contact.id));
    result.briefing = briefingRow ?? null;

    return result;
  }

  async createContact(data: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values(data).returning();
    sseManager.broadcast({ type: "contact_created", contactId: contact.id });
    this.logActivity("contact.created", `Created ${contact.firstName} ${contact.lastName}`, {
      contactId: contact.id,
      source: "agent",
    });
    invalidateSearch();
    return contact;
  }

  async updateContact(id: number, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [contact] = await db
      .update(contacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(contacts.id, id))
      .returning();
    if (contact) {
      sseManager.broadcast({ type: "contact_updated", contactId: id });
      triggerRulesEvaluation(id);
      const changes = Object.keys(data).join(", ");
      this.logActivity("contact.updated", `Updated ${contact.firstName} ${contact.lastName}: ${changes}`, {
        contactId: id,
        source: "agent",
        metadata: data as Record<string, unknown>,
      });
      invalidateSearch();
    }
    return contact;
  }

  async deleteContact(id: number): Promise<boolean> {
    const contact = await this.getContact(id);
    const result = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    if (result.length > 0) {
      sseManager.broadcast({ type: "contact_deleted", contactId: id });
      if (contact)
        this.logActivity("contact.deleted", `Deleted ${contact.firstName} ${contact.lastName}`, {
          contactId: id,
          source: "agent",
        });
      invalidateSearch();
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
    const contact = await this.getContact(data.contactId);
    const name = contact ? `${contact.firstName} ${contact.lastName}` : `contact ${data.contactId}`;
    this.logActivity(
      "interaction.created",
      `Added ${data.type || "note"} for ${name}: ${(data.content as string).slice(0, 80)}`,
      { contactId: data.contactId },
    );
    invalidateSearch();
    return interaction;
  }

  async updateInteraction(id: number, data: Partial<InsertInteraction>): Promise<Interaction | undefined> {
    const [interaction] = await db.update(interactions).set(data).where(eq(interactions.id, id)).returning();
    if (interaction) {
      sseManager.broadcast({ type: "interaction_updated", contactId: interaction.contactId });
      this.logActivity("interaction.updated", `Edited interaction ${id}`, { contactId: interaction.contactId });
      invalidateSearch();
    }
    return interaction;
  }

  async deleteInteraction(id: number): Promise<boolean> {
    const [deleted] = await db.delete(interactions).where(eq(interactions.id, id)).returning();
    if (deleted) {
      sseManager.broadcast({ type: "interaction_deleted", contactId: deleted.contactId });
      this.logActivity("interaction.deleted", `Deleted interaction ${id}`, { contactId: deleted.contactId });
      invalidateSearch();
    }
    return !!deleted;
  }

  // --- Items (follow-ups, meetings, etc.) ---
  async getFollowups(contactId?: number): Promise<Followup[]> {
    if (contactId)
      return db
        .select()
        .from(followups)
        .where(and(eq(followups.contactId, contactId), isNull(followups.cancelledAt)))
        .orderBy(asc(followups.dueDate));
    return db.select().from(followups).where(isNull(followups.cancelledAt)).orderBy(asc(followups.dueDate));
  }

  async getOverdueFollowups(): Promise<Followup[]> {
    return db
      .select()
      .from(followups)
      .where(and(eq(followups.completed, false), isNull(followups.cancelledAt), lte(followups.dueDate, new Date())))
      .orderBy(asc(followups.dueDate));
  }

  async createFollowup(data: InsertFollowup): Promise<Followup> {
    const [followup] = await db.insert(followups).values(data).returning();
    sseManager.broadcast({ type: "followup_created", contactId: data.contactId, followupId: followup.id });
    triggerRulesEvaluation(data.contactId);
    const contact = await this.getContact(data.contactId);
    const name = contact ? `${contact.firstName} ${contact.lastName}` : `contact ${data.contactId}`;
    this.logActivity(
      "followup.created",
      `Created ${data.type || "task"} for ${name}: ${(data.content as string).slice(0, 80)}`,
      { contactId: data.contactId },
    );
    invalidateSearch();
    return followup;
  }

  async updateFollowup(id: number, data: Partial<InsertFollowup>): Promise<Followup | undefined> {
    const [followup] = await db.update(followups).set(data).where(eq(followups.id, id)).returning();
    if (followup) {
      sseManager.broadcast({ type: "followup_updated", contactId: followup.contactId });
      const changes = Object.keys(data).join(", ");
      this.logActivity("followup.updated", `Updated ${followup.type || "task"} ${id}: ${changes}`, {
        contactId: followup.contactId,
      });
      invalidateSearch();
    }
    return followup;
  }

  async completeFollowup(id: number): Promise<Followup | undefined> {
    const [followup] = await db
      .update(followups)
      .set({ completed: true, completedAt: new Date() })
      .where(eq(followups.id, id))
      .returning();
    if (followup) {
      sseManager.broadcast({ type: "followup_completed", contactId: followup.contactId });
      triggerRulesEvaluation(followup.contactId);
      const contact = await this.getContact(followup.contactId);
      const name = contact ? `${contact.firstName} ${contact.lastName}` : `contact ${followup.contactId}`;
      this.logActivity(
        "followup.completed",
        `Completed ${followup.type || "task"} for ${name}: ${followup.content.slice(0, 80)}`,
        { contactId: followup.contactId },
      );
      invalidateSearch();
    }
    return followup;
  }

  async deleteFollowup(id: number): Promise<boolean> {
    const [deleted] = await db.delete(followups).where(eq(followups.id, id)).returning();
    if (deleted) {
      sseManager.broadcast({ type: "followup_deleted", contactId: deleted.contactId });
      this.logActivity("followup.deleted", `Deleted ${deleted.type || "task"}: ${deleted.content.slice(0, 80)}`, {
        contactId: deleted.contactId,
      });
      invalidateSearch();
    }
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
    this.logActivity("rule.created", `Created rule: ${rule.name}`, { source: "agent" });
    return rule;
  }

  async updateRule(id: number, data: Partial<InsertRule>): Promise<Rule | undefined> {
    const [rule] = await db
      .update(rules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(rules.id, id))
      .returning();
    if (rule) this.logActivity("rule.updated", `Updated rule: ${rule.name}`, { source: "agent" });
    return rule;
  }

  async deleteRule(id: number): Promise<boolean> {
    const rule = await this.getRule(id);
    const result = await db.delete(rules).where(eq(rules.id, id)).returning();
    if (result.length > 0) this.logActivity("rule.deleted", `Deleted rule: ${rule?.name || id}`, { source: "agent" });
    return result.length > 0;
  }

  // --- Rule Violations ---
  async getViolations(contactId?: number): Promise<RuleViolation[]> {
    if (contactId)
      return db
        .select()
        .from(ruleViolations)
        .where(and(eq(ruleViolations.contactId, contactId), isNull(ruleViolations.resolvedAt)))
        .orderBy(desc(ruleViolations.createdAt));
    return db
      .select()
      .from(ruleViolations)
      .where(isNull(ruleViolations.resolvedAt))
      .orderBy(desc(ruleViolations.createdAt));
  }

  async createViolation(data: InsertRuleViolation): Promise<RuleViolation> {
    const [violation] = await db.insert(ruleViolations).values(data).returning();
    sseManager.broadcast({ type: "violation_created", contactId: data.contactId, violationId: violation.id });
    this.logActivity("violation.created", data.message, {
      contactId: data.contactId,
      source: `rule:${data.ruleId}`,
      metadata: { ruleId: data.ruleId, severity: data.severity },
    });
    invalidateSearch();
    return violation;
  }

  async resolveViolation(id: number): Promise<RuleViolation | undefined> {
    const [violation] = await db
      .update(ruleViolations)
      .set({ resolvedAt: new Date() })
      .where(eq(ruleViolations.id, id))
      .returning();
    if (violation) {
      sseManager.broadcast({ type: "violation_resolved", contactId: violation.contactId });
      invalidateSearch();
    }
    return violation;
  }

  async resolveViolationsForRule(ruleId: number, contactId: number): Promise<void> {
    await db
      .update(ruleViolations)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(ruleViolations.ruleId, ruleId),
          eq(ruleViolations.contactId, contactId),
          isNull(ruleViolations.resolvedAt),
        ),
      );
    invalidateSearch();
  }

  async hasActiveViolation(ruleId: number, contactId: number): Promise<boolean> {
    const [existing] = await db
      .select()
      .from(ruleViolations)
      .where(
        and(
          eq(ruleViolations.ruleId, ruleId),
          eq(ruleViolations.contactId, contactId),
          isNull(ruleViolations.resolvedAt),
        ),
      )
      .limit(1);
    return !!existing;
  }

  // --- Relationship journal ---
  async getRelationshipJournal(contactId: number): Promise<{ content: string | null; hash: string } | null> {
    const contact = await this.getContact(contactId);
    if (!contact) return null;
    return { content: contact.relationshipJournal, hash: hashJournal(contact.relationshipJournal) };
  }

  async updateRelationshipJournal(
    contactId: number,
    newContent: string,
    opts: {
      source: "agent" | "user";
      expectedHash?: string;
      skipDestructiveGuard?: boolean;
      confirmedWithUser?: boolean;
    },
  ): Promise<
    | { ok: true; newHash: string; newSize: number }
    | {
        ok: false;
        reason: "not_found" | "hash_conflict" | "size_limit" | "destructive_edit";
        message: string;
        currentHash?: string;
      }
  > {
    const contact = await this.getContact(contactId);
    if (!contact) {
      return { ok: false, reason: "not_found", message: `Contact ${contactId} not found.` };
    }
    const oldContent = contact.relationshipJournal ?? "";
    const currentHash = hashJournal(contact.relationshipJournal);

    if (opts.expectedHash && opts.expectedHash !== currentHash) {
      return {
        ok: false,
        reason: "hash_conflict",
        message: "Journal has changed since your last read. Re-read and retry with the fresh hash.",
        currentHash,
      };
    }

    if (newContent.length > JOURNAL_SIZE_LIMIT) {
      return {
        ok: false,
        reason: "size_limit",
        message: `Journal would exceed ${JOURNAL_SIZE_LIMIT} chars (attempted ${newContent.length}). Compact older Entries or tighten prose. Every word earns its place.`,
      };
    }

    const destructive = isDestructiveChange(oldContent, newContent);
    if (destructive && !opts.skipDestructiveGuard && !opts.confirmedWithUser) {
      const oldSize = oldContent.length;
      const delta = oldSize - newContent.length;
      const pct = oldSize > 0 ? Math.round((delta / oldSize) * 100) : 0;
      const reasonDetail =
        delta > 0 && pct >= 20
          ? `shrinks the journal by ~${pct}% (${oldSize} → ${newContent.length} chars)`
          : "mutates or removes an existing Entry heading";
      return {
        ok: false,
        reason: "destructive_edit",
        message: `This edit ${reasonDetail}. If the user has explicitly approved this change in conversation, retry with confirmed_with_user: true. Otherwise, use a smaller targeted edit or append a correction entry.`,
        currentHash,
      };
    }

    await db.insert(contactJournalRevisions).values({
      contactId,
      content: oldContent,
      contentHash: currentHash,
      source: opts.source,
    });

    const [updated] = await db
      .update(contacts)
      .set({ relationshipJournal: newContent, updatedAt: new Date() })
      .where(eq(contacts.id, contactId))
      .returning();

    const newHash = hashJournal(newContent);
    sseManager.broadcast({ type: "journal_updated", contactId, hash: newHash });
    this.logActivity(
      "journal.updated",
      `Journal updated for ${updated?.firstName ?? ""} ${updated?.lastName ?? ""} (${oldContent.length} → ${newContent.length} chars)`,
      {
        contactId,
        source: opts.source,
        metadata: {
          oldSize: oldContent.length,
          newSize: newContent.length,
          confirmedWithUser: !!opts.confirmedWithUser,
        },
      },
    );
    invalidateSearch();
    return { ok: true, newHash, newSize: newContent.length };
  }

  async listJournalRevisions(contactId: number): Promise<ContactJournalRevision[]> {
    return db
      .select()
      .from(contactJournalRevisions)
      .where(eq(contactJournalRevisions.contactId, contactId))
      .orderBy(desc(contactJournalRevisions.createdAt));
  }

  async getJournalRevision(revisionId: number): Promise<ContactJournalRevision | undefined> {
    const [rev] = await db.select().from(contactJournalRevisions).where(eq(contactJournalRevisions.id, revisionId));
    return rev;
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
