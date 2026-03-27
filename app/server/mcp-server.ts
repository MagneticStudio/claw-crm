import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { storage } from "./storage";
import { evaluateRulesForContact } from "./rules-engine";

const server = new McpServer({
  name: "claw-crm",
  version: "1.0.0",
});

// --- Read Tools ---

server.tool(
  "search_contacts",
  "Search contacts by name, company, stage, or status",
  {
    query: z.string().optional().describe("Search term for name or company"),
    stage: z.string().optional().describe("Filter by stage (LEAD, MEETING, PROPOSAL, NEGOTIATION, LIVE, HOLD, PASS, RELATIONSHIP)"),
    status: z.string().optional().describe("Filter by status (ACTIVE, HOLD, PASS)"),
  },
  async ({ query, stage, status }) => {
    let contacts = await storage.getContactsWithRelations();

    if (query) {
      const q = query.toLowerCase();
      contacts = contacts.filter(
        (c) =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          c.company?.name.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q)
      );
    }
    if (stage) contacts = contacts.filter((c) => c.stage === stage);
    if (status) contacts = contacts.filter((c) => c.status === status);

    const summary = contacts.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      company: c.company?.name,
      stage: c.stage,
      status: c.status,
      email: c.email,
      lastInteraction: c.interactions.length > 0
        ? { date: c.interactions[c.interactions.length - 1].date, content: c.interactions[c.interactions.length - 1].content }
        : null,
      activeFollowups: c.followups.filter((f) => !f.completed).length,
      violations: c.violations.length,
    }));

    return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
  }
);

server.tool(
  "get_contact",
  "Get full details for a contact including interactions, follow-ups, and violations",
  { contactId: z.number().describe("Contact ID") },
  async ({ contactId }) => {
    const contact = await storage.getContactWithRelations(contactId);
    if (!contact) return { content: [{ type: "text" as const, text: "Contact not found" }] };
    return { content: [{ type: "text" as const, text: JSON.stringify(contact, null, 2) }] };
  }
);

server.tool(
  "get_pipeline",
  "Get contacts grouped by pipeline stage with counts",
  {},
  async () => {
    const pipeline = await storage.getPipeline();
    const result: Record<string, any> = {};
    for (const [stage, stageContacts] of Object.entries(pipeline)) {
      result[stage] = {
        count: stageContacts.length,
        contacts: stageContacts.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          company: null as string | null, // Will be enriched below
          status: c.status,
        })),
      };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "get_dashboard",
  "Get CRM dashboard summary: pipeline counts, overdue follow-ups, stale contacts, recent activity",
  {},
  async () => {
    const [allContacts, overdueFollowups, violations, pipeline] = await Promise.all([
      storage.getContacts(),
      storage.getOverdueFollowups(),
      storage.getViolations(),
      storage.getPipeline(),
    ]);

    const stageCounts: Record<string, number> = {};
    for (const [stage, stageContacts] of Object.entries(pipeline)) {
      stageCounts[stage] = stageContacts.length;
    }

    const result = {
      totalContacts: allContacts.length,
      activeContacts: allContacts.filter((c) => c.status === "ACTIVE").length,
      overdueFollowups: overdueFollowups.map((f) => ({
        id: f.id,
        contactId: f.contactId,
        dueDate: f.dueDate,
        content: f.content,
      })),
      activeViolations: violations.map((v) => ({
        id: v.id,
        contactId: v.contactId,
        message: v.message,
        severity: v.severity,
      })),
      stageCounts,
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "list_violations",
  "Get all active rule violations",
  { severity: z.string().optional().describe("Filter by severity (info, warning, critical)") },
  async ({ severity }) => {
    let violations = await storage.getViolations();
    if (severity) violations = violations.filter((v) => v.severity === severity);
    return { content: [{ type: "text" as const, text: JSON.stringify(violations, null, 2) }] };
  }
);

// --- Write Tools ---

server.tool(
  "create_contact",
  "Create a new contact in the CRM",
  {
    firstName: z.string().describe("First name"),
    lastName: z.string().describe("Last name"),
    title: z.string().optional().describe("Job title"),
    email: z.string().optional().describe("Email address"),
    phone: z.string().optional().describe("Phone number"),
    website: z.string().optional().describe("Website URL"),
    location: z.string().optional().describe("Location"),
    background: z.string().optional().describe("Background notes"),
    status: z.string().optional().describe("Status (ACTIVE, HOLD, PASS)").default("ACTIVE"),
    stage: z.string().optional().describe("Pipeline stage (LEAD, MEETING, PROPOSAL, NEGOTIATION, LIVE, HOLD, PASS, RELATIONSHIP)").default("LEAD"),
    source: z.string().optional().describe("Referral source"),
  },
  async (data) => {
    const contact = await storage.createContact(data);
    return { content: [{ type: "text" as const, text: `Created contact: ${contact.firstName} ${contact.lastName} (ID: ${contact.id})` }] };
  }
);

server.tool(
  "update_contact",
  "Update an existing contact's fields",
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
    status: z.string().optional().describe("ACTIVE, HOLD, or PASS"),
    stage: z.string().optional().describe("LEAD, MEETING, PROPOSAL, NEGOTIATION, LIVE, HOLD, PASS, or RELATIONSHIP"),
    source: z.string().optional(),
  },
  async ({ contactId, ...data }) => {
    const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const contact = await storage.updateContact(contactId, filtered);
    if (!contact) return { content: [{ type: "text" as const, text: "Contact not found" }] };
    return { content: [{ type: "text" as const, text: `Updated contact: ${contact.firstName} ${contact.lastName}` }] };
  }
);

