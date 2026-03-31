import type { CrmPlugin } from "../index";
import { briefings, type Briefing } from "./schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const briefingsPlugin: CrmPlugin = {
  name: "briefings",

  registerRoutes(app, ctx) {
    const { db, broadcast, logActivity, requireAuth } = ctx;

    app.get("/api/briefings/:contactId", requireAuth, async (req, res) => {
      const [briefing] = await db.select().from(briefings).where(eq(briefings.contactId, parseInt(req.params.contactId)));
      if (!briefing) return res.status(404).json({ message: "No briefing found" });
      res.json(briefing);
    });

    app.put("/api/briefings/:contactId", requireAuth, async (req, res) => {
      const { content } = req.body;
      if (!content || typeof content !== "string") return res.status(400).json({ message: "content required" });
      const contactId = parseInt(req.params.contactId);
      const [existing] = await db.select().from(briefings).where(eq(briefings.contactId, contactId));
      let result: Briefing;
      if (existing) {
        [result] = await db.update(briefings).set({ content, updatedAt: new Date() }).where(eq(briefings.contactId, contactId)).returning();
      } else {
        [result] = await db.insert(briefings).values({ contactId, content }).returning();
      }
      broadcast({ type: "briefing_updated", contactId });
      logActivity("briefing.saved", `Briefing updated (${content.length} chars)`, { contactId, source: "agent" });
      res.json(result);
    });

    app.delete("/api/briefings/:contactId", requireAuth, async (req, res) => {
      const result = await db.delete(briefings).where(eq(briefings.contactId, parseInt(req.params.contactId))).returning();
      if (result.length === 0) return res.status(404).json({ message: "Briefing not found" });
      broadcast({ type: "briefing_deleted", contactId: parseInt(req.params.contactId) });
      res.status(204).send();
    });
  },

  registerTools(server, ctx) {
    const { db, broadcast, logActivity } = ctx;

    server.tool("save_briefing", "Save a meeting prep briefing for a contact. One per contact (upsert). Use bullet points for scannability.", {
      contactId: z.number(), content: z.string().describe("Briefing text — talking points, context, prep notes"),
    }, async ({ contactId, content }) => {
      try {
        const [existing] = await db.select().from(briefings).where(eq(briefings.contactId, contactId));
        if (existing) {
          await db.update(briefings).set({ content, updatedAt: new Date() }).where(eq(briefings.contactId, contactId));
        } else {
          await db.insert(briefings).values({ contactId, content });
        }
        broadcast({ type: "briefing_updated", contactId });
        logActivity("briefing.saved", `Briefing saved (${content.length} chars)`, { contactId, source: "agent" });
        return { content: [{ type: "text" as const, text: `Briefing saved for contact ${contactId} (${content.length} chars)` }] };
      } catch (err: any) { return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true }; }
    });

    server.tool("get_briefing", "Get the prep briefing for a contact.", {
      contactId: z.number(),
    }, async ({ contactId }) => {
      try {
        const [b] = await db.select().from(briefings).where(eq(briefings.contactId, contactId));
        if (!b) return { content: [{ type: "text" as const, text: `No briefing for contact ${contactId}` }] };
        return { content: [{ type: "text" as const, text: b.content }] };
      } catch (err: any) { return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true }; }
    });
  },

  badges: [
    {
      dataKey: "briefing",
      icon: "📋",
      route: "/briefings/:contactId",
      tooltip: "View briefing",
    },
  ],

  async enrichContact(contactId, ctx) {
    const [briefing] = await ctx.db.select().from(briefings).where(eq(briefings.contactId, contactId));
    return { briefing: briefing ?? null };
  },

  guideText: `## Briefings
Use save_briefing to store prep notes for a contact (one per contact, upsert).
Good for: talking points, recent news, open items before a meeting.`,
};

export default briefingsPlugin;
