import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { ContactWithRelations, RuleViolation, Rule, Interaction, Followup } from "@shared/schema";

const CRM_URL = process.env.CRM_URL;
const API_KEY = process.env.CRM_API_KEY || "";

if (!CRM_URL) {
  console.error("CRM_URL is required — set it in your environment or Claude Desktop config");
  process.exit(1);
}
if (!API_KEY) {
  console.error("CRM_API_KEY is required");
  process.exit(1);
}

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${CRM_URL}${path}`, {
    method,
    headers: {
      "X-API-Key": API_KEY,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null as T;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${method} ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

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
    stage: z.string().optional().describe("Filter by stage"),
    status: z.string().optional().describe("Filter by status (ACTIVE, HOLD, PASS)"),
  },
  async ({ query, stage, status }) => {
    let contacts = await api<ContactWithRelations[]>("GET", "/api/contacts");
    if (query) {
      const q = query.toLowerCase();
      contacts = contacts.filter(
        (c) =>
          `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
          c.company?.name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q),
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
      lastInteraction:
        c.interactions?.length > 0
          ? {
              date: c.interactions[c.interactions.length - 1].date,
              content: c.interactions[c.interactions.length - 1].content,
            }
          : null,
      activeFollowups: c.followups?.filter((f) => !f.completed).length || 0,
      violations: c.violations?.length || 0,
    }));
    return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
  },
);

server.tool(
  "get_contact",
  "Get full details for a contact including interactions, follow-ups, and violations",
  { contactId: z.number().describe("Contact ID") },
  async ({ contactId }) => {
    const contact = await api<ContactWithRelations>("GET", `/api/contacts/${contactId}`);
    return { content: [{ type: "text" as const, text: JSON.stringify(contact, null, 2) }] };
  },
);

server.tool(
  "list_violations",
  "Get all active rule violations",
  { severity: z.string().optional().describe("Filter by severity") },
  async ({ severity }) => {
    let violations = await api<RuleViolation[]>("GET", "/api/violations");
    if (severity) violations = violations.filter((v) => v.severity === severity);
    return { content: [{ type: "text" as const, text: JSON.stringify(violations, null, 2) }] };
  },
);

// --- Write Tools ---

server.tool(
  "create_contact",
  "Create a new contact in the CRM",
  {
    firstName: z.string(),
    lastName: z.string(),
    title: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    website: z.string().optional(),
    location: z.string().optional(),
    background: z.string().optional(),
    status: z.string().optional().default("ACTIVE"),
    stage: z.string().optional().default("LEAD"),
    source: z.string().optional(),
  },
  async (data) => {
    const contact = await api<{ id: number; firstName: string; lastName: string }>("POST", "/api/contacts", data);
    return {
      content: [
        { type: "text" as const, text: `Created: ${contact.firstName} ${contact.lastName} (ID: ${contact.id})` },
      ],
    };
  },
);

