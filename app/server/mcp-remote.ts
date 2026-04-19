/* eslint-disable no-console */
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { storage } from "./storage";
import { toNoonUTC, parseDateToNoonUTC } from "@shared/dates";
import {
  briefings,
  followups,
  contacts,
  STAGES,
  STATUSES,
  INTERACTION_TYPES,
  TASK_TYPES,
  SEVERITIES,
  MEETING_TYPES,
  CONDITION_TYPES,
  EXCEPTION_TYPES,
} from "@shared/schema";
import type { InsertContact } from "@shared/schema";
import {
  JOURNAL_SKELETON,
  validateJournalContent,
  appendJournalEntry,
  hashJournal,
  JOURNAL_SIZE_LIMIT,
  isReasonableIsoDate,
  peekLastEntry,
  readJournalSection,
  CANONICAL_SECTIONS,
  OPTIONAL_SECTIONS,
  ACCEPTED_DATE_FORMATS,
  todayIso,
} from "@shared/journal";
import { db } from "./db";
import { eq, and, isNull, gte, lte, asc, sql } from "drizzle-orm";
import { sseManager } from "./sse";
import { searchService } from "./search";
import type { Express, Request, Response } from "express";
import { randomUUID } from "crypto";

// --- Helpers ---

async function findOrCreateCompany(name: string): Promise<number> {
  const allCompanies = await storage.getCompanies();
  const match = allCompanies.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (match) return match.id;
  const created = await storage.createCompany({ name });
  return created.id;
}

/** Resolve contactId → "FirstName LastName" for enriching list responses */
async function contactNameMap(contactIds: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(contactIds)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
    .from(contacts)
    .where(sql`${contacts.id} IN ${unique}`);
  return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName}`]));
}

// Zod enums from shared constants
const stageEnum = z.enum(STAGES);
const statusEnum = z.enum(STATUSES);
const interactionTypeEnum = z.enum(INTERACTION_TYPES);
const taskTypeEnum = z.enum(TASK_TYPES);
const severityEnum = z.enum(SEVERITIES);
const meetingTypeEnum = z.enum(MEETING_TYPES);
const conditionTypeEnum = z.enum(CONDITION_TYPES);

/** Extract a message string from an unknown thrown value */
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Build an actionable error message with guidance on how to fix the call */
function actionableError(operation: string, err: unknown, hints?: string): string {
  const base = `Error ${operation}: ${errMsg(err)}`;
  if (hints) return `${base}\n\nHint: ${hints}`;

  // Auto-detect common issues and add guidance
  const msg = (err instanceof Error ? err.message : "").toLowerCase();
  if (msg.includes("invalid input syntax for type integer"))
    return `${base}\n\nHint: The ID parameter must be a number. Use search_contacts to find valid IDs.`;
  if (msg.includes("not null") || msg.includes("violates not-null"))
    return `${base}\n\nHint: A required field is missing. Check the tool parameters.`;
  if (msg.includes("foreign key") || msg.includes("violates foreign key"))
    return `${base}\n\nHint: The referenced record doesn't exist. Use search_contacts or list_rules to find valid IDs.`;
  return base;
}

function notFoundError(
  entity: string,
  id: number,
  searchHint: string,
): { content: { type: "text"; text: string }[]; isError: true } {
  return {
    content: [
      {
        type: "text" as const,
        text: `${entity} ${id} not found. Use ${searchHint} to find valid ${entity.toLowerCase()}s.`,
      },
    ],
    isError: true,
  };
}

