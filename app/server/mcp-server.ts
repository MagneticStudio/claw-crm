import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { storage } from "./storage";
import {
  STAGES,
  STATUSES,
  INTERACTION_TYPES,
  TASK_TYPES,
  SEVERITIES,
  CONDITION_TYPES,
  EXCEPTION_TYPES,
} from "@shared/schema";

// Zod enums from shared constants
const stageEnum = z.enum(STAGES);
const statusEnum = z.enum(STATUSES);
const interactionTypeEnum = z.enum(INTERACTION_TYPES);
const taskTypeEnum = z.enum(TASK_TYPES);
const severityEnum = z.enum(SEVERITIES);
const conditionTypeEnum = z.enum(CONDITION_TYPES);

const server = new McpServer({
  name: "claw-crm",
  version: "1.0.0",
});

// --- Read Tools ---

server.tool(
  "search_contacts",
  "Search contacts by name, company, stage, or status. Returns a paginated summary list.",
  {
    query: z.string().optional().describe("Search term (matches name, company, or email)"),
    stage: stageEnum.optional().describe(`Filter by stage: ${STAGES.join(", ")}`),
    status: statusEnum.optional().describe(`Filter by status: ${STATUSES.join(", ")}`),
    limit: z.number().optional().describe("Max results to return (default 25)"),
    offset: z.number().optional().describe("Skip this many results (default 0)"),
  },
  async ({ query, stage, status, limit, offset }) => {
    let contacts = await storage.getContactsWithRelations();

    if (query) {
      const q = query.toLowerCase();
      contacts = contacts.filter(
        (c) =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          c.company?.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q),
      );
    }
    if (stage) contacts = contacts.filter((c) => c.stage === stage);
    if (status) contacts = contacts.filter((c) => c.status === status);

    const total = contacts.length;
    const l = limit || 25;
    const o = offset || 0;
    const sliced = contacts.slice(o, o + l);

    const summary = sliced.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      company: c.company?.name,
      stage: c.stage,
      status: c.status,
      email: c.email,
      lastInteraction:
        c.interactions.length > 0
          ? {
              date: c.interactions[c.interactions.length - 1].date,
              content: c.interactions[c.interactions.length - 1].content,
            }
          : null,
      activeFollowups: c.followups.filter((f) => !f.completed).length,
      violations: c.violations.length,
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ results: summary, totalCount: total, hasMore: o + l < total }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "get_contact",
  "Get full details for a contact including interactions, follow-ups, and violations",
  { contactId: z.number().describe("Contact ID") },
  async ({ contactId }) => {
    const contact = await storage.getContactWithRelations(contactId);
    if (!contact)
      return {
        content: [
          {
            type: "text" as const,
            text: `Contact ${contactId} not found. Use search_contacts to find valid contacts.`,
          },
        ],
        isError: true,
      };
    return { content: [{ type: "text" as const, text: JSON.stringify(contact, null, 2) }] };
  },
);

server.tool(
  "list_violations",
  "Get all active rule violations, enriched with contact names",
  {
    severity: severityEnum.optional().describe(`Filter by severity: ${SEVERITIES.join(", ")}`),
    limit: z.number().optional().describe("Max results (default 25)"),
    offset: z.number().optional().describe("Skip results (default 0)"),
  },
  async ({ severity, limit, offset }) => {
    let violations = await storage.getViolations();
    if (severity) violations = violations.filter((v) => v.severity === severity);

    const total = violations.length;
    const l = limit || 25;
    const o = offset || 0;
    const sliced = violations.slice(o, o + l);

    // Enrich with contact names
    const allContacts = await storage.getContacts();
    const nameMap = new Map(allContacts.map((c) => [c.id, `${c.firstName} ${c.lastName}`]));

    const enriched = sliced.map((v) => ({
      ...v,
      contactName: nameMap.get(v.contactId) || "Unknown",
    }));

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ results: enriched, totalCount: total, hasMore: o + l < total }, null, 2),
        },
      ],
    };
  },
);

// --- Write Tools ---

