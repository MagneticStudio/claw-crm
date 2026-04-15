import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { searchService } from "./search";
import { setupAuth, requireAuth } from "./auth";
import { sseManager } from "./sse";
import {
  insertContactSchema,
  insertCompanySchema,
  insertInteractionSchema,
  insertFollowupSchema,
  insertRuleSchema,
  briefings,
  activityLog,
  followups,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, isNull, gte, lte, asc, desc } from "drizzle-orm";
import { toNoonUTC } from "@shared/dates";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Remote MCP endpoint (no auth — Claude handles its own session)
  const { registerMcpRoutes } = await import("./mcp-remote");
  registerMcpRoutes(app);

  // --- Public config (no auth — needed for login page branding) ---
  app.get("/api/config", async (_req, res) => {
    const user = await storage.getFirstUser();
    res.json({
      orgName: user?.orgName || "Claw CRM",
      primaryColor: user?.primaryColor || "#2bbcb3",
      upcomingDays: user?.upcomingDays ?? 7,
    });
  });

  // --- Settings (auth required) ---
  app.get("/api/settings", requireAuth, async (req, res) => {
    const user = await storage.getFirstUser();
    if (!user) return res.status(404).json({ message: "No user" });
    res.json({
      orgName: user.orgName,
      primaryColor: user.primaryColor,
      upcomingDays: user.upcomingDays,
      apiKey: user.apiKey,
      mcpToken: user.mcpToken,
    });
  });

  app.put("/api/settings", requireAuth, async (req, res) => {
    const user = await storage.getFirstUser();
    if (!user) return res.status(404).json({ message: "No user" });
    const { orgName, primaryColor, upcomingDays } = req.body;
    const updates: Record<string, string | number> = {};
    if (orgName !== undefined) updates.orgName = orgName;
    if (primaryColor !== undefined) updates.primaryColor = primaryColor;
    if (upcomingDays !== undefined) updates.upcomingDays = upcomingDays;
    const updated = await storage.updateUser(user.id, updates);
    res.json({ orgName: updated?.orgName });
  });

  app.post("/api/settings/regenerate-api-key", requireAuth, async (req, res) => {
    const { randomBytes } = await import("crypto");
    const user = await storage.getFirstUser();
    if (!user) return res.status(404).json({ message: "No user" });
    const apiKey = `claw_${randomBytes(24).toString("hex")}`;
    await storage.updateUser(user.id, { apiKey });
    res.json({ apiKey });
  });

  app.post("/api/settings/regenerate-mcp-token", requireAuth, async (req, res) => {
    const { randomBytes } = await import("crypto");
    const user = await storage.getFirstUser();
    if (!user) return res.status(404).json({ message: "No user" });
    const mcpToken = randomBytes(16).toString("hex");
    await storage.updateUser(user.id, { mcpToken });
    res.json({ mcpToken });
  });

  app.post("/api/settings/change-pin", requireAuth, async (req, res) => {
    const { currentPin, newPin } = req.body;
    if (!currentPin || !newPin || newPin.length < 4 || newPin.length > 6) {
      return res.status(400).json({ message: "Invalid PIN" });
    }
    const user = await storage.getFirstUser();
    if (!user) return res.status(404).json({ message: "No user" });
    // Verify current PIN
    const { hashPin } = await import("./auth");
    const scrypt = await import("crypto").then((m) => m.scrypt);
    const { timingSafeEqual } = await import("crypto");
    const { promisify } = await import("util");
    const scryptAsync = promisify(scrypt);
    const [hashed, salt] = user.pin.split(".");
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(currentPin, salt, 64)) as Buffer;
    if (!timingSafeEqual(hashedBuf, suppliedBuf)) {
      return res.status(401).json({ message: "Current PIN is incorrect" });
    }
    const newHashedPin = await hashPin(newPin);
    await storage.updateUser(user.id, { pin: newHashedPin });
    res.json({ ok: true });
  });

  // --- SSE ---
  app.get("/api/events", requireAuth, (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write('data: {"type":"connected"}\n\n');
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

  // --- Search ---
  app.get("/api/search", requireAuth, async (req, res) => {
    const q = (req.query.q as string) || "";
    if (q.length < 2) return res.json({ results: [], totalCount: 0, hasMore: false });
    const result = await searchService.search(q, {
      stage: req.query.stage as string | undefined,
      status: req.query.status as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
    });
    res.json(result);
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
    const data = { ...req.body, date: toNoonUTC(req.body.date) };
    const parsed = insertInteractionSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const interaction = await storage.createInteraction(parsed.data);
    res.status(201).json(interaction);
  });

  app.put("/api/interactions/:id", requireAuth, async (req, res) => {
    const data = req.body.date ? { ...req.body, date: toNoonUTC(req.body.date) } : req.body;
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
    const data = { ...req.body, dueDate: toNoonUTC(req.body.dueDate) };
    const parsed = insertFollowupSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const followup = await storage.createFollowup(parsed.data);
    res.status(201).json(followup);
  });

  app.put("/api/followups/:id", requireAuth, async (req, res) => {
    const data = req.body.dueDate ? { ...req.body, dueDate: toNoonUTC(req.body.dueDate) } : req.body;
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
        date: toNoonUTC(new Date()),
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
    const conditions = [eq(followups.type, "meeting"), isNull(followups.cancelledAt)];
    if (contactId) conditions.push(eq(followups.contactId, contactId));
    if (today) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      conditions.push(gte(followups.dueDate, start), lte(followups.dueDate, end));
    }
    const result = await db
      .select()
      .from(followups)
      .where(and(...conditions))
      .orderBy(asc(followups.dueDate));
    res.json(result);
  });

  app.get("/api/meetings/upcoming", requireAuth, async (req, res) => {
    const hours = req.query.hours ? parseInt(req.query.hours as string) : 168;
    const now = new Date();
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() + hours);
    const result = await db
      .select()
      .from(followups)
      .where(
        and(
          eq(followups.type, "meeting"),
          isNull(followups.cancelledAt),
          eq(followups.completed, false),
          gte(followups.dueDate, now),
          lte(followups.dueDate, cutoff),
        ),
      )
      .orderBy(asc(followups.dueDate));
    res.json(result);
  });

  // --- Briefings ---
  app.get("/api/briefings/:contactId", requireAuth, async (req, res) => {
    const [briefing] = await db
      .select()
      .from(briefings)
      .where(eq(briefings.contactId, parseInt(req.params.contactId)));
    if (!briefing) return res.status(404).json({ message: "No briefing found" });
    res.json(briefing);
  });

  app.put("/api/briefings/:contactId", requireAuth, async (req, res) => {
    const { content } = req.body;
    if (!content || typeof content !== "string") return res.status(400).json({ message: "content required" });
    const contactId = parseInt(req.params.contactId);
    const [existing] = await db.select().from(briefings).where(eq(briefings.contactId, contactId));
    let result;
    if (existing) {
      [result] = await db
        .update(briefings)
        .set({ content, updatedAt: new Date() })
        .where(eq(briefings.contactId, contactId))
        .returning();
    } else {
      [result] = await db.insert(briefings).values({ contactId, content }).returning();
    }
    sseManager.broadcast({ type: "briefing_updated", contactId });
    storage.logActivity("briefing.saved", `Briefing updated (${content.length} chars)`, { contactId, source: "agent" });
    searchService.invalidate();
    res.json(result);
  });

  app.delete("/api/briefings/:contactId", requireAuth, async (req, res) => {
    const result = await db
      .delete(briefings)
      .where(eq(briefings.contactId, parseInt(req.params.contactId)))
      .returning();
    if (result.length === 0) return res.status(404).json({ message: "Briefing not found" });
    sseManager.broadcast({ type: "briefing_deleted", contactId: parseInt(req.params.contactId) });
    searchService.invalidate();
    res.status(204).send();
  });

  // --- Activity Log ---
  app.get("/api/activity", requireAuth, async (req, res) => {
    const conditions = [];
    if (req.query.contactId) conditions.push(eq(activityLog.contactId, parseInt(req.query.contactId as string)));
    if (req.query.event) conditions.push(eq(activityLog.event, req.query.event as string));
    if (req.query.source) conditions.push(eq(activityLog.source, req.query.source as string));
    const baseQuery = db.select().from(activityLog).orderBy(desc(activityLog.createdAt));
    const filtered = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;
    const result = await filtered.limit(parseInt(req.query.limit as string) || 50);
    res.json(result);
  });

  // --- Pipeline ---
  app.get("/api/pipeline", requireAuth, async (_req, res) => {
    const pipeline = await storage.getPipeline();
    res.json(pipeline);
  });

  // --- Dashboard ---
  app.get("/api/dashboard", requireAuth, async (_req, res) => {
    const [contacts, overdueFollowups, violations, pipeline] = await Promise.all([
      storage.getContacts(),
      storage.getOverdueFollowups(),
      storage.getViolations(),
      storage.getPipeline(),
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
      stageCounts,
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}
