import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { storage } from "./storage";
import { getPlugins } from "../plugins";
import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "claw-crm",
    version: "1.0.0",
  });

  // --- Guide ---
  server.tool(
    "get_crm_guide",
    "RECOMMENDED FIRST CALL. Returns instructions on how to use this CRM correctly. Call this before creating or updating contacts to understand the data conventions.",
    {},
    async () => {
      return { content: [{ type: "text" as const, text: `# Magnetic Advisors CRM — Agent Guide

This is a personal advisory CRM for a solo consultant (Alex Furmansky / Magnetic Advisors). It tracks ~15 prospects and clients through a pipeline.

## Key Principles
- This is a NOTEBOOK, not a database. Keep entries concise and scannable.
- Always search_contacts BEFORE creating — never create duplicates.
- One contact record = one PRIMARY person. Use additionalContacts for secondary people at the same company.
- The background field is 1-2 sentences of company context. Do NOT dump full history there.
- Use add_interaction for timeline events (past tense, factual, concise).
- Use set_followup for future action items.
- When completing a follow-up, ALWAYS provide an outcome describing what happened.

## Pipeline Stages
LEAD → MEETING → PROPOSAL → NEGOTIATION → LIVE → PASS, plus RELATIONSHIP (warm contacts)

- LEAD: Intro made, no meeting yet
- MEETING: First meeting happened or scheduled
- PROPOSAL: Proposal sent
- NEGOTIATION: Active back-and-forth on terms
- LIVE: Signed, active engagement (moves to execution/project management)
- PASS: Declined or not a fit
- PASS: Declined or not a fit
- RELATIONSHIP: Warm connection, not a sales prospect

## Contact Statuses
- ACTIVE: In the pipeline, needs attention
- HOLD: Paused — not dead, just not actively working it right now
Note: PASS is a STAGE (declined/not a fit), not a status.

## Data Formatting
- email: direct email address
- phone: direct phone number
- website: domain only, no https:// (e.g. "acme.com")
- location: city or short form (e.g. "LA", "NYC", "Monterrey, Mexico")
- source: how we connected (e.g. "Ryan Chan (referral)", "Direct", "Met at YPO event")
- additionalContacts: "Name (Role): email" separated by newlines
- interaction content: past tense, factual, concise (e.g. "AF had intro call. 30 min, discussed AI strategy.")
- followup content: action-oriented (e.g. "Check for reply on proposal")

## Rules
Rules auto-flag issues (stale contacts, overdue follow-ups). You can create, update, and delete rules.
Available condition types: no_interaction_for_days, followup_past_due, no_followup_after_meeting, meeting_within_hours, status_is, stage_is

Available exception types: has_future_followup, stage_in (with params.stages array)

${getPlugins().map(p => p.guideText || "").filter(Boolean).join("\n\n")}

## Confidentiality
- NEVER put pricing or deal terms in the CRM
- NEVER cross-reference client details between prospects
- Proposals reference dates only, no dollar amounts
` }] };
    }
  );

  // --- Read Tools ---
  server.tool("search_contacts", "Search contacts by name, company, stage, or status", {
    query: z.string().optional().describe("Search term"),
    stage: z.string().optional(), status: z.string().optional(),
  }, async ({ query, stage, status }) => {
    try {
      let contacts = await storage.getContactsWithRelations();
      if (query) { const q = query.toLowerCase(); contacts = contacts.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || c.company?.name?.toLowerCase().includes(q)); }
      if (stage) contacts = contacts.filter(c => c.stage === stage);
      if (status) contacts = contacts.filter(c => c.status === status);
      const summary = contacts.map(c => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, company: c.company?.name, stage: c.stage, status: c.status, email: c.email, lastInteraction: c.interactions.length > 0 ? { date: c.interactions[c.interactions.length - 1].date, content: c.interactions[c.interactions.length - 1].content } : null, activeFollowups: c.followups.filter(f => !f.completed).length, violations: c.violations.length }));
      return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error searching contacts: ${err.message}` }], isError: true };
    }
  });

  server.tool("get_contact", "Get full contact details", { contactId: z.number() }, async ({ contactId }) => {
    try {
      const contact = await storage.getContactWithRelations(contactId);
      if (!contact) return { content: [{ type: "text" as const, text: `Contact ${contactId} not found` }], isError: true };
      return { content: [{ type: "text" as const, text: JSON.stringify(contact, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error reading contact ${contactId}: ${err.message}` }], isError: true };
    }
  });

  server.tool("get_pipeline", "Contacts grouped by stage", {}, async () => {
    try {
      const pipeline = await storage.getPipeline();
      return { content: [{ type: "text" as const, text: JSON.stringify(pipeline, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  });

  server.tool("get_dashboard", "CRM summary", {}, async () => {
    try {
      const [contacts, overdue, violations, pipeline] = await Promise.all([storage.getContacts(), storage.getOverdueFollowups(), storage.getViolations(), storage.getPipeline()]);
      const stageCounts: Record<string, number> = {};
      for (const [s, c] of Object.entries(pipeline)) stageCounts[s] = c.length;
      return { content: [{ type: "text" as const, text: JSON.stringify({ totalContacts: contacts.length, activeContacts: contacts.filter(c => c.status === "ACTIVE").length, overdueFollowups: overdue.length, activeViolations: violations.length, stageCounts }, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  });

  server.tool("list_violations", "Active rule violations", { severity: z.string().optional() }, async ({ severity }) => {
    try {
      let v = await storage.getViolations();
      if (severity) v = v.filter(x => x.severity === severity);
      return { content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  });

  // --- Write Tools ---
  server.tool(
    "create_contact",
    `Create a new contact in the CRM. This is a personal advisory CRM for a solo consultant.

BEFORE CREATING: Always search_contacts first to check if this person already exists. Do not create duplicates.

IMPORTANT formatting rules:
- firstName/lastName: The PRIMARY contact person only (one person per contact record)
- title: Their job title, e.g. "Managing Director of Operations" or "CEO & Founder"
- email: Their direct email address. Always populate if known.
- phone: Their direct phone number. Always populate if known.
- website: Company website domain only (no https://), e.g. "standardcommunities.com"
- location: City or short location, e.g. "LA" or "Torrance, CA" or "Monterrey, Mexico"
- background: 1-2 sentences about the company and why they're relevant. Keep it SHORT — this is a quick-scan tearsheet, not a full bio. Do NOT dump all context here.
- source: How we met or who referred them, e.g. "Ryan Chan (referral)" or "Direct" or "Met at YPO event"
- additionalContacts: Other key people at the company. Format: "Name (Role): email | phone" separated by newlines. e.g. "Lisa Bouyer (VP Enterprise Planning)\\nChris (Full-stack engineer)"
- stage: Pipeline position. LEAD (new), MEETING (met), PROPOSAL (sent), NEGOTIATION (terms), LIVE (signed), PASS (declined), RELATIONSHIP (warm, non-sales). HOLD is NOT a stage — use status: HOLD instead.
- status: ACTIVE (default) or HOLD (paused). PASS is a stage, not a status.

After creating the contact, use add_interaction to log the key events (meetings, emails, proposals) as separate timeline entries. Do NOT put the full history in the background field.`,
    {
      firstName: z.string().describe("First name of the primary contact"),
      lastName: z.string().describe("Last name of the primary contact"),
      title: z.string().optional().describe("Job title, e.g. 'CEO & Founder'"),
      email: z.string().optional().describe("Direct email address — always include if known"),
      phone: z.string().optional().describe("Direct phone number"),
      website: z.string().optional().describe("Company website domain (no https://), e.g. 'acme.com'"),
      location: z.string().optional().describe("City or short location, e.g. 'LA' or 'NYC'"),
      background: z.string().optional().describe("1-2 sentences about the company. Keep SHORT — do not dump full history here"),
      source: z.string().optional().describe("How we connected, e.g. 'Ryan Chan (referral)' or 'Direct'"),
      additionalContacts: z.string().optional().describe("Other key people: 'Name (Role): email' separated by newlines"),
      status: z.string().optional().describe("ACTIVE (default) or HOLD"),
      stage: z.string().optional().describe("LEAD, MEETING, PROPOSAL, NEGOTIATION, LIVE, PASS, or RELATIONSHIP. NOT HOLD (use status for that)"),
    },
    async (data) => {
      try {
        const cleaned = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        if (!cleaned.status) cleaned.status = "ACTIVE";
        if (!cleaned.stage) cleaned.stage = "LEAD";
        const c = await storage.createContact(cleaned as any);
        return { content: [{ type: "text" as const, text: `Created contact: ${c.firstName} ${c.lastName} (ID: ${c.id}). Now use add_interaction to log key events in the timeline.` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error creating contact: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "update_contact",
    "Update fields on an existing contact. Only include fields you want to change.",
    {
      contactId: z.number().describe("Contact ID to update"),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      title: z.string().optional().describe("Job title"),
      email: z.string().optional().describe("Direct email address"),
      phone: z.string().optional().describe("Direct phone number"),
      website: z.string().optional().describe("Company website domain (no https://)"),
      location: z.string().optional().describe("City or short location"),
      background: z.string().optional().describe("1-2 sentence company context. Keep short."),
      source: z.string().optional().describe("Referral source"),
      additionalContacts: z.string().optional().describe("Other key people: 'Name (Role): email' per line"),
      status: z.string().optional().describe("ACTIVE, HOLD, or PASS"),
      stage: z.string().optional().describe("LEAD, MEETING, PROPOSAL, NEGOTIATION, LIVE, PASS, or RELATIONSHIP. NOT HOLD (use status for that)"),
    },
    async ({ contactId, ...data }) => {
      try {
        const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        const c = await storage.updateContact(contactId, filtered);
        if (!c) return { content: [{ type: "text" as const, text: `Contact ${contactId} not found` }], isError: true };
        return { content: [{ type: "text" as const, text: `Updated: ${c.firstName} ${c.lastName}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error updating contact: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "add_interaction",
    `Log an interaction to a contact's timeline. Each interaction is one event — a meeting, email, call, or note.

Keep content concise and factual, written in past tense from the advisor's perspective.
Examples:
- "AF had intro call with Bobby. 30 min, discussed AI strategy gaps."
- "Proposal sent. $15K/mo for 3-month engagement."
- "Lisa emailed: contract redlines attached. Sent to legal."
- "AF pinged Sieva. No response yet."

Do NOT log follow-up tasks here — use set_followup for those.`,
    {
      contactId: z.number().describe("Contact ID"),
      content: z.string().describe("What happened — concise, past tense, factual"),
      date: z.string().optional().describe("When it happened (ISO date string). Defaults to now."),
      type: z.string().optional().describe("note (default), meeting, email, or call"),
    },
    async ({ contactId, content, date, type }) => {
      try {
        const i = await storage.createInteraction({ contactId, content, date: date ? new Date(date) : new Date(), type: type || "note" });
        return { content: [{ type: "text" as const, text: `Logged ${i.type} for contact ${contactId}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error logging interaction: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "set_followup",
    `Create a follow-up task for a contact. Follow-ups are action items with due dates.

Content should be a clear action: what to do, not what happened.
Examples: "Check for reply on proposal", "Send intro email", "Prep agenda for kickoff call"`,
    {
      contactId: z.number().describe("Contact ID"),
      content: z.string().describe("Action to take — clear and specific"),
      dueDate: z.string().describe("Due date: ISO string (2026-04-15) or M/D format (4/15)"),
    },
    async ({ contactId, content, dueDate }) => {
      try {
        let d: Date;
        if (dueDate.includes("/") && !dueDate.includes("T")) {
          const [m, day] = dueDate.split("/").map(Number);
          d = new Date(new Date().getFullYear(), m - 1, day);
          if (d < new Date()) d.setFullYear(d.getFullYear() + 1);
        } else { d = new Date(dueDate); }
        await storage.createFollowup({ contactId, content, dueDate: d, completed: false });
        return { content: [{ type: "text" as const, text: `Follow-up set for ${d.toLocaleDateString()}: "${content}"` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error creating follow-up: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "complete_followup",
    `Mark a follow-up as done. Always provide an outcome describing what actually happened — this gets logged to the timeline as a permanent record.

The outcome should be past tense: "Checked in with Idan — confirmed coffee next Tuesday" not "Check in with Idan"`,
    {
      followupId: z.number().describe("Follow-up ID"),
      outcome: z.string().optional().describe("What happened — logged as a timeline entry. Always provide this."),
    },
    async ({ followupId, outcome }) => {
      try {
        const fu = await storage.completeFollowup(followupId);
        if (!fu) return { content: [{ type: "text" as const, text: `Follow-up ${followupId} not found` }], isError: true };
        if (outcome?.trim()) {
          await storage.createInteraction({ contactId: fu.contactId, content: outcome.trim(), date: new Date(), type: "note" });
          return { content: [{ type: "text" as const, text: `Completed and logged: "${outcome.trim()}"` }] };
        }
        return { content: [{ type: "text" as const, text: `Completed: "${fu.content}"` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error completing follow-up: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "delete_contact",
    "Permanently delete a contact and all their interactions, follow-ups, and violations. Use this to clean up duplicates or remove contacts that should not be in the CRM. This cannot be undone.",
    { contactId: z.number().describe("Contact ID to delete") },
    async ({ contactId }) => {
      try {
        const contact = await storage.getContact(contactId);
        if (!contact) return { content: [{ type: "text" as const, text: `Contact ${contactId} not found` }], isError: true };
        const name = `${contact.firstName} ${contact.lastName}`;
        const deleted = await storage.deleteContact(contactId);
        if (!deleted) return { content: [{ type: "text" as const, text: `Failed to delete contact ${contactId}` }], isError: true };
        return { content: [{ type: "text" as const, text: `Deleted contact: ${name} (ID: ${contactId}) and all associated data` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error deleting contact: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "delete_followup",
    "Delete a follow-up task. Use this to remove follow-ups that are no longer relevant without marking them as completed.",
    { followupId: z.number().describe("Follow-up ID to delete") },
    async ({ followupId }) => {
      try {
        const deleted = await storage.deleteFollowup(followupId);
        if (!deleted) return { content: [{ type: "text" as const, text: `Follow-up ${followupId} not found` }], isError: true };
        return { content: [{ type: "text" as const, text: `Deleted follow-up ${followupId}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error deleting follow-up: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "delete_interaction",
    "Delete an interaction entry from a contact's timeline.",
    { interactionId: z.number().describe("Interaction ID to delete") },
    async ({ interactionId }) => {
      try {
        const deleted = await storage.deleteInteraction(interactionId);
        if (!deleted) return { content: [{ type: "text" as const, text: `Interaction ${interactionId} not found` }], isError: true };
        return { content: [{ type: "text" as const, text: `Deleted interaction ${interactionId}` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error deleting interaction: ${err.message}` }], isError: true };
      }
    }
  );

  // --- Plugins ---
  const pluginCtx = storage.getPluginContext();
  for (const plugin of getPlugins()) {
    if (plugin.registerTools) {
      plugin.registerTools(server, pluginCtx);
    }
  }

  // --- Rules ---
  server.tool("list_rules", "List business rules", { enabled: z.boolean().optional() }, async ({ enabled }) => {
    try {
      const rules = await storage.getRules(enabled);
      return { content: [{ type: "text" as const, text: JSON.stringify(rules, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  });

  server.tool("create_rule", "Create a business rule", {
    name: z.string(), description: z.string(),
    conditionType: z.string(), conditionParams: z.record(z.any()).optional(),
    exceptions: z.array(z.object({ type: z.string(), params: z.record(z.any()).optional() })).optional(),
    severity: z.string().optional().default("warning"), messageTemplate: z.string(),
  }, async ({ name, description, conditionType, conditionParams, exceptions, severity, messageTemplate }) => {
    const rule = await storage.createRule({ name, description, condition: { type: conditionType, params: conditionParams || {}, exceptions: exceptions || [] }, action: { type: "create_violation", params: { severity, message_template: messageTemplate } }, enabled: true });
    return { content: [{ type: "text" as const, text: `Created rule: "${rule.name}" (ID: ${rule.id})` }] };
  });

  server.tool(
    "update_rule",
    `Update a business rule. You can change metadata (name, description, enabled) or the rule logic itself (conditionParams, exceptions).

To add a stage exception to the stale contact rule:
  update_rule(ruleId: 1, exceptions: [{ type: "has_future_followup" }, { type: "stage_in", params: { stages: ["LIVE", "RELATIONSHIP"] } }])

Available exception types: has_future_followup, stage_in (with params.stages array)`,
    {
      ruleId: z.number().describe("Rule ID to update"),
      name: z.string().optional(),
      description: z.string().optional(),
      enabled: z.boolean().optional().describe("Enable or disable the rule"),
      conditionParams: z.record(z.any()).optional().describe("Update condition parameters, e.g. { days: 7 }"),
      exceptions: z.array(z.object({ type: z.string(), params: z.record(z.any()).optional() })).optional().describe("Replace the exceptions list"),
    },
    async ({ ruleId, conditionParams, exceptions, ...data }) => {
      try {
        const updates: Record<string, any> = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

        // If conditionParams or exceptions changed, we need to update the condition jsonb
        if (conditionParams !== undefined || exceptions !== undefined) {
          const existing = await storage.getRule(ruleId);
          if (!existing) return { content: [{ type: "text" as const, text: `Rule ${ruleId} not found` }], isError: true };
          const condition = existing.condition as any;
          if (conditionParams) condition.params = conditionParams;
          if (exceptions) condition.exceptions = exceptions;
          updates.condition = condition;
        }

        const rule = await storage.updateRule(ruleId, updates);
        if (!rule) return { content: [{ type: "text" as const, text: `Rule ${ruleId} not found` }], isError: true };
        return { content: [{ type: "text" as const, text: `Updated rule: "${rule.name}"` }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: `Error updating rule: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool("delete_rule", "Delete a rule", { ruleId: z.number() }, async ({ ruleId }) => {
    await storage.deleteRule(ruleId);
    return { content: [{ type: "text" as const, text: "Deleted" }] };
  });

  return server;
}

// Session management for stateful connections
const transports = new Map<string, StreamableHTTPServerTransport>();

// Secret path token — the MCP endpoint is only accessible at /mcp/:token
const MCP_TOKEN = process.env.MCP_TOKEN || "622ed3f5177354c59c67c85b8ad4592e";

function checkToken(req: Request, res: Response): boolean {
  if (req.params.token !== MCP_TOKEN) {
    res.status(404).json({ error: "Not found" });
    return false;
  }
  return true;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const sessionLastUsed = new Map<string, number>();

function createTransportAndServer(): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      transports.set(id, transport);
      sessionLastUsed.set(id, Date.now());
    },
  });

  // Don't delete on close — sessions persist until TTL expires
  // The transport.onclose fires after each HTTP response, which would
  // incorrectly destroy the session between sequential tool calls

  const server = createMcpServer();
  server.connect(transport);

  return transport;
}

function touchSession(sessionId: string) {
  sessionLastUsed.set(sessionId, Date.now());
}

// Cleanup stale sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, lastUsed] of sessionLastUsed.entries()) {
    if (now - lastUsed > SESSION_TTL_MS) {
      transports.delete(id);
      sessionLastUsed.delete(id);
    }
  }
}, 5 * 60 * 1000);

export function registerMcpRoutes(app: Express) {
  // Handle POST /mcp/:token
  // If session ID is unknown (e.g. after redeploy), auto-create a new session
  // so Claude doesn't need manual reconnection
  app.post("/mcp/:token", async (req: Request, res: Response) => {
    if (!checkToken(req, res)) return;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      touchSession(sessionId);
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session OR stale session after redeploy — create fresh
    const transport = createTransportAndServer();
    await transport.handleRequest(req, res, req.body);
  });

  // Handle GET /mcp/:token - SSE stream
  app.get("/mcp/:token", async (req: Request, res: Response) => {
    if (!checkToken(req, res)) return;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      touchSession(sessionId);
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      return;
    }

    // Stale or missing session — create new one
    const transport = createTransportAndServer();
    await transport.handleRequest(req, res);
  });

  // Handle DELETE /mcp/:token - session cleanup
  app.delete("/mcp/:token", async (req: Request, res: Response) => {
    if (!checkToken(req, res)) return;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      transports.delete(sessionId);
    } else {
      // Already gone (redeploy or expired) — just acknowledge
      res.status(200).json({ ok: true });
    }
  });

  console.log("MCP remote endpoint registered at /mcp/:token");
}