server.tool(
  "create_contact",
  "Create a new contact in the CRM. Always search_contacts first to avoid duplicates.",
  {
    firstName: z.string().describe("First name"),
    lastName: z.string().describe("Last name"),
    title: z.string().optional().describe("Job title"),
    email: z.string().optional().describe("Email address"),
    phone: z.string().optional().describe("Phone number"),
    website: z.string().optional().describe("Website domain (no https://)"),
    location: z.string().optional().describe("City or short location"),
    background: z.string().optional().describe("1-2 sentence company context"),
    status: statusEnum
      .optional()
      .default("ACTIVE")
      .describe(`${STATUSES.join(" or ")}`),
    stage: stageEnum
      .optional()
      .default("LEAD")
      .describe(`${STAGES.join(", ")}`),
    source: z.string().optional().describe("How we connected"),
  },
  async (data) => {
    try {
      const contact = await storage.createContact(data);
      return {
        content: [
          {
            type: "text" as const,
            text: `Created contact: ${contact.firstName} ${contact.lastName} (ID: ${contact.id}). Now use add_interaction to log key events.`,
          },
        ],
      };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error creating contact: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

server.tool(
  "update_contact",
  "Update an existing contact's fields. Only include fields you want to change.",
  {
    contactId: z.number().describe("Contact ID to update"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    title: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    website: z.string().optional(),
    location: z.string().optional(),
    background: z.string().optional(),
    status: statusEnum.optional().describe(`${STATUSES.join(" or ")}`),
    stage: stageEnum.optional().describe(`${STAGES.join(", ")}`),
    source: z.string().optional(),
  },
  async ({ contactId, ...data }) => {
    try {
      const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      const contact = await storage.updateContact(contactId, filtered);
      if (!contact)
        return {
          content: [
            {
              type: "text" as const,
              text: `Contact ${contactId} not found. Use search_contacts to find valid contacts.`,
            },
          ],
          isError: true,
        };
      return {
        content: [{ type: "text" as const, text: `Updated contact: ${contact.firstName} ${contact.lastName}` }],
      };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error updating contact: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

server.tool(
  "add_interaction",
  "Log a new interaction (note, meeting, email, or call) for a contact",
  {
    contactId: z.number().describe("Contact ID"),
    content: z.string().describe("What happened — concise, past tense, factual"),
    date: z.string().optional().describe("Date of interaction (ISO string). Defaults to now."),
    type: interactionTypeEnum
      .optional()
      .default("note")
      .describe(`${INTERACTION_TYPES.join(", ")}`),
  },
  async ({ contactId, content, date, type }) => {
    try {
      const interaction = await storage.createInteraction({
        contactId,
        content,
        date: date ? new Date(date) : new Date(),
        type: type || "note",
      });
      return { content: [{ type: "text" as const, text: `Logged ${interaction.type} for contact ${contactId}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error logging interaction: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

server.tool(
  "create_task",
  `Create a task or meeting for a contact.

For tasks (type "task"): action items with due dates.
For meetings (type "meeting"): scheduled events with optional time/location.`,
  {
    contactId: z.number().describe("Contact ID"),
    content: z.string().describe("For tasks: action to take. For meetings: description."),
    dueDate: z.string().describe("Due date: ISO string (2026-04-15) or M/D format (4/15)"),
    type: taskTypeEnum.optional().describe('"task" (default) or "meeting"'),
    time: z.string().optional().describe("Display time for meetings, e.g. '2:00 PM'"),
    location: z.string().optional().describe("Meeting location"),
  },
  async ({ contactId, content, dueDate, type, time, location }) => {
    try {
      let parsedDate: Date;
      if (dueDate.includes("/") && !dueDate.includes("T")) {
        const [month, day] = dueDate.split("/").map(Number);
        parsedDate = new Date(new Date().getFullYear(), month - 1, day);
        if (parsedDate < new Date()) parsedDate.setFullYear(parsedDate.getFullYear() + 1);
      } else {
        parsedDate = new Date(dueDate);
      }

      const isMeeting = type === "meeting";
      const followup = await storage.createFollowup({
        contactId,
        content,
        dueDate: parsedDate,
        completed: false,
        type: isMeeting ? "meeting" : "task",
        time: isMeeting ? time : undefined,
        location: isMeeting ? location : undefined,
      });

      if (isMeeting) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Meeting scheduled${time ? ` at ${time}` : ""}: "${content}" (ID: ${followup.id})`,
            },
          ],
        };
      }
      return {
        content: [
          { type: "text" as const, text: `Follow-up set for ${parsedDate.toLocaleDateString()}: "${content}"` },
        ],
      };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error creating task: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

server.tool(
  "complete_followup",
  "Mark a follow-up as completed, optionally logging what happened as an interaction",
  {
    followupId: z.number().describe("Follow-up ID"),
    outcome: z.string().optional().describe("What happened — logged as a new interaction in the timeline"),
  },
  async ({ followupId, outcome }) => {
    try {
      const followup = await storage.completeFollowup(followupId);
      if (!followup)
        return {
          content: [
            {
              type: "text" as const,
              text: `Follow-up ${followupId} not found. Use get_contact to check valid follow-up IDs.`,
            },
          ],
          isError: true,
        };

      if (outcome?.trim()) {
        await storage.createInteraction({
          contactId: followup.contactId,
          content: outcome.trim(),
          date: new Date(),
          type: "note",
        });
        return { content: [{ type: "text" as const, text: `Completed and logged: "${outcome.trim()}"` }] };
      }

      return { content: [{ type: "text" as const, text: `Completed: "${followup.content}"` }] };
    } catch (err: unknown) {
      return {
        content: [{ type: "text" as const, text: `Error completing follow-up: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

// --- Rules Tools ---

server.tool(
  "list_rules",
  "List all business rules in the CRM",
  {
    enabled: z.boolean().optional().describe("Filter to only enabled rules"),
    limit: z.number().optional().describe("Max results (default 25)"),
    offset: z.number().optional().describe("Skip results (default 0)"),
  },
  async ({ enabled, limit, offset }) => {
    const rules = await storage.getRules(enabled);
    const total = rules.length;
    const l = limit || 25;
    const o = offset || 0;
    const sliced = rules.slice(o, o + l);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ results: sliced, totalCount: total, hasMore: o + l < total }, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "create_rule",
  "Create a new business rule for the CRM. Rules are evaluated automatically.",
  {
    name: z.string().describe("Rule name"),
    description: z.string().describe("Human-readable description"),
    conditionType: conditionTypeEnum.describe(`Condition type: ${CONDITION_TYPES.join(", ")}`),
    conditionParams: z.record(z.any()).optional().describe("Parameters for the condition (e.g., {days: 14})"),
    exceptions: z
      .array(z.object({ type: z.string(), params: z.record(z.any()).optional() }))
      .optional()
      .describe(`Exception conditions: ${EXCEPTION_TYPES.join(", ")}`),
    severity: severityEnum
      .optional()
      .default("warning")
      .describe(`Violation severity: ${SEVERITIES.join(", ")}`),
    messageTemplate: z.string().describe("Message template with {{variable}} placeholders"),
  },
  async ({ name, description, conditionType, conditionParams, exceptions, severity, messageTemplate }) => {
    try {
      const rule = await storage.createRule({
        name,
        description,
        condition: {
          type: conditionType,
          params: conditionParams || {},
          exceptions: exceptions || [],
        },
        action: {
          type: "create_violation",
          params: { severity: severity || "warning", message_template: messageTemplate },
        },
        enabled: true,
      });
      return { content: [{ type: "text" as const, text: `Created rule: "${rule.name}" (ID: ${rule.id})` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error creating rule: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

server.tool(
  "update_rule",
  "Update an existing rule (enable/disable, change parameters, etc.)",
  {
    ruleId: z.number().describe("Rule ID"),
    name: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional().describe("Enable or disable the rule"),
  },
  async ({ ruleId, ...data }) => {
    try {
      const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
      const rule = await storage.updateRule(ruleId, filtered);
      if (!rule)
        return {
          content: [
            { type: "text" as const, text: `Rule ${ruleId} not found. Use list_rules to find valid rule IDs.` },
          ],
          isError: true,
        };
      return { content: [{ type: "text" as const, text: `Updated rule: "${rule.name}"` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: `Error updating rule: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

server.tool("delete_rule", "Delete a business rule", { ruleId: z.number().describe("Rule ID") }, async ({ ruleId }) => {
  try {
    const deleted = await storage.deleteRule(ruleId);
    if (!deleted)
      return {
        content: [{ type: "text" as const, text: `Rule ${ruleId} not found. Use list_rules to find valid rule IDs.` }],
        isError: true,
      };
    return { content: [{ type: "text" as const, text: `Deleted rule ${ruleId}` }] };
  } catch (err: unknown) {
    return { content: [{ type: "text" as const, text: `Error deleting rule: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

// Start the MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claw CRM MCP server running on stdio");
}

main().catch(console.error);
