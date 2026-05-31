// Auto-cleanup of stale briefings. Briefings are designed ephemeral (one per
// contact, replaced at each prep) but the server doesn't currently prune them.
// Briefings whose linked meeting has been marked completed and which are older
// than BRIEFING_STALE_DAYS are deleted on a daily schedule.
//
// See issue #126.
import { db } from "./db";
import { briefings, followups } from "@shared/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { BRIEFING_STALE_DAYS } from "@shared/briefing";
import { sseManager } from "./sse";
import { storage } from "./storage";

export interface CleanupResult {
  deleted: number;
  contactIds: number[];
}

/**
 * Delete briefings whose linked meeting is completed AND whose updatedAt is
 * older than BRIEFING_STALE_DAYS. Briefings without a meetingId, or whose
 * linked meeting is still pending, are left alone — agents may still want to
 * refresh them rather than delete outright.
 */
export async function cleanupStaleBriefings(): Promise<CleanupResult> {
  const cutoff = new Date(Date.now() - BRIEFING_STALE_DAYS * 24 * 60 * 60 * 1000);

  // Find briefings whose linked meeting is completed and which are older than cutoff.
  const stale = await db
    .select({ id: briefings.id, contactId: briefings.contactId })
    .from(briefings)
    .innerJoin(followups, eq(briefings.meetingId, followups.id))
    .where(and(eq(followups.completed, true), lt(briefings.updatedAt, cutoff)));

  if (stale.length === 0) {
    return { deleted: 0, contactIds: [] };
  }

  const ids = stale.map((r) => r.id);
  await db.delete(briefings).where(sql`${briefings.id} in (${sql.join(ids, sql`, `)})`);

  for (const row of stale) {
    sseManager.broadcast({ type: "briefing_deleted", contactId: row.contactId });
  }
  await storage.logActivity(
    "briefing.cleanup",
    `Auto-deleted ${stale.length} stale briefing${stale.length === 1 ? "" : "s"} (meeting completed, age > ${BRIEFING_STALE_DAYS}d)`,
    { source: "system", metadata: { contactIds: stale.map((r) => r.contactId) } },
  );

  return { deleted: stale.length, contactIds: stale.map((r) => r.contactId) };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Start a periodic cleanup. Runs once at boot and then every `intervalMs`.
 */
export function startBriefingCleanupScheduler(intervalMs: number = DAY_MS): NodeJS.Timeout {
  console.warn(`Briefing cleanup: scheduled every ${intervalMs / 1000 / 60 / 60} hours`);
  cleanupStaleBriefings().catch((err) => console.error("Briefing cleanup failed:", err));
  return setInterval(() => {
    cleanupStaleBriefings().catch((err) => console.error("Briefing cleanup failed:", err));
  }, intervalMs);
}