/** Apply pagination to an array, returning { items, totalCount, hasMore } */
function paginate<T>(items: T[], limit: number, offset: number): { items: T[]; totalCount: number; hasMore: boolean } {
  const totalCount = items.length;
  const sliced = items.slice(offset, offset + limit);
  return { items: sliced, totalCount, hasMore: offset + limit < totalCount };
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "claw-crm",
    version: "1.0.0",
  });

  // --- Guide (with live stats) ---
  server.tool(
    "get_crm_guide",
    "RECOMMENDED FIRST CALL. Returns CRM instructions plus a live snapshot of current data (contact counts, violations, upcoming meetings). Call this before creating or updating contacts.",
    {},
    async () => {
      const allContacts = await storage.getContacts();
      const user = await storage.getFirstUser();
      const isEmpty = allContacts.length === 0;
      const orgName = user?.orgName || "Claw CRM";

      // Live stats
      const violations = await storage.getViolations();
      const now = new Date();
      const weekOut = new Date();
      weekOut.setHours(weekOut.getHours() + 168);
      const upcomingMeetings = await db
        .select()
        .from(followups)
        .where(
          and(
            eq(followups.type, "meeting"),
            isNull(followups.cancelledAt),
            eq(followups.completed, false),
            gte(followups.dueDate, now),
            lte(followups.dueDate, weekOut),
          ),
        );
      const overdue = await storage.getOverdueFollowups();

      // Stage distribution
      const stageCounts = STAGES.map((s) => {
        const count = allContacts.filter((c) => c.stage === s).length;
        return count > 0 ? `${s}: ${count}` : null;
      })
        .filter(Boolean)
        .join(", ");

      const statsSection = !isEmpty
        ? `
## Live Snapshot
- **${allContacts.length}** contacts (${stageCounts})
- **${violations.length}** active violation${violations.length !== 1 ? "s" : ""} (${violations.filter((v) => v.severity === "critical").length} critical)
- **${upcomingMeetings.length}** meeting${upcomingMeetings.length !== 1 ? "s" : ""} this week
- **${overdue.length}** overdue task${overdue.length !== 1 ? "s" : ""}
`
        : "";

      const onboardingSection = isEmpty
        ? `
## FIRST-TIME SETUP — This CRM is empty!

Help the user set up their CRM through conversation:
1. Ask for their name and organization → call update_contact or just note it
2. Ask them to describe their pipeline: "Who are your current clients and prospects?"
3. For each person they mention → create_contact() with the right stage
4. Ask about recent interactions → add_interaction() for each
5. Ask about upcoming tasks → create_task() for each
6. The default rules (stale detection, overdue follow-ups) are already active

Be conversational. The user says "I have a prospect named Sarah at Acme, we had a call last week" → you create the contact, log the interaction, suggest a follow-up.
`
        : "";

      return {
        content: [
          {
            type: "text" as const,
            text: `# ${orgName} CRM — Agent Guide
${statsSection}
${onboardingSection}

## Key Principles
- This is a NOTEBOOK, not a database. Keep entries concise and scannable.
- Always search_contacts BEFORE creating — never create duplicates.
- One contact record = one PRIMARY person. Use additionalContacts for secondary people at the same company.
- The background field is 1-2 sentences of company context. Do NOT dump full history there.
- Use add_interaction for timeline events (past tense, factual, concise).
- Use create_task for future action items and meetings.
- When completing a follow-up, ALWAYS provide an outcome describing what happened.

## Pipeline Stages
${STAGES.join(" → ")} (RELATIONSHIP = warm contacts, not sales)

- LEAD: Intro made, no meeting yet
- MEETING: First meeting happened or scheduled
- PROPOSAL: Proposal sent
- NEGOTIATION: Active back-and-forth on terms
- LIVE: Signed, active engagement (moves to execution/project management)
- PASS: Declined or not a fit
- RELATIONSHIP: Warm connection, not a sales prospect

## Contact Statuses
- ACTIVE: In the pipeline, needs attention
- HOLD: Paused — not dead, just not actively working it right now
Note: PASS is a STAGE (declined/not a fit), not a status.

## Valid Enums
- Stages: ${STAGES.join(", ")}
- Statuses: ${STATUSES.join(", ")}
- Interaction types: ${INTERACTION_TYPES.join(", ")}
- Task types: ${TASK_TYPES.join(", ")} (use create_task with type parameter)
- Severities: ${SEVERITIES.join(", ")}
- Meeting types: ${MEETING_TYPES.join(", ")}

## Data Formatting
- email: direct email address
- phone: direct phone number
- website: domain only, no https:// (e.g. "acme.com")
- location: city or short form (e.g. "LA", "NYC", "Monterrey, Mexico")
- source: how we connected (e.g. "Ryan Chan (referral)", "Direct", "Met at YPO event")
- additionalContacts: "Name (Role): email" separated by newlines
- interaction content: past tense, factual, concise (e.g. "AF had intro call. 30 min, discussed AI strategy.")
- followup content: action-oriented (e.g. "Check for reply on proposal")
- dates: use YYYY-MM-DD or M/D format. The CRM stores dates only, not datetimes. No timezone conversion.
- times: for meetings, store as a display string in the user's local timezone (e.g. "2:30 PM"). Don't convert timezones.

## Rules
Rules auto-flag issues (stale contacts, overdue follow-ups). You can create, update, and delete rules.
Available condition types: ${CONDITION_TYPES.join(", ")}
Available exception types: ${EXCEPTION_TYPES.join(", ")}

## Meetings
Use create_task with type "meeting" to schedule meetings.
Meetings appear alongside tasks in contact cards and the Upcoming strip.
After a meeting happens, log it as an interaction with add_interaction.

## Briefings
Use save_briefing to store prep notes for a contact (one per contact, upsert).
Good for: talking points, recent news, open items before a meeting.

## Relationship Journal
The persistent, file-like narrative of the relationship. Freeform markdown per contact, everlasting, append-mostly. Tools: \`read_journal\`, \`peek_last_journal_entry\`, \`edit_journal\`, \`append_journal\`, \`batch_append_journal\`.

**Document structure — canonical three, optional three more:**
1. \`## Key People\` — stakeholder roster with roles and current relationship state. Edit in place.
2. \`## Wins / Case Study Material\` — durable outcomes, measurable impact, quotable moments. Case-study fodder. Edit in place.
3. \`## Entries\` — dated narrative entries. Append-only via \`append_journal\` / \`batch_append_journal\`. Each entry: \`### YYYY-MM-DD: <title>\` followed by body.

Optional sections, add only when you have real signal that doesn't fit: \`## Open Questions\`, \`## Risks\`, \`## Next Moves\`. Default answer is still Entries.

Every new dated content lands in Entries. Evergreen context edits in place in Key People / Wins.

**THE DATA-PARTITION RULE (read this every time you're about to write):**

Every piece of info has exactly ONE home. The DATE belongs to the atom; the MEANING belongs to the journal. If you're about to write the same sentence in two places, one of them is wrong.

| What it is | Where it goes | Tool | Shape |
|---|---|---|---|
| A canonical fact about the person (title, email, location) | **contact field** | update_contact | one-liner |
| An event that happened on a date (call, email, meeting) | **interaction** | add_interaction | one sentence, past tense, factual |
| A future action item | **task** | create_task (type task) | verb-first, ≤10 words, no rationale |
| A scheduled future event | **meeting** | create_task (type meeting) | date + time + short title + location |
| Prep for the **next specific** conversation | **briefing** | save_briefing | bullets, replaced at next prep |
| A stakeholder with a role | **journal → Key People** | edit_journal | edit in place |
| A durable outcome / case-study material | **journal → Wins** | edit_journal | edit in place |
| Interpretation, strategic read, "what this means", narrative context | **journal → Entries** | append_journal | long-form prose, dated |

**Worked example — single call with Jeff on 2026-04-18:**
- Interaction: \`2026-04-18: 30min call with Jeff. Discussed WPS restructuring.\` ← fact, short
- Task: \`Send investment memo to Jeff\` due \`2026-04-22\` ← next action
- Journal Entry: \`### 2026-04-18: Jeff signaled pivot from vendor to partner. He said "I want to think bigger than a deck." Read: restructuring opens strategic lane. Next prep should lead with our BD stance, not the deck refresh.\` ← meaning

These three are NOT duplicates. The interaction is the fact, the task is the action, the journal is the interpretation. The journal cross-references the atom via its date.

**Decision flow for any new info:**
1. Is it a fact that happened on a date? → **interaction**. Keep it to one sentence.
2. Is it an action that should happen by a date? → **task** (or **meeting** if a scheduled event with time/place).
3. Is it a canonical static fact about the person? → **contact field**.
4. Is it prep for the next conversation? → **briefing**.
5. Is it interpretation, context, strategic read, or narrative — even if it's ABOUT a recent interaction? → **journal Entry**, dated, cross-referencing the atom's date.
6. Is it evergreen people or wins? → **journal Key People / Wins**, edit in place.

Tasks and interactions should be SHORT reminders. The journal is where detail lives.

**Writing rules (non-negotiable):**
1. Every Entry begins with an ISO date heading: \`### YYYY-MM-DD: <brief title>\`. The server builds this for you — pass \`date\` to backdate migrated notes.
2. Absolute dates only in body content. Accepted formats: \`2026-04-18\`, \`04/18/2026\`, \`April 18, 2026\`, \`August 2025\` (year-only), \`Q3 2025\`. **Never** use today, tomorrow, yesterday, this/next/last week|month|year, recently, a few days ago, etc. Day-of-week only triggers rejection when preceded by next/this/last/by/on/until — "Mon/Wed/Fri cadence" or "Monday through Friday" is fine.
3. When writing about future actions inside the journal, state the specific date. Write \`follow up with Jeff on 2026-05-06\`, not \`follow up with Jeff next week\`. (For actual follow-ups, use create_task instead — the journal just contextualizes.)
4. When a contact says "let's meet next Tuesday", translate to an absolute date at write time.
5. Never silently edit or delete existing dated Entries. Prefer appending a correction: \`### 2026-04-18: Correction to 2026-03-09 entry — …\`. A rewrite is a destructive edit.
6. When updating Key People or Wins in place, annotate the change inline: \`[updated 2026-04-18: …]\`.
7. If a piece of information has no known date, mark it \`[date unknown]\` rather than omitting or hedging.
8. \`briefing\` is for the next meeting and may be overwritten freely. \`relationship_journal\` is permanent.
9. Destructive edits require \`confirmed_with_user: true\`, set ONLY after the user has explicitly approved the change in conversation. "Destructive" = shrinks the doc ≥40% (and ≥500 chars) OR mutates an existing \`### YYYY-MM-DD:\` Entry heading. Minor cleanups don't trip it.
10. Migrating old notes? Use \`batch_append_journal\` with per-entry \`date\` values so the timeline reflects when events actually happened, not when you typed them in.
10. Write dense. Every word earns its place. No filler, no throat-clearing, no hedges. Capture maximum context per character.

## Confidentiality
- NEVER put pricing or deal terms in the CRM
- NEVER cross-reference client details between prospects
- Proposals reference dates only, no dollar amounts
`,
          },
        ],
      };
    },
  );

  // --- Dashboard ---
  server.tool(
    "get_dashboard",
    "Get a high-level CRM snapshot: contacts by stage, overdue tasks, upcoming meetings, active violations, and recent activity. Use this to orient at the start of a session instead of making multiple calls.",
    {},
    async () => {
      try {
        const allContacts = await storage.getContacts();
        const violations = await storage.getViolations();
        const overdue = await storage.getOverdueFollowups();

        // Upcoming meetings (next 48h)
        const now = new Date();
        const cutoff48h = new Date();
        cutoff48h.setHours(cutoff48h.getHours() + 48);
        const soonMeetings = await db
          .select()
          .from(followups)
          .where(
            and(
              eq(followups.type, "meeting"),
              isNull(followups.cancelledAt),
              eq(followups.completed, false),
              gte(followups.dueDate, now),
              lte(followups.dueDate, cutoff48h),
            ),
          )
          .orderBy(asc(followups.dueDate));

        // Resolve contact names for meetings, violations, and overdue items
        const allContactIds = [
          ...soonMeetings.map((m) => m.contactId),
          ...violations.map((v) => v.contactId),
          ...overdue.map((f) => f.contactId),
        ];
        const names = await contactNameMap(allContactIds);

        // Stage distribution
        const byStage: Record<string, number> = {};
        for (const c of allContacts) {
          byStage[c.stage] = (byStage[c.stage] || 0) + 1;
        }

        // Recent activity (last 5)
        const recentActivity = await db
          .select()
          .from(sql`activity_log`)
          .orderBy(sql`created_at DESC`)
          .limit(5);

        const dashboard = {
          totalContacts: allContacts.length,
          byStage,
          upcomingMeetings: soonMeetings.map((m) => ({
            id: m.id,
            contactId: m.contactId,
            contactName: names.get(m.contactId) || "Unknown",
            content: m.content,
            date: m.dueDate,
            time: m.time,
            location: m.location,
          })),
          overdueTasks: overdue.map((f) => ({
            id: f.id,
            contactId: f.contactId,
            contactName: names.get(f.contactId) || "Unknown",
            content: f.content,
            dueDate: f.dueDate,
          })),
          activeViolations: {
            total: violations.length,
            critical: violations.filter((v) => v.severity === "critical").length,
            warning: violations.filter((v) => v.severity === "warning").length,
            info: violations.filter((v) => v.severity === "info").length,
            items: violations.slice(0, 10).map((v) => ({
              id: v.id,
              contactId: v.contactId,
              contactName: names.get(v.contactId) || "Unknown",
              message: v.message,
              severity: v.severity,
            })),
          },
          recentActivity: recentActivity,
        };

        return { content: [{ type: "text" as const, text: JSON.stringify(dashboard, null, 2) }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("loading dashboard", err) }], isError: true };
      }
    },
  );

  // --- Read Tools ---
  server.tool(
    "search_contacts",
    "Full-text search across all contact data including notes, tasks, and briefings. Returns a ranked summary list with pagination.",
    {
      query: z
        .string()
        .optional()
        .describe("Search term (full-text search across name, company, notes, tasks, briefings, email, and more)"),
      stage: stageEnum.optional().describe(`Filter by stage: ${STAGES.join(", ")}`),
      status: statusEnum.optional().describe(`Filter by status: ${STATUSES.join(", ")}`),
      limit: z.number().optional().describe("Max results to return (default 25)"),
      offset: z.number().optional().describe("Skip this many results (default 0, for pagination)"),
    },
    async ({ query, stage, status, limit, offset }) => {
      try {
        const l = limit || 25;
        const o = offset || 0;

        // Use BM25 search when query is provided
        if (query && query.length >= 2) {
          const searchResult = await searchService.search(query, { stage, status, limit: l, offset: o });
          const summary = searchResult.results
            .map((r) => {
              const c = searchService.getContact(r.contactId);
              if (!c) return null;
              return {
                id: c.id,
                name: `${c.firstName} ${c.lastName}`,
                company: c.company?.name,
                stage: c.stage,
                status: c.status,
                email: c.email,
                lastInteraction:
                  c.interactions.length > 0
                    ? {
                        date: c.interactions[c.interactions.length - 1].date,
                        content: c.interactions[c.interactions.length - 1].content,
                      }
                    : null,
                activeFollowups: c.followups.filter((f) => !f.completed).length,
                violations: c.violations.length,
              };
            })
            .filter(Boolean);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { results: summary, totalCount: searchResult.totalCount, hasMore: searchResult.hasMore },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // No query or too short — fall back to listing with optional filters
        let results = await storage.getContactsWithRelations();
        if (query) {
          const q = query.toLowerCase();
          results = results.filter(
            (c) =>
              `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
              c.company?.name?.toLowerCase().includes(q) ||
              c.email?.toLowerCase().includes(q),
          );
        }
        if (stage) results = results.filter((c) => c.stage === stage);
        if (status) results = results.filter((c) => c.status === status);

        const { items, totalCount, hasMore } = paginate(results, l, o);

        const summary = items.map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`,
          company: c.company?.name,
          stage: c.stage,
          status: c.status,
          email: c.email,
          lastInteraction:
            c.interactions.length > 0
              ? {
                  date: c.interactions[c.interactions.length - 1].date,
                  content: c.interactions[c.interactions.length - 1].content,
                }
              : null,
          activeFollowups: c.followups.filter((f) => !f.completed).length,
          violations: c.violations.length,
        }));

        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ results: summary, totalCount, hasMore }, null, 2) },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: actionableError("searching contacts", err) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_contact",
    "Get full contact details including interactions, follow-ups, and violations.",
    {
      contactId: z.number().describe("Contact ID"),
    },
    async ({ contactId }) => {
      try {
        const contact = await storage.getContactWithRelations(contactId);
        if (!contact) return notFoundError("Contact", contactId, "search_contacts");
        return { content: [{ type: "text" as const, text: JSON.stringify(contact, null, 2) }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: actionableError(`reading contact ${contactId}`, err) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "list_violations",
    "Active rule violations, enriched with contact names.",
    {
      severity: severityEnum.optional().describe(`Filter by severity: ${SEVERITIES.join(", ")}`),
      limit: z.number().optional().describe("Max results (default 25)"),
      offset: z.number().optional().describe("Skip results (default 0)"),
    },
    async ({ severity, limit, offset }) => {
      try {
        let v = await storage.getViolations();
        if (severity) v = v.filter((x) => x.severity === severity);

        const { items, totalCount, hasMore } = paginate(v, limit || 25, offset || 0);

        // Enrich with contact names
        const names = await contactNameMap(items.map((x) => x.contactId));
        const enriched = items.map((x) => ({
          ...x,
          contactName: names.get(x.contactId) || "Unknown",
        }));

        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ results: enriched, totalCount, hasMore }, null, 2) },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: actionableError("listing violations", err) }],
          isError: true,
        };
      }
    },
  );

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
      companyName: z
        .string()
        .optional()
        .describe("Company name, e.g. 'Meridian Capital'. Auto-creates if new, reuses if existing."),
      title: z.string().optional().describe("Job title, e.g. 'CEO & Founder'"),
      email: z.string().optional().describe("Direct email address — always include if known"),
      phone: z.string().optional().describe("Direct phone number"),
      website: z.string().optional().describe("Company website domain (no https://), e.g. 'acme.com'"),
      location: z.string().optional().describe("City or short location, e.g. 'LA' or 'NYC'"),
      background: z
        .string()
        .optional()
        .describe("1-2 sentences about the company. Keep SHORT — do not dump full history here"),
      source: z.string().optional().describe("How we connected, e.g. 'Ryan Chan (referral)' or 'Direct'"),
      additionalContacts: z
        .string()
        .optional()
        .describe("Other key people: 'Name (Role): email' separated by newlines"),
      status: statusEnum.optional().describe(`${STATUSES.join(" or ")} (default ACTIVE)`),
      stage: stageEnum.optional().describe(`${STAGES.join(", ")}. NOT HOLD (use status for that)`),
    },
    async ({ companyName, ...data }) => {
      try {
        const cleaned: Record<string, unknown> = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        );
        if (!cleaned.status) cleaned.status = "ACTIVE";
        if (!cleaned.stage) cleaned.stage = "LEAD";
        if (companyName) cleaned.companyId = await findOrCreateCompany(companyName);
        const c = await storage.createContact(cleaned as InsertContact);
        return {
          content: [
            {
              type: "text" as const,
              text: `Created contact: ${c.firstName} ${c.lastName} (ID: ${c.id}). Now use add_interaction to log key events in the timeline.`,
            },
          ],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("creating contact", err) }], isError: true };
      }
    },
  );

  server.tool(
    "update_contact",
    "Update fields on an existing contact. Only include fields you want to change.",
    {
      contactId: z.number().describe("Contact ID to update"),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      companyName: z.string().optional().describe("Company name. Auto-creates if new, reuses if existing."),
      title: z.string().optional().describe("Job title"),
      email: z.string().optional().describe("Direct email address"),
      phone: z.string().optional().describe("Direct phone number"),
      website: z.string().optional().describe("Company website domain (no https://)"),
      location: z.string().optional().describe("City or short location"),
      background: z.string().optional().describe("1-2 sentence company context. Keep short."),
      source: z.string().optional().describe("Referral source"),
      additionalContacts: z.string().optional().describe("Other key people: 'Name (Role): email' per line"),
      status: statusEnum.optional().describe(`${STATUSES.join(" or ")}`),
      stage: stageEnum.optional().describe(`${STAGES.join(", ")}. NOT HOLD (use status for that)`),
    },
    async ({ contactId, companyName, ...data }) => {
      try {
        const filtered: Record<string, unknown> = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        );
        if (companyName) filtered.companyId = await findOrCreateCompany(companyName);
        const c = await storage.updateContact(contactId, filtered);
        if (!c) return notFoundError("Contact", contactId, "search_contacts");
        return { content: [{ type: "text" as const, text: `Updated: ${c.firstName} ${c.lastName}` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("updating contact", err) }], isError: true };
      }
    },
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

