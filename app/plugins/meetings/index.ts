import type { CrmPlugin } from "../index";
import { createMeetingsStorage } from "./storage";
import { insertMeetingSchema } from "./schema";
import { z } from "zod";

const meetingsPlugin: CrmPlugin = {
  name: "meetings",

  registerRoutes(app, ctx) {
    const store = createMeetingsStorage(ctx);

    app.get("/api/meetings", ctx.requireAuth, async (req, res) => {
      const contactId = req.query.contactId ? parseInt(req.query.contactId as string) : undefined;
      if (req.query.today === "true") return res.json(await store.getTodaysMeetings());
      res.json(await store.getMeetings(contactId));
    });

    app.get("/api/meetings/upcoming", ctx.requireAuth, async (req, res) => {
      const hours = req.query.hours ? parseInt(req.query.hours as string) : undefined;
      res.json(await store.getUpcomingMeetings(hours));
    });

    app.post("/api/meetings", ctx.requireAuth, async (req, res) => {
      const data = { ...req.body, date: new Date(req.body.date) };
      const parsed = insertMeetingSchema.safeParse(data);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.status(201).json(await store.createMeeting(parsed.data));
    });

    app.put("/api/meetings/:id", ctx.requireAuth, async (req, res) => {
      const data = req.body.date ? { ...req.body, date: new Date(req.body.date) } : req.body;
      const meeting = await store.updateMeeting(parseInt(req.params.id), data);
      if (!meeting) return res.status(404).json({ message: "Meeting not found" });
      res.json(meeting);
    });

    app.post("/api/meetings/:id/cancel", ctx.requireAuth, async (req, res) => {
      const meeting = await store.cancelMeeting(parseInt(req.params.id));
      if (!meeting) return res.status(404).json({ message: "Meeting not found" });
      res.json(meeting);
    });

    app.post("/api/meetings/:id/complete", ctx.requireAuth, async (req, res) => {
      const meeting = await store.completeMeeting(parseInt(req.params.id));
      if (!meeting) return res.status(404).json({ message: "Meeting not found" });
      res.json(meeting);
    });
  },

  registerTools(server, ctx) {
    const store = createMeetingsStorage(ctx);

    server.tool("set_meeting", "Schedule a meeting with a contact. Types: call, video, in-person, coffee.", {
      contactId: z.number(), date: z.string().describe("Date+time ISO 8601"),
      type: z.string().optional().describe("call (default), video, in-person, coffee"),
      location: z.string().optional(), notes: z.string().optional(),
    }, async ({ contactId, date, type, location, notes }) => {
      try {
        const m = await store.createMeeting({ contactId, date: new Date(date), type: type || "call", location, notes, completed: false });
        return { content: [{ type: "text" as const, text: `Meeting scheduled: ${m.type} on ${new Date(date).toLocaleString()} (ID: ${m.id})` }] };
      } catch (err: any) { return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true }; }
    });

    server.tool("get_upcoming_meetings", "List upcoming meetings across all contacts.", {
      withinHours: z.number().optional().describe("How far ahead in hours. Default 168 (7 days)"),
      contactId: z.number().optional(),
    }, async ({ withinHours, contactId }) => {
      try {
        let result;
        if (contactId) {
          result = (await store.getMeetings(contactId)).filter(m => !m.completed && new Date(m.date) >= new Date());
        } else {
          result = await store.getUpcomingMeetings(withinHours);
        }
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) { return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true }; }
    });

    server.tool("cancel_meeting", "Cancel a scheduled meeting (soft-delete).", {
      meetingId: z.number(),
    }, async ({ meetingId }) => {
      try {
        const m = await store.cancelMeeting(meetingId);
        if (!m) return { content: [{ type: "text" as const, text: `Meeting ${meetingId} not found` }], isError: true };
        return { content: [{ type: "text" as const, text: `Cancelled meeting ${meetingId}` }] };
      } catch (err: any) { return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true }; }
    });
  },

  async enrichContact(contactId, ctx) {
    const store = createMeetingsStorage(ctx);
    return { meetings: await store.enrichContact(contactId) };
  },

  ruleConditions: {
    meeting_within_hours: (params, contact, pluginData) => {
      const hours = params.hours || 24;
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() + hours);
      const contactMeetings = (pluginData.meetings || []) as any[];
      return contactMeetings.some((m: any) => !m.completed && !m.cancelledAt && new Date(m.date) >= now && new Date(m.date) <= cutoff);
    },
  },

  guideText: `## Meetings
Use set_meeting to schedule meetings. Types: call, video, in-person, coffee.
Meetings appear in the "Today" view. After a meeting happens, log it as an interaction with add_interaction.`,
};

export default meetingsPlugin;
