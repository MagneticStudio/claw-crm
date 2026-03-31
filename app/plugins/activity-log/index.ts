import type { CrmPlugin } from "../index";
import { activityLog, type ActivityLogEntry } from "./schema";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";

const activityLogPlugin: CrmPlugin = {
  name: "activity-log",

  registerRoutes(app, ctx) {
    const { db, requireAuth } = ctx;

    app.get("/api/activity", requireAuth, async (req, res) => {
      const conditions = [];
      if (req.query.contactId) conditions.push(eq(activityLog.contactId, parseInt(req.query.contactId as string)));
      if (req.query.event) conditions.push(eq(activityLog.event, req.query.event as string));
      if (req.query.source) conditions.push(eq(activityLog.source, req.query.source as string));

      let query = db.select().from(activityLog).orderBy(desc(activityLog.createdAt));
      if (conditions.length > 0) query = query.where(and(...conditions)) as any;
      const result = await (query as any).limit(parseInt(req.query.limit as string) || 50);
      res.json(result);
    });
  },

  registerTools(server, ctx) {
    const { db } = ctx;

    server.tool("get_activity_log", "View the system activity log. Shows rule evaluations, agent actions, violations. Useful for troubleshooting.", {
      limit: z.number().optional().describe("Max entries. Default 50"),
      contactId: z.number().optional(),
      event: z.string().optional().describe("Filter: rule.evaluated, meeting.created, contact.updated, violation.created, etc."),
      source: z.string().optional().describe("Filter: system, agent, user, rule:N"),
    }, async ({ limit, contactId, event, source }) => {
      try {
        const conditions = [];
        if (contactId) conditions.push(eq(activityLog.contactId, contactId));
        if (event) conditions.push(eq(activityLog.event, event));
        if (source) conditions.push(eq(activityLog.source, source));

        let query = db.select().from(activityLog).orderBy(desc(activityLog.createdAt));
        if (conditions.length > 0) query = query.where(and(...conditions)) as any;
        const result = await (query as any).limit(limit || 50);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) { return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true }; }
    });
  },

  guideText: `## Activity Log
Use get_activity_log to see what the system and agents have been doing.
Useful for troubleshooting: rule evaluations, agent actions, violations, meeting scheduling.`,
};

export default activityLogPlugin;
