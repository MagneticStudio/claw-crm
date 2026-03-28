import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { storage } from "./storage";
import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "claw-crm",
    version: "1.0.0",
  });

  // --- Read Tools ---
  server.tool("search_contacts", "Search contacts by name, company, stage, or status", {
    query: z.string().optional().describe("Search term"),
    stage: z.string().optional(), status: z.string().optional(),
  }, async ({ query, stage, status }) => {
    let contacts = await storage.getContactsWithRelations();
    if (query) { const q = query.toLowerCase(); contacts = contacts.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || c.company?.name?.toLowerCase().includes(q)); }
    if (stage) contacts = contacts.filter(c => c.stage === stage);
    if (status) contacts = contacts.filter(c => c.status === status);
    const summary = contacts.map(c => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, company: c.company?.name, stage: c.stage, status: c.status, email: c.email, lastInteraction: c.interactions.length > 0 ? { date: c.interactions[c.interactions.length - 1].date, content: c.interactions[c.interactions.length - 1].content } : null, activeFollowups: c.followups.filter(f => !f.completed).length, violations: c.violations.length }));
    return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
  });

  server.tool("get_contact", "Get full contact details", { contactId: z.number() }, async ({ contactId }) => {
    const contact = await storage.getContactWithRelations(contactId);
    if (!contact) return { content: [{ type: "text" as const, text: "Not found" }] };
    return { content: [{ type: "text" as const, text: JSON.stringify(contact, null, 2) }] };
  });

  server.tool("get_pipeline", "Contacts grouped by stage", {}, async () => {
    const pipeline = await storage.getPipeline();
    return { content: [{ type: "text" as const, text: JSON.stringify(pipeline, null, 2) }] };
  });

  server.tool("get_dashboard", "CRM summary", {}, async () => {
    const [contacts, overdue, violations, pipeline] = await Promise.all([storage.getContacts(), storage.getOverdueFollowups(), storage.getViolations(), storage.getPipeline()]);
    const stageCounts: Record<string, number> = {};
    for (const [s, c] of Object.entries(pipeline)) stageCounts[s] = c.length;
    return { content: [{ type: "text" as const, text: JSON.stringify({ totalContacts: contacts.length, activeContacts: contacts.filter(c => c.status === "ACTIVE").length, overdueFollowups: overdue.length, activeViolations: violations.length, stageCounts }, null, 2) }] };
  });

  server.tool("list_violations", "Active rule violations", { severity: z.string().optional() }, async ({ severity }) => {
    let v = await storage.getViolations();
    if (severity) v = v.filter(x => x.severity === severity);
    return { content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] };
  });

  // --- Write Tools ---
  server.tool(
    "create_contact",
    `Create a new contact in the CRM. This is a personal advisory CRM for a solo consultant.

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
- stage: Where they are in the pipeline. Use LEAD for new contacts, MEETING if a meeting happened, PROPOSAL if a proposal was sent, NEGOTIATION if actively negotiating, LIVE if signed/active engagement, HOLD if paused, PASS if declined.
- status: ACTIVE (default), HOLD (paused), or PASS (dead)

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
      status: z.string().optional().describe("ACTIVE (default), HOLD, or PASS"),
      stage: z.string().optional().describe("LEAD, MEETING, PROPOSAL, NEGOTIATION, LIVE, HOLD, PASS, or RELATIONSHIP"),
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
      stage: z.string().optional().describe("LEAD, MEETING, PROPOSAL, NEGOTIATION, LIVE, HOLD, PASS, or RELATIONSHIP"),
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

  // --- Rules ---
  server.tool("list_rules", "List business rules", { enabled: z.boolean().optional() }, async ({ enabled }) => {
    const rules = await storage.getRules(enabled);
    return { content: [{ type: "text" as const, text: JSON.stringify(rules, null, 2) }] };
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

  server.tool("update_rule", "Update a rule", { ruleId: z.number(), name: z.string().optional(), description: z.string().optional(), enabled: z.boolean().optional() }, async ({ ruleId, ...data }) => {
    const filtered = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
    const rule = await storage.updateRule(ruleId, filtered);
    if (!rule) return { content: [{ type: "text" as const, text: "Not found" }] };
    return { content: [{ type: "text" as const, text: `Updated rule: "${rule.name}"` }] };
  });

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

function createTransportAndServer(): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      transports.set(id, transport);
    },
  });

  transport.onclose = () => {
    const id = [...transports.entries()].find(([, t]) => t === transport)?.[0];
    if (id) transports.delete(id);
  };

  const server = createMcpServer();
  server.connect(transport);

  return transport;
}

export function registerMcpRoutes(app: Express) {
  // Handle POST /mcp/:token
  // If session ID is unknown (e.g. after redeploy), auto-create a new session
  // so Claude doesn't need manual reconnection
  app.post("/mcp/:token", async (req: Request, res: Response) => {
    if (!checkToken(req, res)) return;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session OR stale session after redeploy — create fresh
    const transport = createTransportAndServer();
    await transport.handleRequest(req, res, req.body);
  });

  // Handle GET /mcp/:token - SSE stream
  // If session is stale, create a new one instead of erroring
  app.get("/mcp/:token", async (req: Request, res: Response) => {
    if (!checkToken(req, res)) return;
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
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