Do NOT log follow-up tasks here — use create_task for those.`,
    {
      contactId: z.number().describe("Contact ID"),
      content: z.string().describe("What happened — concise, past tense, factual"),
      date: z.string().optional().describe("When it happened (ISO date string). Defaults to today."),
      type: interactionTypeEnum.optional().describe(`${INTERACTION_TYPES.join(", ")} (default note)`),
    },
    async ({ contactId, content, date, type }) => {
      try {
        const i = await storage.createInteraction({
          contactId,
          content,
          date: date ? toNoonUTC(date) : toNoonUTC(new Date()),
          type: type || "note",
        });
        return { content: [{ type: "text" as const, text: `Logged ${i.type} for contact ${contactId}` }] };
      } catch (err: unknown) {
        if (errMsg(err).includes("foreign key"))
          return {
            content: [
              {
                type: "text" as const,
                text: `Contact ${contactId} not found. Use search_contacts to find valid contacts.`,
              },
            ],
            isError: true,
          };
        return {
          content: [{ type: "text" as const, text: actionableError("logging interaction", err) }],
          isError: true,
        };
      }
    },
  );

  // --- Unified Task/Meeting Tool (replaces set_followup + set_meeting) ---
  server.tool(
    "create_task",
    `Create a task or meeting for a contact. Replaces the old set_followup and set_meeting tools.

