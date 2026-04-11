import { storage } from "./storage";
import type { Contact, Interaction, Followup, Rule } from "@shared/schema";
import { db } from "./db";
import { rules } from "@shared/schema";
import { eq } from "drizzle-orm";

interface RuleCondition {
  type: string;
  params: Record<string, any>;
  exceptions?: Array<{ type: string; params?: Record<string, any> }>;
}

interface RuleAction {
  type: string;
  params: Record<string, any>;
}

export async function evaluateRulesForContact(contactId: number): Promise<void> {
  const enabledRules = await storage.getRules(true);
  const contact = await storage.getContact(contactId);
  if (!contact) return;

  const [contactInteractions, contactFollowups] = await Promise.all([
    storage.getInteractions(contactId),
    storage.getFollowups(contactId),
  ]);

  for (const rule of enabledRules) {
    await evaluateRule(rule, contact, contactInteractions, contactFollowups);
  }

  const now = new Date();
  for (const rule of enabledRules) {
    await db.update(rules).set({ lastEvaluatedAt: now }).where(eq(rules.id, rule.id));
  }
}

export async function evaluateAllRules(): Promise<void> {
  const enabledRules = await storage.getRules(true);
  const allContacts = await storage.getContacts();

  for (const contact of allContacts) {
    const [contactInteractions, contactFollowups] = await Promise.all([
      storage.getInteractions(contact.id),
      storage.getFollowups(contact.id),
    ]);

    for (const rule of enabledRules) {
      await evaluateRule(rule, contact, contactInteractions, contactFollowups);
    }
  }

  const now = new Date();
  for (const rule of enabledRules) {
    await db.update(rules).set({ lastEvaluatedAt: now }).where(eq(rules.id, rule.id));
  }
}

async function evaluateRule(
  rule: Rule,
  contact: Contact,
  contactInteractions: Interaction[],
  contactFollowups: Followup[],
): Promise<void> {
  const condition = rule.condition as RuleCondition;
  const action = rule.action as RuleAction;
  const violated = checkCondition(condition, contact, contactInteractions, contactFollowups);

  if (violated) {
    const hasViolation = await storage.hasActiveViolation(rule.id, contact.id);
    if (!hasViolation) {
      const message = buildMessage(
        action.params.message_template || "",
        contact,
        contactInteractions,
        contactFollowups,
      );
      await storage.createViolation({
        ruleId: rule.id,
        contactId: contact.id,
        message,
        severity: action.params.severity || "warning",
      });
    }
  } else {
    await storage.resolveViolationsForRule(rule.id, contact.id);
  }
}

function checkCondition(
  condition: RuleCondition,
  contact: Contact,
  contactInteractions: Interaction[],
  contactFollowups: Followup[],
): boolean {
  if (contact.status !== "ACTIVE" && condition.type !== "followup_past_due") return false;

  let violated = false;

  switch (condition.type) {
    case "no_interaction_for_days": {
      const days = condition.params.days || 14;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const last = contactInteractions.length > 0 ? contactInteractions[contactInteractions.length - 1] : null;
      if (!last || new Date(last.date) < cutoff) violated = true;
      break;
    }
    case "followup_past_due": {
      const now = new Date();
      violated = contactFollowups.some((f) => !f.completed && new Date(f.dueDate) < now);
      break;
    }
    case "no_followup_after_meeting": {
      const hours = condition.params.hours || 48;
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - hours);
      const recentMeetings = contactInteractions.filter((i) => i.type === "meeting" && new Date(i.date) < cutoff);
      if (recentMeetings.length > 0) {
        const latestMeeting = recentMeetings[recentMeetings.length - 1];
        violated = !contactFollowups.some((f) => new Date(f.createdAt) >= new Date(latestMeeting.date));
      }
      break;
    }
    case "status_is":
      violated = contact.status === condition.params.status;
      break;
    case "stage_is":
      violated = contact.stage === condition.params.stage;
      break;
  }

  // Check exceptions
  if (violated && condition.exceptions) {
    for (const exception of condition.exceptions) {
      if (checkException(exception, contact, contactFollowups)) {
        violated = false;
        break;
      }
    }
  }

  return violated;
}

function checkException(
  exception: { type: string; params?: Record<string, any> },
  contact: Contact,
  contactFollowups: Followup[],
): boolean {
  switch (exception.type) {
    case "has_future_followup":
      return contactFollowups.some((f) => !f.completed && new Date(f.dueDate) >= new Date());
    case "stage_in":
      return (exception.params?.stages || []).includes(contact.stage);
    default:
      return false;
  }
}

function buildMessage(
  template: string,
  contact: Contact,
  contactInteractions: Interaction[],
  contactFollowups: Followup[],
): string {
  let message = template;
  const last = contactInteractions.length > 0 ? contactInteractions[contactInteractions.length - 1] : null;
  if (last) {
    const daysSince = Math.floor((Date.now() - new Date(last.date).getTime()) / (1000 * 60 * 60 * 24));
    message = message.replace("{{days_since_last}}", String(daysSince));
  }
  const overdue = contactFollowups.filter((f) => !f.completed && new Date(f.dueDate) < new Date());
  if (overdue.length > 0) message = message.replace("{{followup_content}}", overdue[0].content);
  const pastMeetings = contactInteractions.filter((i) => i.type === "meeting");
  if (pastMeetings.length > 0)
    message = message.replace(
      "{{meeting_date}}",
      new Date(pastMeetings[pastMeetings.length - 1].date).toLocaleDateString(),
    );
  return message;
}

export function startRulesScheduler(intervalMs: number = 15 * 60 * 1000): NodeJS.Timeout {
  console.warn(`Rules engine: scheduled evaluation every ${intervalMs / 1000 / 60} minutes`);
  evaluateAllRules().catch((err) => console.error("Rules evaluation failed:", err));
  return setInterval(() => {
    evaluateAllRules().catch((err) => console.error("Rules evaluation failed:", err));
  }, intervalMs);
}
