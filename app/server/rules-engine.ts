import { storage } from "./storage";
import type { Contact, Interaction, Followup, Rule } from "@shared/schema";
import { db } from "./db";
import { rules, interactions, followups, contacts } from "@shared/schema";
import { eq, desc, and, asc, isNull, gt } from "drizzle-orm";

interface RuleCondition {
  type: string;
  params: Record<string, any>;
  exceptions?: Array<{ type: string; params?: Record<string, any> }>;
}

interface RuleAction {
  type: string;
  params: Record<string, any>;
}

// Evaluate all rules for a specific contact
export async function evaluateRulesForContact(contactId: number): Promise<void> {
  const enabledRules = await storage.getRules(true);
  const contact = await storage.getContact(contactId);
  if (!contact) return;

  const contactInteractions = await storage.getInteractions(contactId);
  const contactFollowups = await storage.getFollowups(contactId);

  for (const rule of enabledRules) {
    await evaluateRule(rule, contact, contactInteractions, contactFollowups);
  }

  // Update rule lastEvaluatedAt
  const now = new Date();
  for (const rule of enabledRules) {
    await db.update(rules).set({ lastEvaluatedAt: now }).where(eq(rules.id, rule.id));
  }
}

// Evaluate all rules across all contacts (scheduled)
export async function evaluateAllRules(): Promise<void> {
  const enabledRules = await storage.getRules(true);
  const allContacts = await storage.getContacts();

  for (const contact of allContacts) {
    const contactInteractions = await storage.getInteractions(contact.id);
    const contactFollowups = await storage.getFollowups(contact.id);

    for (const rule of enabledRules) {
      await evaluateRule(rule, contact, contactInteractions, contactFollowups);
    }
  }

  // Update lastEvaluatedAt for all rules
  const now = new Date();
  for (const rule of enabledRules) {
    await db.update(rules).set({ lastEvaluatedAt: now }).where(eq(rules.id, rule.id));
  }
}

async function evaluateRule(
  rule: Rule,
  contact: Contact,
  contactInteractions: Interaction[],
  contactFollowups: Followup[]
): Promise<void> {
  const condition = rule.condition as RuleCondition;
  const action = rule.action as RuleAction;

  const violated = checkCondition(condition, contact, contactInteractions, contactFollowups);

  if (violated) {
    // Check if violation already exists
    const hasViolation = await storage.hasActiveViolation(rule.id, contact.id);
    if (!hasViolation) {
      const message = buildMessage(action.params.message_template || "", contact, contactInteractions, contactFollowups);
      await storage.createViolation({
        ruleId: rule.id,
        contactId: contact.id,
        message,
        severity: action.params.severity || "warning",
      });
    }
  } else {
    // Clear existing violation if condition no longer applies
    await storage.resolveViolationsForRule(rule.id, contact.id);
  }
}

function checkCondition(
  condition: RuleCondition,
  contact: Contact,
  contactInteractions: Interaction[],
  contactFollowups: Followup[]
): boolean {
  // Only evaluate for ACTIVE contacts by default
  if (contact.status !== "ACTIVE" && condition.type !== "followup_past_due") {
    return false;
  }

  let violated = false;

  switch (condition.type) {
    case "no_interaction_for_days": {
      const days = condition.params.days || 14;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      const lastInteraction = contactInteractions.length > 0
        ? contactInteractions[contactInteractions.length - 1]
        : null;

      if (!lastInteraction || new Date(lastInteraction.date) < cutoff) {
        violated = true;
      }
      break;
    }

    case "followup_past_due": {
      const now = new Date();
      const overdueFollowups = contactFollowups.filter(
        (f) => !f.completed && new Date(f.dueDate) < now
      );
      violated = overdueFollowups.length > 0;
      break;
    }

    case "no_followup_after_meeting": {
      const hours = condition.params.hours || 48;
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - hours);

      // Find meetings that happened more than N hours ago
      const recentMeetings = contactInteractions.filter(
        (i) => i.type === "meeting" && new Date(i.date) < cutoff
      );

      if (recentMeetings.length > 0) {
        const latestMeeting = recentMeetings[recentMeetings.length - 1];
        const meetingDate = new Date(latestMeeting.date);

        // Check if there's a followup created after the meeting
        const hasFollowupAfterMeeting = contactFollowups.some(
          (f) => new Date(f.createdAt) >= meetingDate
        );

        violated = !hasFollowupAfterMeeting;
      }
      break;
    }

    case "status_is": {
      violated = contact.status === condition.params.status;
      break;
    }

    case "stage_is": {
      violated = contact.stage === condition.params.stage;
      break;
    }

    default:
      break;
  }

  // Check exceptions
  if (violated && condition.exceptions) {
    for (const exception of condition.exceptions) {
      if (checkException(exception, contact, contactInteractions, contactFollowups)) {
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
  contactInteractions: Interaction[],
  contactFollowups: Followup[]
): boolean {
  switch (exception.type) {
    case "has_future_followup": {
      const now = new Date();
      return contactFollowups.some((f) => !f.completed && new Date(f.dueDate) >= now);
    }
    default:
      return false;
  }
}

function buildMessage(
  template: string,
  contact: Contact,
  contactInteractions: Interaction[],
  contactFollowups: Followup[]
): string {
  let message = template;

  // Replace template variables
  const lastInteraction = contactInteractions.length > 0
    ? contactInteractions[contactInteractions.length - 1]
    : null;

  if (lastInteraction) {
    const daysSince = Math.floor(
      (Date.now() - new Date(lastInteraction.date).getTime()) / (1000 * 60 * 60 * 24)
    );
    message = message.replace("{{days_since_last}}", String(daysSince));
  }

  // Replace followup content
  const overdueFollowups = contactFollowups.filter(
    (f) => !f.completed && new Date(f.dueDate) < new Date()
  );
  if (overdueFollowups.length > 0) {
    message = message.replace("{{followup_content}}", overdueFollowups[0].content);
  }

  // Replace meeting date
  const meetings = contactInteractions.filter((i) => i.type === "meeting");
  if (meetings.length > 0) {
    const lastMeeting = meetings[meetings.length - 1];
    message = message.replace("{{meeting_date}}", new Date(lastMeeting.date).toLocaleDateString());
  }

  return message;
}

// Start the scheduled evaluation loop
export function startRulesScheduler(intervalMs: number = 15 * 60 * 1000): NodeJS.Timeout {
  console.log(`Rules engine: scheduled evaluation every ${intervalMs / 1000 / 60} minutes`);

  // Run once immediately
  evaluateAllRules().catch((err) => console.error("Rules evaluation failed:", err));

  // Then on interval
  return setInterval(() => {
    evaluateAllRules().catch((err) => console.error("Rules evaluation failed:", err));
  }, intervalMs);
}