For tasks (type "task"): action items with due dates.
  Content should be a clear action: "Check for reply on proposal", "Send intro email"

For meetings (type "meeting"): scheduled events with optional time/location.
  Content should describe the meeting: "Intro call with Bobby", "Coffee at Blue Bottle"
  Include time as a display string (e.g. "2:00 PM") and optional location.`,
    {
      contactId: z.number().describe("Contact ID"),
      content: z.string().describe("For tasks: action to take. For meetings: meeting description."),
      dueDate: z
        .string()
        .describe(
          "Due/meeting date: ISO string (2026-04-15), ISO datetime (2026-04-15T14:00:00), or M/D format (4/15)",
        ),
      type: taskTypeEnum.optional().describe(`"task" (default) or "meeting"`),
      // Meeting-specific fields (ignored for tasks)
      meetingType: meetingTypeEnum
        .optional()
        .describe(`Meeting format: ${MEETING_TYPES.join(", ")} (only for type "meeting")`),
      time: z
        .string()
        .optional()
        .describe("Display time, e.g. '2:00 PM' (only for meetings). Auto-parsed from date if ISO datetime provided."),
      location: z.string().optional().describe("Meeting location (only for meetings)"),
    },
    async ({ contactId, content, dueDate, type, meetingType, time, location }) => {
      try {
        const isMeeting = type === "meeting";
        const d = parseDateToNoonUTC(dueDate);

        if (isMeeting) {
          // Auto-parse display time from ISO datetime if not explicitly provided
          const displayTime =
            time ||
            (dueDate.includes("T")
              ? new Date(dueDate).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
              : undefined);

          const [item] = await db
            .insert(followups)
            .values({
              contactId,
              type: "meeting",
              dueDate: d,
              content,
              time: displayTime,
              location,
              metadata: meetingType ? { meetingType } : null,
              completed: false,
            })
            .returning();
          sseManager.broadcast({ type: "followup_created", contactId });
          storage.logActivity("meeting.created", `Scheduled ${meetingType || "meeting"}: ${content}`, {
            contactId,
            source: "agent",
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `Meeting scheduled${displayTime ? ` at ${displayTime}` : ""}: "${content}" (ID: ${item.id})`,
              },
            ],
          };
        } else {
          // Regular task/followup
          await storage.createFollowup({ contactId, content, dueDate: d, completed: false });
          return {
            content: [
              {
                type: "text" as const,
                text: `Follow-up set for ${d.getUTCMonth() + 1}/${d.getUTCDate()}: "${content}"`,
              },
            ],
          };
        }
      } catch (err: unknown) {
        if (errMsg(err).includes("foreign key"))
          return {
            content: [
              {
                type: "text" as const,
                text: `Contact ${contactId} not found. Use search_contacts to find valid contacts.`,
              },
            ],
            isError: true,
          };
        return { content: [{ type: "text" as const, text: actionableError("creating task", err) }], isError: true };
      }
    },
  );

  server.tool(
    "complete_followup",
    `Mark a follow-up or meeting as done. Always provide an outcome describing what actually happened — this gets logged to the timeline as a permanent record.