server.tool(
  "add_interaction",
  "Log a new interaction (note, meeting, email, or call) for a contact",
  {
    contactId: z.number().describe("Contact ID"),
    content: z.string().describe("Description of the interaction"),
    date: z.string().optional().describe("Date of interaction (ISO string). Defaults to now."),
    type: z.string().optional().describe("Type: note, meeting, email, or call").default("note"),
  },
  async ({ contactId, content, date, type }) => {
    const interaction = await storage.createInteraction({
      contactId,
      content,
      date: date ? new Date(date) : new Date(),
      type: type || "note",
    });
    return { content: [{ type: "text" as const, text: `Logged ${interaction.type} for contact ${contactId}: "${content}"` }] };
  }
);

server.tool(
  "set_followup",
  "Create a follow-up reminder for a contact",
  {
    contactId: z.number().describe("Contact ID"),
    content: z.string().describe("Follow-up action description"),
    dueDate: z.string().describe("Due date (ISO string or M/D format)"),
  },
  async ({ contactId, content, dueDate }) => {
    let parsedDate: Date;
    if (dueDate.includes("/") && !dueDate.includes("T")) {
      const [month, day] = dueDate.split("/").map(Number);
      parsedDate = new Date(new Date().getFullYear(), month - 1, day);
      if (parsedDate < new Date()) parsedDate.setFullYear(parsedDate.getFullYear() + 1);
    } else {
      parsedDate = new Date(dueDate);
    }

    const followup = await storage.createFollowup({
      contactId,
      content,
      dueDate: parsedDate,
      completed: false,
    });
    return { content: [{ type: "text" as const, text: `Follow-up set for ${parsedDate.toLocaleDateString()}: "${content}"` }] };
  }
);

server.tool(
  "complete_followup",
  "Mark a follow-up as completed",
  { followupId: z.number().describe("Follow-up ID") },
  async ({ followupId }) => {
    const followup = await storage.completeFollowup(followupId);
    if (!followup) return { content: [{ type: "text" as const, text: "Follow-up not found" }] };
    return { content: [{ type: "text" as const, text: `Completed follow-up: "${followup.content}"` }] };
  }
);

// --- Rules Tools ---

server.tool(
  "list_rules",
  "List all business rules in the CRM",
  { enabled: z.boolean().optional().describe("Filter to only enabled rules") },
  async ({ enabled }) => {
    const rules = await storage.getRules(enabled);
    return { content: [{ type: "text" as const, text: JSON.stringify(rules, null, 2) }] };
  }
);

server.tool(
  "create_rule",
  "Create a new business rule for the CRM. Rules are evaluated automatically.",
  {
    name: z.string().describe("Rule name"),
    description: z.string().describe("Human-readable description of what this rule does"),
    conditionType: z.string().describe("Condition type: no_interaction_for_days, followup_past_due, no_followup_after_meeting, status_is, stage_is"),
    conditionParams: z.record(z.any()).optional().describe("Parameters for the condition (e.g., {days: 14})"),
    exceptions: z.array(z.object({ type: z.string(), params: z.record(z.any()).optional() })).optional().describe("Exception conditions that suppress the rule"),
    severity: z.string().optional().describe("Violation severity: info, warning, critical").default("warning"),
    messageTemplate: z.string().describe("Message template. Use {{days_since_last}}, {{followup_content}}, {{meeting_date}} as variables."),
  },
  async ({ name, description, conditionType, conditionParams, exceptions, severity, messageTemplate }) => {
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
  }
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
    const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const rule = await storage.updateRule(ruleId, filtered);
    if (!rule) return { content: [{ type: "text" as const, text: "Rule not found" }] };
    return { content: [{ type: "text" as const, text: `Updated rule: "${rule.name}"` }] };
  }
);

server.tool(
  "delete_rule",
  "Delete a business rule",
  { ruleId: z.number().describe("Rule ID") },
  async ({ ruleId }) => {
    const deleted = await storage.deleteRule(ruleId);
    if (!deleted) return { content: [{ type: "text" as const, text: "Rule not found" }] };
    return { content: [{ type: "text" as const, text: "Rule deleted" }] };
  }
);

// Start the MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claw CRM MCP server running on stdio");
}

main().catch(console.error);
