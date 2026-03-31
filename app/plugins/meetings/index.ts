import type { CrmPlugin } from "../index";
import { z } from "zod";
import { followups } from "@shared/schema";
import { toNoonUTC } from "@shared/dates";
import { eq, and, isNull, gte, lte, asc } from "drizzle-orm";

const meetingsPlugin: CrmPlugin = {
  name: "meetings",

  itemTypes: [
    {
      name: "meeting",
      icon: "📅",
      slashCommands: ["/mtg", "/meeting"],
      completable: false,
      hasTime: true,
      hasLocation: true,
    },
  ],

  registerRoutes(app, ctx) {
    const { db, requireAuth } = ctx;

    // Meetings-specific routes — filter items by type: "meeting"
    app.get("/api/meetings", requireAuth, async (req, res) => {
      const contactId = req.query.contactId ? parseInt(req.query.contactId as string) : undefined;
      const today = req.query.today === "true";

      let conditions = [eq(followups.type, "meeting"), isNull(followups.cancelledAt)];
      if (contactId) conditions.push(eq(followups.contactId, contactId));
      if (today) {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end = new Date(); end.setHours(23, 59, 59, 999);
        conditions.push(gte(followups.dueDate, start), lte(followups.dueDate, end));
      }

      const result = await db.select().from(followups).where(and(...conditions)).orderBy(asc(followups.dueDate));
      res.json(result);
    });

    app.get("/api/meetings/upcoming", requireAuth, async (req, res) => {
      const hours = req.query.hours ? parseInt(req.query.hours as string) : 168;
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() + hours);

      const result = await db.select().from(followups)
        .where(and(eq(followups.type, "meeting"), isNull(followups.cancelledAt), eq(followups.completed, false), gte(followups.dueDate, now), lte(followups.dueDate, cutoff)))
        .orderBy(asc(followups.dueDate));
      res.json(result);
    });
  },

  registerTools(server, ctx) {
    const { db, broadcast, logActivity } = ctx;

    server.tool("set_meeting", "Schedule a meeting. Creates an item with type 'meeting'.", {
      contactId: z.number(),
      date: z.string().describe("Date+time ISO 8601, e.g. '2026-04-01T14:00:00'"),
      content: z.string().describe("Meeting description"),
      type: z.string().optional().describe("call (default), video, in-person, coffee — stored in metadata"),
      location: z.string().optional(),
      time: z.string().optional().describe("Display time, e.g. '2:00 PM'. Auto-parsed from date if not provided."),
    }, async ({ contactId, date, content, type: meetingType, location, time }) => {
      try {
        const d = toNoonUTC(date);
        const displayTime = time || d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const [item] = await db.insert(followups).values({
          contactId, type: "meeting", dueDate: d, content,
          time: displayTime, location,
          metadata: meetingType ? { meetingType } : null,
          completed: false,
        }).returning();
        broadcast({ type: "followup_created", contactId });
        logActivity("meeting.created", `Scheduled ${meetingType || "meeting"}: ${content}`, { contactId, source: "agent" });
        return { content: [{ type: "text" as const, text: `Meeting scheduled: ${displayTime} ${content} (ID: ${item.id})` }] };
      } catch (err: any) { return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true }; }
    });

    server.tool("get_upcoming_meetings", "List upcoming meetings.", {
      withinHours: z.number().optional().describe("Hours ahead. Default 168 (7 days)"),
      contactId: z.number().optional(),
    }, async ({ withinHours, contactId }) => {
      try {
        const now = new Date();
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() + (withinHours || 168));
        let conditions = [eq(followups.type, "meeting"), isNull(followups.cancelledAt), eq(followups.completed, false), gte(followups.dueDate, now), lte(followups.dueDate, cutoff)];
        if (contactId) conditions.push(eq(followups.contactId, contactId));
        const result = await db.select().from(followups).where(and(...conditions)).orderBy(asc(followups.dueDate));
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) { return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true }; }
    });

    server.tool("cancel_meeting", "Cancel a meeting.", { meetingId: z.number() }, async ({ meetingId }) => {
      try {
        const [item] = await db.update(followups).set({ cancelledAt: new Date() }).where(eq(followups.id, meetingId)).returning();
        if (!item) return { content: [{ type: "text" as const, text: `Meeting ${meetingId} not found` }], isError: true };
        broadcast({ type: "followup_deleted", contactId: item.contactId });
        logActivity("meeting.cancelled", "Cancelled meeting", { contactId: item.contactId, source: "agent" });
        return { content: [{ type: "text" as const, text: `Cancelled meeting ${meetingId}` }] };
      } catch (err: any) { return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true }; }
    });
  },

  ruleConditions: {
    meeting_within_hours: (params, contact, pluginData) => {
      const hours = params.hours || 24;
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() + hours);
      // Check items of type "meeting" from followups
      return false; // Will be evaluated via enriched contact data in rules engine
    },
  },

  guideText: `## Meetings
Use set_meeting to schedule meetings. Use /mtg in the UI.
Meetings appear alongside tasks in contact cards and the Upcoming strip.
After a meeting happens, log it as an interaction with add_interaction.`,
};

export default meetingsPlugin;