The outcome should be past tense: "Checked in with Idan — confirmed coffee next Tuesday" not "Check in with Idan"`,
    {
      followupId: z.number().describe("Follow-up/task ID"),
      outcome: z.string().optional().describe("What happened — logged as a timeline entry. Always provide this."),
    },
    async ({ followupId, outcome }) => {
      try {
        const fu = await storage.completeFollowup(followupId);
        if (!fu) return notFoundError("Follow-up", followupId, "get_contact (check the followups array)");
        if (outcome?.trim()) {
          await storage.createInteraction({
            contactId: fu.contactId,
            content: outcome.trim(),
            date: toNoonUTC(new Date()),
            type: "note",
          });
          return { content: [{ type: "text" as const, text: `Completed and logged: "${outcome.trim()}"` }] };
        }
        return { content: [{ type: "text" as const, text: `Completed: "${fu.content}"` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: actionableError("completing follow-up", err) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "delete_contact",
    "Permanently delete a contact and all their interactions, follow-ups, and violations. Use this to clean up duplicates or remove contacts that should not be in the CRM. This cannot be undone.",
    { contactId: z.number().describe("Contact ID to delete") },
    async ({ contactId }) => {
      try {
        const contact = await storage.getContact(contactId);
        if (!contact) return notFoundError("Contact", contactId, "search_contacts");
        const name = `${contact.firstName} ${contact.lastName}`;
        const deleted = await storage.deleteContact(contactId);
        if (!deleted)
          return { content: [{ type: "text" as const, text: `Failed to delete contact ${contactId}` }], isError: true };
        return {
          content: [
            { type: "text" as const, text: `Deleted contact: ${name} (ID: ${contactId}) and all associated data` },
          ],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("deleting contact", err) }], isError: true };
      }
    },
  );

  server.tool(
    "delete_followup",
    "Delete a follow-up task or meeting. Use this to remove items that are no longer relevant without marking them as completed.",
    { followupId: z.number().describe("Follow-up/task ID to delete") },
    async ({ followupId }) => {
      try {
        const deleted = await storage.deleteFollowup(followupId);
        if (!deleted) return notFoundError("Follow-up", followupId, "get_contact (check the followups array)");
        return { content: [{ type: "text" as const, text: `Deleted follow-up ${followupId}` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: actionableError("deleting follow-up", err) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "delete_interaction",
    "Delete an interaction entry from a contact's timeline.",
    { interactionId: z.number().describe("Interaction ID to delete") },
    async ({ interactionId }) => {
      try {
        const deleted = await storage.deleteInteraction(interactionId);
        if (!deleted) return notFoundError("Interaction", interactionId, "get_contact (check the interactions array)");
        return { content: [{ type: "text" as const, text: `Deleted interaction ${interactionId}` }] };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: actionableError("deleting interaction", err) }],
          isError: true,
        };
      }
    },
  );

  // --- Meetings ---
  server.tool(
    "get_upcoming_meetings",
    "List upcoming meetings, enriched with contact names.",
    {
      withinHours: z.number().optional().describe("Hours ahead to look (default 168 = 7 days)"),
      contactId: z.number().optional().describe("Filter to a specific contact"),
      limit: z.number().optional().describe("Max results (default 25)"),
      offset: z.number().optional().describe("Skip results (default 0)"),
    },
    async ({ withinHours, contactId, limit, offset }) => {
      try {
        const now = new Date();
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() + (withinHours || 168));
        const conditions = [
          eq(followups.type, "meeting"),
          isNull(followups.cancelledAt),
          eq(followups.completed, false),
          gte(followups.dueDate, now),
          lte(followups.dueDate, cutoff),
        ];
        if (contactId) conditions.push(eq(followups.contactId, contactId));
        const allResults = await db
          .select()
          .from(followups)
          .where(and(...conditions))
          .orderBy(asc(followups.dueDate));

        const { items, totalCount, hasMore } = paginate(allResults, limit || 25, offset || 0);

        // Enrich with contact names
        const names = await contactNameMap(items.map((m) => m.contactId));
        const enriched = items.map((m) => ({
          ...m,
          contactName: names.get(m.contactId) || "Unknown",
        }));

        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ results: enriched, totalCount, hasMore }, null, 2) },
          ],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("listing meetings", err) }], isError: true };
      }
    },
  );

  server.tool("cancel_meeting", "Cancel a meeting.", { meetingId: z.number() }, async ({ meetingId }) => {
    try {
      const [item] = await db
        .update(followups)
        .set({ cancelledAt: new Date() })
        .where(eq(followups.id, meetingId))
        .returning();
      if (!item) return notFoundError("Meeting", meetingId, "get_upcoming_meetings");
      sseManager.broadcast({ type: "followup_deleted", contactId: item.contactId });
      storage.logActivity("meeting.cancelled", "Cancelled meeting", { contactId: item.contactId, source: "agent" });
      return { content: [{ type: "text" as const, text: `Cancelled meeting ${meetingId}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: actionableError("cancelling meeting", err) }], isError: true };
    }
  });

  // --- Briefings ---
  server.tool(
    "save_briefing",
    "Save a meeting prep briefing for a contact. One per contact (upsert). Use bullet points for scannability.",
    {
      contactId: z.number(),
      content: z.string().describe("Briefing text — talking points, context, prep notes"),
    },
    async ({ contactId, content }) => {
      try {
        const [existing] = await db.select().from(briefings).where(eq(briefings.contactId, contactId));
        if (existing) {
          await db.update(briefings).set({ content, updatedAt: new Date() }).where(eq(briefings.contactId, contactId));
        } else {
          await db.insert(briefings).values({ contactId, content });
        }
        sseManager.broadcast({ type: "briefing_updated", contactId });
        storage.logActivity("briefing.saved", `Briefing saved (${content.length} chars)`, {
          contactId,
          source: "agent",
        });
        return {
          content: [
            { type: "text" as const, text: `Briefing saved for contact ${contactId} (${content.length} chars)` },
          ],
        };
      } catch (err: unknown) {
        if (errMsg(err).includes("foreign key"))
          return {
            content: [
              {
                type: "text" as const,
                text: `Contact ${contactId} not found. Use search_contacts to find valid contacts.`,
              },
            ],
            isError: true,
          };
        return { content: [{ type: "text" as const, text: actionableError("saving briefing", err) }], isError: true };
      }
    },
  );

  server.tool(
    "get_briefing",
    "Get the prep briefing for a contact.",
    {
      contactId: z.number(),
    },
    async ({ contactId }) => {
      try {
        const [b] = await db.select().from(briefings).where(eq(briefings.contactId, contactId));
        if (!b)
          return {
            content: [
              { type: "text" as const, text: `No briefing for contact ${contactId}. Use save_briefing to create one.` },
            ],
          };
        return { content: [{ type: "text" as const, text: b.content }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("reading briefing", err) }], isError: true };
      }
    },
  );

  // --- Relationship journal ---
  // Short, shared contract text. The full "where does this go?" decision tree
  // lives in get_crm_guide; tool descriptions just point there to avoid drift.
  const JOURNAL_CONTRACT =
    "The journal stores NARRATIVE (interpretation, strategic reads, context). Facts go in interactions; actions go in tasks; canonical fields on the contact. See get_crm_guide → Relationship Journal for the full decision tree and writing rules. " +
    `Canonical sections: ${CANONICAL_SECTIONS.map((s) => `## ${s}`).join(", ")}. ` +
    `Optional (only when real signal): ${OPTIONAL_SECTIONS.map((s) => `## ${s}`).join(", ")}. ` +
    `Absolute dates only — accepted formats: ${ACCEPTED_DATE_FORMATS.join(", ")}. ` +
    "Write dense — every word earns its place.";

  server.tool(
    "read_journal",
    `Read a contact's relationship_journal. Returns the document text, a content hash (pass as expectedHash on subsequent edits to avoid silent overwrite), and whether the doc has been initialized. Call this BEFORE any edit so you're working from current content. Use the optional \`section\` parameter to scope the read when you only need Key People, Wins, or Entries — saves context on mature journals. ${JOURNAL_CONTRACT}`,
    {
      contactId: z.number().describe("Contact ID. Get from search_contacts or get_contact."),
      section: z
        .enum(["Key People", "Wins / Case Study Material", "Entries", "Open Questions", "Risks", "Next Moves"])
        .optional()
        .describe(
          "Return only the named section (between `## Section` and the next `## `). If omitted, returns the full doc. Full-doc hash is always returned for use with edit_journal.",
        ),
    },
    async ({ contactId, section }) => {
      try {
        const contact = await storage.getContact(contactId);
        if (!contact) return notFoundError("Contact", contactId, "search_contacts");
        const initialized = contact.relationshipJournal !== null;
        const fullContent = initialized
          ? (contact.relationshipJournal as string)
          : JOURNAL_SKELETON(`${contact.firstName} ${contact.lastName}`);
        const content = section
          ? (readJournalSection(fullContent, section) ?? `<!-- section "${section}" not present -->`)
          : fullContent;
        const payload = {
          content,
          section: section ?? null,
          hash: hashJournal(initialized ? fullContent : null),
          initialized,
          sizeBytes: content.length,
          fullSizeBytes: fullContent.length,
        };
        return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("reading journal", err) }], isError: true };
      }
    },
  );

  server.tool(
    "peek_last_journal_entry",
    `Return just the most recent dated Entry (heading + body) from a contact's journal. Cheap confirmation of "did my last append land?" without re-reading the whole doc.`,
    {
      contactId: z.number(),
    },
    async ({ contactId }) => {
      try {
        const contact = await storage.getContact(contactId);
        if (!contact) return notFoundError("Contact", contactId, "search_contacts");
        if (contact.relationshipJournal === null) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ ok: true, entry: null, message: "Journal not initialized yet." }),
              },
            ],
          };
        }
        const entry = peekLastEntry(contact.relationshipJournal);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ ok: true, entry, totalSize: contact.relationshipJournal.length }),
            },
          ],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("peeking journal", err) }], isError: true };
      }
    },
  );

  server.tool(
    "edit_journal",
    `Exact-string replacement on a contact's relationship_journal. Mirrors Claude's local Edit tool: oldString must occur exactly once in the current document (unless replaceAll: true). Destructive edits require confirmed_with_user: true — triggered when the edit (a) shrinks the doc ≥40% AND ≥500 chars, or (b) mutates/removes an existing \`### YYYY-MM-DD:\` Entry heading. ${JOURNAL_CONTRACT}`,
    {
      contactId: z.number(),
      oldString: z
        .string()
        .describe(
          "Exact substring to replace (whitespace-sensitive). Must occur exactly once unless replaceAll is true.",
        ),
      newString: z
        .string()
        .describe(
          "Replacement text. Absolute dates only. Substantive content (>40 chars) must contain an absolute date. On rejection the error payload includes: field, reason, offending phrase, excerpt around the match, and position — enough to fix without guessing.",
        ),
      replaceAll: z
        .boolean()
        .optional()
        .default(false)
        .describe("Replace every occurrence of oldString instead of requiring exactly one match."),
      expectedHash: z
        .string()
        .optional()
        .describe(
          "Content hash from your most recent read_journal. Strongly recommended — the edit is rejected if the doc changed since then.",
        ),
      confirmed_with_user: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Set to true ONLY after the user has explicitly approved a destructive edit in conversation. Required for ≥40% shrink or mutating an existing `### YYYY-MM-DD:` Entry heading.",
        ),
    },
    async ({ contactId, oldString, newString, replaceAll, expectedHash, confirmed_with_user }) => {
      try {
        const contact = await storage.getContact(contactId);
        if (!contact) return notFoundError("Contact", contactId, "search_contacts");
        if (contact.relationshipJournal === null) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: false,
                  reason: "not_initialized",
                  message: "Journal not initialized. Call append_journal first to seed the document.",
                }),
              },
            ],
            isError: true,
          };
        }

        const v = validateJournalContent(newString, "newString");
        if (!v.ok) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ ok: false, ...v }) }],
            isError: true,
          };
        }

        const current = contact.relationshipJournal;
        const occurrences = current.split(oldString).length - 1;
        if (occurrences === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: false,
                  reason: "no_match",
                  message: "oldString not found in current document. Re-read the journal and try again.",
                }),
              },
            ],
            isError: true,
          };
        }
        if (occurrences > 1 && !replaceAll) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: false,
                  reason: "multiple_matches",
                  message: `oldString appears ${occurrences} times. Provide more surrounding context for uniqueness, or set replaceAll: true.`,
                }),
              },
            ],
            isError: true,
          };
        }

        const updated = replaceAll ? current.split(oldString).join(newString) : current.replace(oldString, newString);

        const result = await storage.updateRelationshipJournal(contactId, updated, {
          source: "agent",
          expectedHash,
          confirmedWithUser: confirmed_with_user,
        });
        if (!result.ok) {
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: true };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ok: true,
                bytesChanged: updated.length - current.length,
                newHash: result.newHash,
                newSize: result.newSize,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("editing journal", err) }], isError: true };
      }
    },
  );

  server.tool(
    "append_journal",
    `Append a new dated entry to the Entries section. Server builds the heading as \`### YYYY-MM-DD: <title>\`. By default YYYY-MM-DD is today; supply \`date\` (ISO YYYY-MM-DD) to backdate when migrating historical notes — this is the intended path for bulk-importing old context. If the journal doesn't exist yet, the server seeds the skeleton and then appends. Use \`batch_append_journal\` instead when you have multiple entries to write in one shot — cheaper and transactional. ${JOURNAL_CONTRACT}`,
    {
      contactId: z.number(),
      title: z
        .string()
        .describe(
          'Short headline (≤80 chars recommended). Verb-forward, information-dense. Example: "Jeff signaled pivot from vendor to partner". When writing multiple entries on the same date, make titles distinct enough to tell apart.',
        ),
      body: z
        .string()
        .describe(
          "Markdown body. The INTERPRETATION, not the event log. Absolute dates only inside the body (the heading date is supplied separately). On rejection you get field + offending phrase + excerpt + position.",
        ),
      date: z
        .string()
        .optional()
        .describe(
          'Optional ISO YYYY-MM-DD for the entry heading. Defaults to today. Use to backdate migrated notes (e.g. "2025-07-01"). Must be between 1900 and 2100.',
        ),
    },
    async ({ contactId, title, body, date }) => {
      try {
        const contact = await storage.getContact(contactId);
        if (!contact) return notFoundError("Contact", contactId, "search_contacts");

        if (date !== undefined && !isReasonableIsoDate(date)) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: false,
                  reason: "invalid_date",
                  field: "date",
                  offending: date,
                  message: `"${date}" is not a valid ISO date (YYYY-MM-DD, 1900-2100). Example: "2025-07-01".`,
                }),
              },
            ],
            isError: true,
          };
        }

        const tv = validateJournalContent(title, "title");
        if (!tv.ok) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ ok: false, ...tv }) }],
            isError: true,
          };
        }
        const bv = validateJournalContent(body, "body");
        if (!bv.ok) {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ ok: false, ...bv }) }],
            isError: true,
          };
        }

        const seeded = contact.relationshipJournal === null;
        const baseDoc = seeded
          ? JOURNAL_SKELETON(`${contact.firstName} ${contact.lastName}`)
          : (contact.relationshipJournal as string);
        const { updated, entryHeading } = appendJournalEntry(baseDoc, title, body, date);

        if (updated.length > JOURNAL_SIZE_LIMIT) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: false,
                  reason: "size_limit",
                  message: `Journal would exceed ${JOURNAL_SIZE_LIMIT} chars. Compact older Entries — capture more context per character.`,
                }),
              },
            ],
            isError: true,
          };
        }

        const result = await storage.updateRelationshipJournal(contactId, updated, {
          source: "agent",
          skipDestructiveGuard: true,
        });
        if (!result.ok) {
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: true };
        }
        storage.logActivity("journal.appended", `Appended journal entry: ${entryHeading}`, {
          contactId,
          source: "agent",
          metadata: { entryHeading, seeded, backdated: date !== undefined && date !== todayIso() },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ok: true,
                entryHeading,
                newHash: result.newHash,
                newSize: result.newSize,
                seeded,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("appending journal", err) }], isError: true };
      }
    },
  );

  server.tool(
    "batch_append_journal",
    `Append multiple dated entries to a contact's journal in one transactional call. Use this for migrating historical notes — cheaper than N separate append_journal calls, and all-or-nothing: if ANY entry fails validation, no writes happen and each entry's result is returned. Each entry may carry its own ISO \`date\` for backdating. ${JOURNAL_CONTRACT}`,
    {
      contactId: z.number(),
      entries: z
        .array(
          z.object({
            title: z.string().describe("Entry headline."),
            body: z.string().describe("Entry body (markdown)."),
            date: z.string().optional().describe("Optional ISO YYYY-MM-DD. Defaults to today."),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of entries to append in order. Each gets its own `### YYYY-MM-DD: title` heading."),
    },
    async ({ contactId, entries }) => {
      try {
        const contact = await storage.getContact(contactId);
        if (!contact) return notFoundError("Contact", contactId, "search_contacts");

        // Validate every entry first. If any fail, return per-entry results and skip the write.
        const perEntry = entries.map((e, i) => {
          if (e.date !== undefined && !isReasonableIsoDate(e.date)) {
            return {
              index: i,
              ok: false as const,
              reason: "invalid_date" as const,
              field: `entries[${i}].date`,
              offending: e.date,
              message: `"${e.date}" is not a valid ISO date.`,
            };
          }
          const tv = validateJournalContent(e.title, `entries[${i}].title`);
          if (!tv.ok) return { index: i, ...tv };
          const bv = validateJournalContent(e.body, `entries[${i}].body`);
          if (!bv.ok) return { index: i, ...bv };
          return { index: i, ok: true as const };
        });

        const failures = perEntry.filter((r) => !r.ok);
        if (failures.length > 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: false,
                  reason: "batch_validation_failed",
                  message: `${failures.length} of ${entries.length} entries failed validation. No writes made.`,
                  results: perEntry,
                }),
              },
            ],
            isError: true,
          };
        }

        // Apply all appends in memory, then one write.
        const seeded = contact.relationshipJournal === null;
        let doc = seeded
          ? JOURNAL_SKELETON(`${contact.firstName} ${contact.lastName}`)
          : (contact.relationshipJournal as string);
        const headings: string[] = [];
        for (const e of entries) {
          const { updated, entryHeading } = appendJournalEntry(doc, e.title, e.body, e.date);
          doc = updated;
          headings.push(entryHeading);
        }

        if (doc.length > JOURNAL_SIZE_LIMIT) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  ok: false,
                  reason: "size_limit",
                  message: `Batch would push journal past ${JOURNAL_SIZE_LIMIT} chars. Trim prose or split into smaller batches.`,
                }),
              },
            ],
            isError: true,
          };
        }

        const result = await storage.updateRelationshipJournal(contactId, doc, {
          source: "agent",
          skipDestructiveGuard: true,
        });
        if (!result.ok) {
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }], isError: true };
        }
        storage.logActivity("journal.batch_appended", `Batch appended ${entries.length} journal entries`, {
          contactId,
          source: "agent",
          metadata: { count: entries.length, headings, seeded },
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ok: true,
                count: entries.length,
                headings,
                newHash: result.newHash,
                newSize: result.newSize,
                seeded,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        return {
          content: [{ type: "text" as const, text: actionableError("batch-appending journal", err) }],
          isError: true,
        };
      }
    },
  );

  // --- Rules ---
  server.tool(
    "list_rules",
    "List business rules.",
    {
      enabled: z.boolean().optional().describe("Filter to only enabled rules"),
      limit: z.number().optional().describe("Max results (default 25)"),
      offset: z.number().optional().describe("Skip results (default 0)"),
    },
    async ({ enabled, limit, offset }) => {
      try {
        const allRules = await storage.getRules(enabled);
        const { items, totalCount, hasMore } = paginate(allRules, limit || 25, offset || 0);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ results: items, totalCount, hasMore }, null, 2) }],
        };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("listing rules", err) }], isError: true };
      }
    },
  );

  server.tool(
    "create_rule",
    "Create a business rule. Rules are evaluated automatically and create violations when conditions are met.",
    {
      name: z.string().describe("Rule name"),
      description: z.string().describe("Human-readable description of what this rule does"),
      conditionType: conditionTypeEnum.describe(`Condition type: ${CONDITION_TYPES.join(", ")}`),
      conditionParams: z.record(z.any()).optional().describe("Parameters for the condition (e.g., {days: 14})"),
      exceptions: z
        .array(z.object({ type: z.string(), params: z.record(z.any()).optional() }))
        .optional()
        .describe(`Exception conditions: ${EXCEPTION_TYPES.join(", ")}`),
      severity: severityEnum
        .optional()
        .default("warning")
        .describe(`Violation severity: ${SEVERITIES.join(", ")}`),
      messageTemplate: z
        .string()
        .describe("Message template. Use {{days_since_last}}, {{followup_content}}, {{meeting_date}} as variables."),
    },
    async ({ name, description, conditionType, conditionParams, exceptions, severity, messageTemplate }) => {
      try {
        const rule = await storage.createRule({
          name,
          description,
          condition: { type: conditionType, params: conditionParams || {}, exceptions: exceptions || [] },
          action: { type: "create_violation", params: { severity, message_template: messageTemplate } },
          enabled: true,
        });
        return { content: [{ type: "text" as const, text: `Created rule: "${rule.name}" (ID: ${rule.id})` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("creating rule", err) }], isError: true };
      }
    },
  );

  server.tool(
    "update_rule",
    `Update a business rule. You can change metadata (name, description, enabled) or the rule logic itself (conditionParams, exceptions).

To add a stage exception to the stale contact rule:
  update_rule(ruleId: 1, exceptions: [{ type: "has_future_followup" }, { type: "stage_in", params: { stages: ["LIVE", "RELATIONSHIP"] } }])

Available exception types: ${EXCEPTION_TYPES.join(", ")}`,
    {
      ruleId: z.number().describe("Rule ID to update"),
      name: z.string().optional(),
      description: z.string().optional(),
      enabled: z.boolean().optional().describe("Enable or disable the rule"),
      conditionParams: z.record(z.any()).optional().describe("Update condition parameters, e.g. { days: 7 }"),
      exceptions: z
        .array(z.object({ type: z.string(), params: z.record(z.any()).optional() }))
        .optional()
        .describe("Replace the exceptions list"),
    },
    async ({ ruleId, conditionParams, exceptions, ...data }) => {
      try {
        const updates: Record<string, unknown> = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        );

        if (conditionParams !== undefined || exceptions !== undefined) {
          const existing = await storage.getRule(ruleId);
          if (!existing) return notFoundError("Rule", ruleId, "list_rules");
          const condition = existing.condition as Record<string, unknown>;
          if (conditionParams) condition.params = conditionParams;
          if (exceptions) condition.exceptions = exceptions;
          updates.condition = condition;
        }

        const rule = await storage.updateRule(ruleId, updates);
        if (!rule) return notFoundError("Rule", ruleId, "list_rules");
        return { content: [{ type: "text" as const, text: `Updated rule: "${rule.name}"` }] };
      } catch (err: unknown) {
        return { content: [{ type: "text" as const, text: actionableError("updating rule", err) }], isError: true };
      }
    },
  );

  server.tool("delete_rule", "Delete a business rule.", { ruleId: z.number() }, async ({ ruleId }) => {
    try {
      const deleted = await storage.deleteRule(ruleId);
      if (!deleted) return notFoundError("Rule", ruleId, "list_rules");
      return { content: [{ type: "text" as const, text: `Deleted rule ${ruleId}` }] };
    } catch (err: unknown) {
      return { content: [{ type: "text" as const, text: actionableError("deleting rule", err) }], isError: true };
    }
  });

  // --- Resources: per-contact relationship journal as a file-like URI ---
  server.registerResource(
    "relationship_journal",
    new ResourceTemplate("journal://contact/{id}/journal.md", {
      list: async () => {
        const allContacts = await storage.getContactsWithRelations();
        return {
          resources: allContacts.map((c) => ({
            uri: `journal://contact/${c.id}/journal.md`,
            name: `${c.firstName} ${c.lastName} — ${c.company?.name ?? "—"} — Relationship Journal`,
            mimeType: "text/markdown",
          })),
        };
      },
    }),
    {
      description:
        "Per-contact relationship journal as a markdown file. Use read_journal / edit_journal / append_journal tools to modify.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const idStr = Array.isArray(variables.id) ? variables.id[0] : variables.id;
      const id = Number(idStr);
      if (!Number.isFinite(id)) {
        throw new Error(`Invalid contact id in URI: ${uri.href}`);
      }
      const contact = await storage.getContact(id);
      if (!contact) throw new Error(`Contact ${id} not found`);
      const text = contact.relationshipJournal ?? JOURNAL_SKELETON(`${contact.firstName} ${contact.lastName}`);
      return {
        contents: [{ uri: uri.href, mimeType: "text/markdown", text }],
      };
    },
  );

  return server;
}

