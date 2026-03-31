import { eq, and, isNull, lte, gte, asc } from "drizzle-orm";
import { meetings, type Meeting, type InsertMeeting } from "./schema";
import type { PluginContext } from "../index";

export function createMeetingsStorage(ctx: PluginContext) {
  const { db, broadcast, logActivity } = ctx;

  return {
    async getMeetings(contactId?: number): Promise<Meeting[]> {
      if (contactId) return db.select().from(meetings).where(and(eq(meetings.contactId, contactId), isNull(meetings.cancelledAt))).orderBy(asc(meetings.date));
      return db.select().from(meetings).where(isNull(meetings.cancelledAt)).orderBy(asc(meetings.date));
    },

    async getUpcomingMeetings(withinHours?: number): Promise<Meeting[]> {
      const now = new Date();
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() + (withinHours || 24 * 7));
      return db.select().from(meetings)
        .where(and(isNull(meetings.cancelledAt), eq(meetings.completed, false), gte(meetings.date, now), lte(meetings.date, cutoff)))
        .orderBy(asc(meetings.date));
    },

    async getTodaysMeetings(): Promise<Meeting[]> {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      return db.select().from(meetings)
        .where(and(isNull(meetings.cancelledAt), gte(meetings.date, start), lte(meetings.date, end)))
        .orderBy(asc(meetings.date));
    },

    async getMeeting(id: number): Promise<Meeting | undefined> {
      const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id));
      return meeting;
    },

    async createMeeting(data: InsertMeeting): Promise<Meeting> {
      const [meeting] = await db.insert(meetings).values(data).returning();
      broadcast({ type: "meeting_created", contactId: data.contactId, meetingId: meeting.id });
      logActivity("meeting.created", `Scheduled ${data.type || "call"} for ${new Date(data.date).toLocaleString()}`, { contactId: data.contactId, source: "agent", metadata: { meetingId: meeting.id } });
      return meeting;
    },

    async updateMeeting(id: number, data: Partial<InsertMeeting>): Promise<Meeting | undefined> {
      const [meeting] = await db.update(meetings).set(data).where(eq(meetings.id, id)).returning();
      if (meeting) broadcast({ type: "meeting_updated", contactId: meeting.contactId });
      return meeting;
    },

    async cancelMeeting(id: number): Promise<Meeting | undefined> {
      const [meeting] = await db.update(meetings).set({ cancelledAt: new Date() }).where(eq(meetings.id, id)).returning();
      if (meeting) {
        broadcast({ type: "meeting_cancelled", contactId: meeting.contactId });
        logActivity("meeting.cancelled", "Cancelled meeting", { contactId: meeting.contactId, source: "agent", metadata: { meetingId: id } });
      }
      return meeting;
    },

    async completeMeeting(id: number): Promise<Meeting | undefined> {
      const [meeting] = await db.update(meetings).set({ completed: true }).where(eq(meetings.id, id)).returning();
      if (meeting) broadcast({ type: "meeting_completed", contactId: meeting.contactId });
      return meeting;
    },

    async enrichContact(contactId: number): Promise<Meeting[]> {
      return db.select().from(meetings)
        .where(and(eq(meetings.contactId, contactId), isNull(meetings.cancelledAt), eq(meetings.completed, false)))
        .orderBy(asc(meetings.date));
    },
  };
}