server.tool(
  "update_contact",
  "Update an existing contact's fields",
  {
    contactId: z.number(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    title: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    website: z.string().optional(),
    location: z.string().optional(),
    background: z.string().optional(),
    status: z.string().optional(),
    stage: z.string().optional(),
    source: z.string().optional(),
  },
  async ({ contactId, ...data }) => {
    const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const contact = await api<{ firstName: string; lastName: string }>("PUT", `/api/contacts/${contactId}`, filtered);
    return { content: [{ type: "text" as const, text: `Updated: ${contact.firstName} ${contact.lastName}` }] };
  },
);

server.tool(
  "add_interaction",
  "Log a new interaction (note, meeting, email, or call) for a contact",
  {
    contactId: z.number(),
    content: z.string(),
    date: z.string().optional().describe("ISO date string, defaults to now"),
    type: z.string().optional().describe("note, meeting, email, or call").default("note"),
  },
  async ({ contactId, content, date, type }) => {
    const interaction = await api<Interaction>("POST", "/api/interactions", {
      contactId,
      content,
      date: date || new Date().toISOString(),
      type: type || "note",
    });
    return { content: [{ type: "text" as const, text: `Logged ${interaction.type} for contact ${contactId}` }] };
  },
);

server.tool(
  "set_followup",
  "Create a follow-up reminder for a contact",
  {
    contactId: z.number(),
    content: z.string(),
    dueDate: z.string().describe("Due date — ISO string or M/D format"),
  },
  async ({ contactId, content, dueDate }) => {
    let parsedDate: string;
    if (dueDate.includes("/") && !dueDate.includes("T")) {
      const [month, day] = dueDate.split("/").map(Number);
      const d = new Date(new Date().getFullYear(), month - 1, day);
      if (d < new Date()) d.setFullYear(d.getFullYear() + 1);
      parsedDate = d.toISOString();
    } else {
      parsedDate = new Date(dueDate).toISOString();
    }
    await api<Followup>("POST", "/api/followups", { contactId, content, dueDate: parsedDate });
    return {
      content: [
        { type: "text" as const, text: `Follow-up set for ${new Date(parsedDate).toLocaleDateString()}: "${content}"` },
      ],
    };
  },
);

server.tool(
  "complete_followup",
  "Mark a follow-up as completed, optionally logging what happened as an interaction",
  {
    followupId: z.number(),
    outcome: z.string().optional().describe("What happened — logged as a new interaction"),
  },
  async ({ followupId, outcome }) => {
    const fu = await api<Followup>("POST", `/api/followups/${followupId}/complete`, outcome ? { outcome } : undefined);
    return {
      content: [
        { type: "text" as const, text: outcome ? `Completed and logged: "${outcome}"` : `Completed: "${fu.content}"` },
      ],
    };
  },
);

// --- Rules ---

server.tool("list_rules", "List all business rules", { enabled: z.boolean().optional() }, async ({ enabled }) => {
  const rules = await api<Rule[]>("GET", `/api/rules${enabled !== undefined ? `?enabled=${enabled}` : ""}`);
  return { content: [{ type: "text" as const, text: JSON.stringify(rules, null, 2) }] };
});

server.tool(
  "create_rule",
  "Create a new business rule",
  {
    name: z.string(),
    description: z.string(),
    conditionType: z
      .string()
      .describe("no_interaction_for_days, followup_past_due, no_followup_after_meeting, status_is, stage_is"),
    conditionParams: z.record(z.unknown()).optional(),
    exceptions: z.array(z.object({ type: z.string(), params: z.record(z.unknown()).optional() })).optional(),
    severity: z.string().optional().default("warning"),
    messageTemplate: z.string(),
  },
  async ({ name, description, conditionType, conditionParams, exceptions, severity, messageTemplate }) => {
    const rule = await api<Rule>("POST", "/api/rules", {
      name,
      description,
      condition: { type: conditionType, params: conditionParams || {}, exceptions: exceptions || [] },
      action: { type: "create_violation", params: { severity, message_template: messageTemplate } },
      enabled: true,
    });
    return { content: [{ type: "text" as const, text: `Created rule: "${rule.name}" (ID: ${rule.id})` }] };
  },
);

server.tool(
  "update_rule",
  "Update a rule",
  {
    ruleId: z.number(),
    name: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
  },
  async ({ ruleId, ...data }) => {
    const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const rule = await api<Rule>("PUT", `/api/rules/${ruleId}`, filtered);
    return { content: [{ type: "text" as const, text: `Updated rule: "${rule.name}"` }] };
  },
);

server.tool("delete_rule", "Delete a business rule", { ruleId: z.number() }, async ({ ruleId }) => {
  await api("DELETE", `/api/rules/${ruleId}`);
  return { content: [{ type: "text" as const, text: "Rule deleted" }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Claw CRM MCP server running (HTTP mode)");
}

main().catch(console.error);