// Session management for stateful connections
const transports = new Map<string, StreamableHTTPServerTransport>();

// MCP token is stored in the DB per user. Check against the stored token.
async function checkToken(req: Request, res: Response): Promise<boolean> {
  const token = req.params.token;
  if (!token) {
    res.status(404).json({ error: "Not found" });
    return false;
  }

  // Check env var first (backward compat), then DB
  if (process.env.MCP_TOKEN && token === process.env.MCP_TOKEN) return true;

  const user = await storage.getFirstUser();
  if (user && user.mcpToken && token === user.mcpToken) return true;

  res.status(404).json({ error: "Not found" });
  return false;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
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
setInterval(
  () => {
    const now = Date.now();
    for (const [id, lastUsed] of sessionLastUsed.entries()) {
      if (now - lastUsed > SESSION_TTL_MS) {
        transports.delete(id);
        sessionLastUsed.delete(id);
      }
    }
  },
  5 * 60 * 1000,
);

export function registerMcpRoutes(app: Express) {
  // Handle POST /mcp/:token
  // If session ID is unknown (e.g. after redeploy), auto-create a new session
  // so Claude doesn't need manual reconnection
  app.post("/mcp/:token", async (req: Request, res: Response) => {
    if (!(await checkToken(req, res))) return;
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
    if (!(await checkToken(req, res))) return;
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
    if (!(await checkToken(req, res))) return;
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
