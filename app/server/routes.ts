import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth } from "./auth";
import { sseManager } from "./sse";
import {
  insertContactSchema,
  insertCompanySchema,
  insertInteractionSchema,
  insertFollowupSchema,
  insertMeetingSchema,
  insertRuleSchema,
} from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Remote MCP endpoint (no auth — Claude handles its own session)
  const { registerMcpRoutes } = await import("./mcp-remote");
  registerMcpRoutes(app);

  // --- SSE ---
  app.get("/api/events", requireAuth, (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("data: {\"type\":\"connected\"}\n\n");
    sseManager.addClient(res);
  });

  // --- Contacts ---
  app.get("/api/contacts", requireAuth, async (_req, res) => {
    const contacts = await storage.getContactsWithRelations();
    res.json(contacts);
  });

  app.get("/api/contacts/:id", requireAuth, async (req, res) => {
    const contact = await storage.getContactWithRelations(parseInt(req.params.id));
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.json(contact);
  });

  app.post("/api/contacts", requireAuth, async (req, res) => {
    const parsed = insertContactSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const contact = await storage.createContact(parsed.data);
    res.status(201).json(contact);
  });

  app.put("/api/contacts/:id", requireAuth, async (req, res) => {
    const contact = await storage.updateContact(parseInt(req.params.id), req.body);
    if (!contact) return res.status(404).json({ message: "Contact not found" });
    res.json(contact);
  });

  app.delete("/api/contacts/:id", requireAuth, async (req, res) => {
    const deleted = await storage.deleteContact(parseInt(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Contact not found" });
    res.status(204).send();
  });

  app.patch("/api/contacts/reorder", requireAuth, async (req, res) => {
    const { orders } = req.body; // [{ id, sortOrder }]
    if (!Array.isArray(orders)) return res.status(400).json({ message: "orders array required" });
    for (const { id, sortOrder } of orders) {
      await storage.updateContact(id, { sortOrder });
    }
    res.json({ ok: true });
  });

  // --- Companies ---
  app.get("/api/companies", requireAuth, async (_req, res) => {
    const companies = await storage.getCompanies();
    res.json(companies);
  });

  app.post("/api/companies", requireAuth, async (req, res) => {
    const parsed = insertCompanySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const company = await storage.createCompany(parsed.data);
    res.status(201).json(company);
  });

  app.put("/api/companies/:id", requireAuth, async (req, res) => {
    const company = await storage.updateCompany(parseInt(req.params.id), req.body);
    if (!company) return res.status(404).json({ message: "Company not found" });
    res.json(company);
  });

  // --- Interactions ---
  app.get("/api/interactions", requireAuth, async (req, res) => {
    const contactId = req.query.contactId ? parseInt(req.query.contactId as string) : undefined;
    if (!contactId) return res.status(400).json({ message: "contactId required" });
    const interactions = await storage.getInteractions(contactId);
    res.json(interactions);
  });

  app.post("/api/interactions", requireAuth, async (req, res) => {
    const data = { ...req.body, date: new Date(req.body.date) };
    const parsed = insertInteractionSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const interaction = await storage.createInteraction(parsed.data);
    res.status(201).json(interaction);
  });

  app.put("/api/interactions/:id", requireAuth, async (req, res) => {
    const data = req.body.date ? { ...req.body, date: new Date(req.body.date) } : req.body;
    const interaction = await storage.updateInteraction(parseInt(req.params.id), data);
    if (!interaction) return res.status(404).json({ message: "Interaction not found" });
    res.json(interaction);
  });

  app.delete("/api/interactions/:id", requireAuth, async (req, res) => {
    const deleted = await storage.deleteInteraction(parseInt(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Interaction not found" });
    res.status(204).send();
  });

  // --- Follow-ups ---
  app.get("/api/followups", requireAuth, async (req, res) => {
    const contactId = req.query.contactId ? parseInt(req.query.contactId as string) : undefined;
    const overdue = req.query.overdue === "true";
    if (overdue) {
      const followups = await storage.getOverdueFollowups();
      return res.json(followups);
    }
    const followups = await storage.getFollowups(contactId);
    res.json(followups);
  });

  app.post("/api/followups", requireAuth, async (req, res) => {
    const data = { ...req.body, dueDate: new Date(req.body.dueDate) };
    const parsed = insertFollowupSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const followup = await storage.createFollowup(parsed.data);
    res.status(201).json(followup);
  });

  app.put("/api/followups/:id", requireAuth, async (req, res) => {
    const data = req.body.dueDate ? { ...req.body, dueDate: new Date(req.body.dueDate) } : req.body;
    const followup = await storage.updateFollowup(parseInt(req.params.id), data);
    if (!followup) return res.status(404).json({ message: "Follow-up not found" });
    res.json(followup);
  });

  app.post("/api/followups/:id/complete", requireAuth, async (req, res) => {
    const followup = await storage.completeFollowup(parseInt(req.params.id));
    if (!followup) return res.status(404).json({ message: "Follow-up not found" });

    // If outcome text is provided, log it as an interaction
    const { outcome } = req.body || {};
    if (outcome && typeof outcome === "string" && outcome.trim()) {
      await storage.createInteraction({
        contactId: followup.contactId,
        content: outcome.trim(),
        date: new Date(),
        type: "note",
      });
    }

    res.json(followup);
  });

  app.delete("/api/followups/:id", requireAuth, async (req, res) => {
    const deleted = await storage.deleteFollowup(parseInt(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Follow-up not found" });
    res.status(204).send();
  });

  // --- Rules ---
  app.get("/api/rules", requireAuth, async (req, res) => {
    const enabledOnly = req.query.enabled === "true";
    const rules = await storage.getRules(enabledOnly);
    res.json(rules);
  });

  app.get("/api/rules/:id", requireAuth, async (req, res) => {
    const rule = await storage.getRule(parseInt(req.params.id));
    if (!rule) return res.status(404).json({ message: "Rule not found" });
    res.json(rule);
  });

  app.post("/api/rules", requireAuth, async (req, res) => {
    const parsed = insertRuleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const rule = await storage.createRule(parsed.data);
    res.status(201).json(rule);
  });

  app.put("/api/rules/:id", requireAuth, async (req, res) => {
    const rule = await storage.updateRule(parseInt(req.params.id), req.body);
    if (!rule) return res.status(404).json({ message: "Rule not found" });
    res.json(rule);
  });

  app.delete("/api/rules/:id", requireAuth, async (req, res) => {
    const deleted = await storage.deleteRule(parseInt(req.params.id));
    if (!deleted) return res.status(404).json({ message: "Rule not found" });
    res.status(204).send();
  });

  // --- Violations ---
  app.get("/api/violations", requireAuth, async (req, res) => {
    const contactId = req.query.contactId ? parseInt(req.query.contactId as string) : undefined;
    const violations = await storage.getViolations(contactId);
    res.json(violations);
  });

  app.post("/api/violations/:id/resolve", requireAuth, async (req, res) => {
    const violation = await storage.resolveViolation(parseInt(req.params.id));
    if (!violation) return res.status(404).json({ message: "Violation not found" });
    res.json(violation);
  });

  // --- Meetings ---
  app.get("/api/meetings", requireAuth, async (req, res) => {
    const contactId = req.query.contactId ? parseInt(req.query.contactId as string) : undefined;
    const today = req.query.today === "true";
    if (today) return res.json(await storage.getTodaysMeetings());
    res.json(await storage.getMeetings(contactId));
  });

  app.get("/api/meetings/upcoming", requireAuth, async (req, res) => {
    const hours = req.query.hours ? parseInt(req.query.hours as string) : undefined;
    res.json(await storage.getUpcomingMeetings(hours));
  });

  app.post("/api/meetings", requireAuth, async (req, res) => {
    const data = { ...req.body, date: new Date(req.body.date) };
    const parsed = insertMeetingSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const meeting = await storage.createMeeting(parsed.data);
    res.status(201).json(meeting);
  });

  app.put("/api/meetings/:id", requireAuth, async (req, res) => {
    const data = req.body.date ? { ...req.body, date: new Date(req.body.date) } : req.body;
    const meeting = await storage.updateMeeting(parseInt(req.params.id), data);
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    res.json(meeting);
  });

  app.post("/api/meetings/:id/cancel", requireAuth, async (req, res) => {
    const meeting = await storage.cancelMeeting(parseInt(req.params.id));
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    res.json(meeting);
  });

  app.post("/api/meetings/:id/complete", requireAuth, async (req, res) => {
    const meeting = await storage.completeMeeting(parseInt(req.params.id));
    if (!meeting) return res.status(404).json({ message: "Meeting not found" });
    res.json(meeting);
  });

  // --- Briefings ---
  app.get("/api/briefings/:contactId", requireAuth, async (req, res) => {
    const briefing = await storage.getBriefing(parseInt(req.params.contactId));
    if (!briefing) return res.status(404).json({ message: "No briefing found" });
    res.json(briefing);
  });

  app.put("/api/briefings/:contactId", requireAuth, async (req, res) => {
    const { content } = req.body;
    if (!content || typeof content !== "string") return res.status(400).json({ message: "content required" });
    const briefing = await storage.saveBriefing(parseInt(req.params.contactId), content);
    res.json(briefing);
  });

  app.delete("/api/briefings/:contactId", requireAuth, async (req, res) => {
    const deleted = await storage.deleteBriefing(parseInt(req.params.contactId));
    if (!deleted) return res.status(404).json({ message: "Briefing not found" });
    res.status(204).send();
  });

  // --- Activity Log ---
  app.get("/api/activity", requireAuth, async (req, res) => {
    const opts: any = {};
    if (req.query.limit) opts.limit = parseInt(req.query.limit as string);
    if (req.query.contactId) opts.contactId = parseInt(req.query.contactId as string);
    if (req.query.event) opts.event = req.query.event;
    if (req.query.source) opts.source = req.query.source;
    const log = await storage.getActivityLog(opts);
    res.json(log);
  });

  // --- Pipeline ---
  app.get("/api/pipeline", requireAuth, async (_req, res) => {
    const pipeline = await storage.getPipeline();
    res.json(pipeline);
  });

  // --- Dashboard ---
  app.get("/api/dashboard", requireAuth, async (_req, res) => {
    const [contacts, overdueFollowups, violations, pipeline, todaysMeetings] = await Promise.all([
      storage.getContacts(),
      storage.getOverdueFollowups(),
      storage.getViolations(),
      storage.getPipeline(),
      storage.getTodaysMeetings(),
    ]);

    const stageCounts: Record<string, number> = {};
    for (const [stage, stageContacts] of Object.entries(pipeline)) {
      stageCounts[stage] = stageContacts.length;
    }

    res.json({
      totalContacts: contacts.length,
      activeContacts: contacts.filter((c) => c.status === "ACTIVE").length,
      overdueFollowups: overdueFollowups.length,
      activeViolations: violations.length,
      todaysMeetings: todaysMeetings.length,
      stageCounts,
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
