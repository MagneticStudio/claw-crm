/* eslint-disable no-console */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { companies, contacts, interactions, followups, rules, briefings, users } from "@shared/schema";
import { hashPin } from "./auth";
import { randomBytes } from "crypto";
import { toNoonUTC } from "@shared/dates";
import { JOURNAL_SKELETON } from "@shared/journal";

/**
 * SAFETY GUARDRAIL — prevent accidentally seeding (and wiping!) a real DB.
 *
 * The seed TRUNCATEs every table CASCADE before inserting. That's what makes it
 * idempotent — but it's also a foot-gun if pointed at production. So:
 *  - Local hosts (localhost / 127.0.0.1 / containing "local") run free.
 *  - Anything else requires `CLAW_SEED_FORCE=1` to be set.
 * The operator confirms the target host out loud before forcing.
 */
function assertSafeToWipe(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  let host = "(unparseable)";
  try {
    host = new URL(url).host;
  } catch {
    // ignore — we'll still print and gate
  }
  const isLocal = /localhost|127\.0\.0\.1|host\.docker\.internal|^local|\.local(:|$)/.test(host);
  console.log(`Target DB host: ${host}`);
  if (isLocal) return;
  if (process.env.CLAW_SEED_FORCE !== "1") {
    console.error(
      `\nRefusing to wipe a non-local DB host (${host}).\n` +
        `If this is intentional, re-run with CLAW_SEED_FORCE=1.\n` +
        `This script TRUNCATEs every table — do not point it at production.`,
    );
    process.exit(1);
  }
  console.warn(`\n⚠️  CLAW_SEED_FORCE=1 set. Wiping ${host} in 3 seconds. Ctrl+C to abort.`);
}

/**
 * Wipe every app table CASCADE so the seed is idempotent. Lists tables
 * explicitly (not `pg_class`) so a typo never reaches a table we don't expect.
 * Skips tables that don't exist yet — `session` is created lazily by
 * connect-pg-simple at runtime, so it's missing on a freshly-pushed schema
 * (notably CI's test DB).
 */
async function wipeAllTables(): Promise<void> {
  const candidates = [
    "contacts",
    "companies",
    "interactions",
    "followups",
    "briefings",
    "rules",
    "rule_violations",
    "contact_journal_revisions",
    "activity_log",
    "users",
    "session",
  ];
  // Inline the candidate list — names are literal and trusted, no SQL injection
  // surface. Avoids drizzle's array-binding quirks across drivers.
  const inList = candidates.map((t) => `'${t}'`).join(", ");
  const result = await db.execute<{ table_name: string }>(
    sql.raw(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${inList})`,
    ),
  );
  // drizzle's `db.execute` returns either { rows: [...] } or [...] depending on the driver.
  const rows =
    (result as unknown as { rows?: { table_name: string }[] }).rows ?? (result as unknown as { table_name: string }[]);
  const existing = rows.map((r) => r.table_name);
  if (existing.length === 0) return;
  // Names are drawn from the literal allow-list above, so quoting + raw is safe.
  const truncateList = existing.map((t) => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${truncateList} RESTART IDENTITY CASCADE;`));
}

async function seed() {
  assertSafeToWipe();
  // 3-second pause only when forcing a non-local wipe — gives operator time to abort.
  if (process.env.CLAW_SEED_FORCE === "1") {
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("Wiping existing data...");
  await wipeAllTables();

  console.log("Seeding database with demo data...");

  // Create user
  const pin = await hashPin("1234");
  const apiKey = `claw_${randomBytes(24).toString("hex")}`;
  const mcpToken = randomBytes(16).toString("hex");
  await db.insert(users).values({ pin, apiKey, mcpToken, orgName: "Claw CRM" }).returning();
  console.log(`Created user — PIN: 1234, API key: ${apiKey}, MCP token: ${mcpToken}`);

  /** Days from today → noon UTC Date. Negative = past, positive = future. */
  const d = (daysFromToday: number) => toNoonUTC(new Date(Date.now() + daysFromToday * 86_400_000));

  /** Days from today → "YYYY-MM-DD" string for inline use in journal/briefing prose. */
  const dIso = (daysFromToday: number) => d(daysFromToday).toISOString().slice(0, 10);

  // Companies
  const companyData = [
    { name: "Meridian Capital", website: "meridiancap.com", notes: "Growth-stage VC, $2B AUM" },
    { name: "Atlas Robotics", website: "atlasrobotics.io", notes: "Series B warehouse automation startup" },
    { name: "Solara Energy", website: "solaraenergy.com", notes: "Commercial solar + battery storage" },
    { name: "Northbridge Holdings", website: "northbridge.co", notes: "Family office, $500M in diversified holdings" },
    { name: "Quantum Labs", website: "quantumlabs.ai", notes: "AI-native drug discovery platform" },
    { name: "Pacific Ventures", website: "pacificvc.com", notes: "Early-stage climate tech fund" },
    { name: "Horizon Media", website: "horizonmedia.co", notes: "Digital media and content studio" },
    { name: "Sterling Advisors", website: "sterlingadvisors.com", notes: "Boutique M&A advisory" },
  ];

  const co: Record<string, number> = {};
  for (const c of companyData) {
    const [company] = await db.insert(companies).values(c).returning();
    co[c.name] = company.id;
  }

  // --- Sarah Chen — Meridian Capital (LIVE) ---
  const sarahJournal = `# Sarah Chen

## Key People
- **Sarah Chen** (Managing Partner) — primary sponsor, biweekly cadence on Tuesdays. Decisive, pattern-matches fast.
- **Lisa Bouyer** (VP Enterprise Planning) — operational counterpart for portfolio rollouts. Detail-oriented; runs the actual programs.

## Wins / Case Study Material
- ${dIso(-61)}: Sarah signed 3-month engagement covering 4 portfolio companies — first paid engagement of the year.
- ${dIso(-28)}: Two of the four portfolio companies (Atlas + one other) showing measurable AI adoption gains. Quotable: *"This is what enablement looks like when it actually lands."*

## Entries

### ${dIso(-61)}: Engagement signed
Pre-call she said the proposal "felt expensive but right." Signed 9 days after we sent it. Lisa joined for the kickoff to align on which portfolio companies were ready first. Read: she's investing in *us*, not just the project.

### ${dIso(-28)}: Mid-engagement check-in
Atlas + one other showing strong adoption. Sarah floated the idea of expanding to the other two portfolio companies in Q3. Did not commit yet.

### ${dIso(-7)}: Partner motion signal
Sarah said "I want to think bigger than a deck." Read: she's signaling she wants Magnetic to function as a partner, not a vendor. Worth leading with the BD stance in the next prep.

> *Verbatim from her email on ${dIso(-7)}:*
> *"Two of our portfolio companies are asking for AI advisory directly. Can we expand the scope?"*
`;
  const [sarah] = await db
    .insert(contacts)
    .values({
      firstName: "Sarah",
      lastName: "Chen",
      title: "Managing Partner",
      email: "sarah@meridiancap.com",
      phone: "415.555.0101",
      website: "meridiancap.com",
      linkedinUrl: "https://www.linkedin.com/in/sarahchen-meridian",
      location: "SF",
      background: "Growth-stage VC. Strong AI thesis. Previously at Sequoia.",
      status: "ACTIVE",
      stage: "LIVE",
      companyId: co["Meridian Capital"],
      sortOrder: 0,
      source: "Direct (met at AI Summit 2025)",
      cadence: "Biweekly (Tuesdays)",
      relationshipJournal: sarahJournal,
    })
    .returning();
  await db.insert(interactions).values([
    {
      contactId: sarah.id,
      date: d(-87),
      content: "Intro call. Sarah interested in AI advisory for portfolio companies.",
      type: "meeting",
    },
    {
      contactId: sarah.id,
      date: d(-70),
      content: "Proposal sent. 3-month engagement, 4 portfolio companies.",
      type: "email",
    },
    {
      contactId: sarah.id,
      date: d(-61),
      content: "Sarah signed. Kicking off with first portfolio company next week.",
      type: "note",
    },
    {
      contactId: sarah.id,
      date: d(-28),
      content: "Monthly check-in. Two companies showing strong AI adoption progress.",
      type: "meeting",
    },
    {
      contactId: sarah.id,
      date: d(-7),
      content: "Sarah emailed: two portfolio companies asking for AI advisory directly. Floated expansion.",
      type: "email",
    },
  ]);
  await db.insert(followups).values({
    contactId: sarah.id,
    dueDate: d(2),
    content: "Prep Q2 portfolio review deck",
    type: "task",
    completed: false,
  });
  // Fresh briefing (today) — demonstrates the canonical 8-section format.
  await db.insert(briefings).values({
    contactId: sarah.id,
    content: `# Sarah Chen — Meridian Capital

## TL;DR
Sarah is signaling a shift from vendor to *partner* relationship. Two of her portfolio companies are asking for AI advisory expansion. Use this meeting to anchor the partner framing and scope the expansion.

## About them
- **Role:** Managing Partner at Meridian Capital, leads the AI thesis.
- **Background:** Previously at Sequoia. Investing in AI tooling since 2021.
- **Recent activity:** Spoke at AI Summit 2025; published a thesis post on agent ops in March.

## About the company
Growth-stage VC, $2B AUM. Strong AI thesis, ~30 portfolio companies. Recent fund close in 2026-Q1 reportedly oversubscribed.

## Shared ground
- Stanford GSB overlap (different years).
- Mutual: David Kim (early Meridian advisor, also referred Northbridge).
- Both have written about AI ops; her thesis aligns with Magnetic's positioning.

## Our history
- Stage: **LIVE** since ${dIso(-61)}.
- Initial meeting at AI Summit 2025; proposal sent ${dIso(-70)}; signed 9 days later.
- Open: Q2 portfolio review deck due ${dIso(2)}.

## What to discuss
1. The two new portfolio companies — qualify need, scope, timing.
2. Pricing model for partner-tier engagement (no specifics — see Confidentiality).
3. Cadence: keep biweekly Tuesdays or shift to monthly?
4. Case-study material — would she let us write one on the existing engagement?

## Offers / asks
- **Could offer:** intro to the evals framework that landed well at Atlas.
- **Could ask:** a warm intro to one of the two AI-curious portfolio CEOs.

## Watch-outs
Don't lead with the deck refresh — she explicitly said "think bigger than a deck." Avoid pricing specifics in writing — keep dollars verbal.
`,
  });

  // --- Marcus Webb — Atlas Robotics (PROPOSAL) ---
  const marcusJournal = `# Marcus Webb

## Key People
- **Marcus Webb** (CTO) — primary contact, the technical decision-maker. Hands-on, will eval everything himself before approving.

## Wins / Case Study Material
<!-- Nothing yet — engagement still in proposal. -->

## Entries

### ${dIso(-31)}: Discovery call
45-minute call. Team of 30 engineers, mostly Python. The real pain is QA pipeline cycle time — they want LLMs in the test gen + triage flow, not customer-facing AI. Different problem than Sarah's portfolio.
`;
  const [marcus] = await db
    .insert(contacts)
    .values({
      firstName: "Marcus",
      lastName: "Webb",
      title: "CTO",
      email: "marcus@atlasrobotics.io",
      website: "atlasrobotics.io",
      linkedinUrl: "https://www.linkedin.com/in/marcuswebb-atlas",
      location: "Austin",
      background: "Series B warehouse automation. 200 employees. Engineering team needs AI upskilling.",
      status: "ACTIVE",
      stage: "PROPOSAL",
      companyId: co["Atlas Robotics"],
      sortOrder: 1,
      source: "Sarah Chen (Meridian portfolio)",
      relationshipJournal: marcusJournal,
    })
    .returning();
  await db.insert(interactions).values([
    {
      contactId: marcus.id,
      date: d(-38),
      content: "Intro via Sarah Chen. Marcus wants AI enablement for engineering team.",
      type: "note",
    },
    {
      contactId: marcus.id,
      date: d(-31),
      content: "Discovery call. 45 min. Team of 30 engineers, mostly Python. Want to integrate LLMs into QA pipeline.",
      type: "meeting",
    },
    { contactId: marcus.id, date: d(-23), content: "Proposal sent. 6-week sprint, $25K.", type: "email" },
  ]);
  await db.insert(followups).values({
    contactId: marcus.id,
    dueDate: d(5),
    content: "Follow up on proposal — Marcus said he'd review over weekend",
    type: "task",
    completed: false,
  });
  // Stale briefing (10 days old) — demonstrates the staleness banner + hidden-on-card behavior.
  await db.insert(briefings).values({
    contactId: marcus.id,
    content: `# Marcus Webb — Atlas Robotics

## TL;DR
Proposal is out, awaiting Marcus's eval. Last we heard, he was going to review over the weekend. Use this touch to qualify next steps without pushing.

## About them
- **Role:** CTO at Atlas Robotics, 200-person Series B warehouse automation company.
- **Background:** Stanford CS. Prior stints at AWS and a robotics startup pre-acquisition.
- **Recent activity:** Posted about LLM evals two weeks ago — strong opinions on hallucination tolerance.

## About the company
Series B, post-Series-B funding round closed late 2025. ~200 engineers and ops, fast-growing. Warehouse automation customers across logistics + retail.

## Shared ground
- Both at Stanford; different years.
- Sarah Chen referred — Atlas is in the Meridian portfolio.

## Our history
- Stage: **PROPOSAL** since ${dIso(-23)}.
- Discovery call ${dIso(-31)}; proposal sent 8 days later.
- Open: follow-up on proposal due ${dIso(5)}.

## What to discuss
1. Status on his eval of the proposal.
2. Any blockers from finance or his eng leadership team.
3. Their QA pipeline pain — does the proposal scope match what he needs?

## Offers / asks
- **Could offer:** sample evals deliverable from a past client (anonymized).
- **Could ask:** what would unblock signing this week vs. next month?

## Watch-outs
He's hands-on technical. Don't oversell — he'll see through it. Stick to specifics.
`,
    // Stale: 10 days old, exceeds the 7-day TTL.
    updatedAt: new Date(Date.now() - 10 * 86_400_000),
  });

  // --- Elena Vasquez — Solara Energy (MEETING) ---
  const elenaJournal = `# Elena Vasquez

## Key People
- **Elena Vasquez** (VP Operations) — entry point, runs the day-to-day across 500+ installations.
- **Mike Torres** (CTO) — technical decision-maker. Elena introduced him; he hasn't engaged directly yet.

## Wins / Case Study Material
<!-- Too early — still qualifying. -->

## Entries

### ${dIso(-33)}: First call
30 minutes. Elena described maintenance challenges across 500 sites. AI for predictive panel failures was her idea, not ours. She wants to bring Mike in for the technical scope. Read: warm but needs Mike's blessing before anything moves.
`;
  const [elena] = await db
    .insert(contacts)
    .values({
      firstName: "Elena",
      lastName: "Vasquez",
      title: "VP Operations",
      email: "elena.v@solaraenergy.com",
      phone: "310.555.0202",
      linkedinUrl: "https://www.linkedin.com/in/elena-vasquez-solara",
      location: "LA",
      background: "Commercial solar + storage. 500+ installations. Wants AI for predictive maintenance.",
      status: "ACTIVE",
      stage: "MEETING",
      companyId: co["Solara Energy"],
      sortOrder: 2,
      source: "LinkedIn (cold outreach)",
      additionalContacts: "Mike Torres (CTO): mike@solaraenergy.com",
      relationshipJournal: elenaJournal,
    })
    .returning();
  await db.insert(interactions).values([
    {
      contactId: elena.id,
      date: d(-42),
      content: "Cold outreach via LinkedIn. Elena responded same day — interested.",
      type: "email",
    },
    {
      contactId: elena.id,
      date: d(-33),
      content:
        "First call. 30 min. Elena described maintenance challenges across 500 sites. AI could predict panel failures.",
      type: "meeting",
    },
    {
      contactId: elena.id,
      date: d(-21),
      content: "Elena introduced Mike Torres (CTO). Scheduling a technical deep-dive.",
      type: "email",
    },
  ]);
  await db.insert(followups).values([
    {
      contactId: elena.id,
      dueDate: d(3),
      content: "Schedule technical call with Mike Torres",
      type: "task",
      completed: false,
    },
    {
      contactId: elena.id,
      dueDate: d(9),
      content: "Coffee with Elena",
      type: "meeting",
      time: "10:00 AM",
      location: "Verve Coffee, Santa Monica",
      completed: false,
    },
  ]);

  // --- James Thornton — Northbridge Holdings (NEGOTIATION) ---
  const jamesJournal = `# James Thornton

## Key People
- **James Thornton** (Principal) — deal lead. Slow but methodical. Drives the investment committee process.

## Wins / Case Study Material
- ${dIso(-38)}: Proposal accepted in principle. Pending committee approval. *"Proposal looks good. Need to run it by our investment committee."*

## Entries

### ${dIso(-46)}: Zoom scoping call
James outlined the 12-company portfolio. Wants a phased approach — 3 companies for Phase 1, then expand based on results. Not in a rush; family office decision pace.

### ${dIso(-25)}: Committee in the loop
Quoted him: *"Proposal looks good. Need to run it by our investment committee."* Committee meets monthly. Realistic close: 2–3 weeks out.
`;
  const [james] = await db
    .insert(contacts)
    .values({
      firstName: "James",
      lastName: "Thornton",
      title: "Principal",
      email: "jthornton@northbridge.co",
      phone: "212.555.0303",
      linkedinUrl: "https://www.linkedin.com/in/jthornton-northbridge",
      location: "NYC",
      background: "Family office. Exploring AI across portfolio of 12 companies. Big budget, slow decision-making.",
      status: "ACTIVE",
      stage: "NEGOTIATION",
      companyId: co["Northbridge Holdings"],
      sortOrder: 3,
      source: "Referral (David Kim)",
      relationshipJournal: jamesJournal,
    })
    .returning();
  await db.insert(interactions).values([
    {
      contactId: james.id,
      date: d(-56),
      content: "David Kim intro'd. James looking for AI strategy consultant across their portfolio.",
      type: "note",
    },
    {
      contactId: james.id,
      date: d(-46),
      content: "Zoom call. James outlined 12-company portfolio. Wants phased approach starting with 3 companies.",
      type: "meeting",
    },
    {
      contactId: james.id,
      date: d(-38),
      content: "Proposal sent. $75K for Phase 1 (3 companies, 12 weeks).",
      type: "email",
    },
    {
      contactId: james.id,
      date: d(-25),
      content: "James: 'Proposal looks good. Need to run it by our investment committee.'",
      type: "email",
    },
    {
      contactId: james.id,
      date: d(-18),
      content: "Followed up. James confirmed committee meeting is on track.",
      type: "email",
    },
  ]);
  await db.insert(followups).values({
    contactId: james.id,
    dueDate: d(8),
    content: "Check in after investment committee meeting",
    type: "task",
    completed: false,
  });

  // --- Priya Patel — Quantum Labs (LEAD) ---
  const [priya] = await db
    .insert(contacts)
    .values({
      firstName: "Priya",
      lastName: "Patel",
      title: "CEO & Co-founder",
      email: "priya@quantumlabs.ai",
      linkedinUrl: "https://www.linkedin.com/in/priyapatel-quantumlabs",
      location: "Boston",
      background: "AI-native drug discovery. Series A. Small team, moving fast.",
      status: "ACTIVE",
      stage: "LEAD",
      companyId: co["Quantum Labs"],
      sortOrder: 4,
      source: "YC Demo Day",
    })
    .returning();
  await db.insert(interactions).values([
    {
      contactId: priya.id,
      date: d(-23),
      content: "Met at YC Demo Day. Priya interested in AI ops advisory.",
      type: "meeting",
    },
    { contactId: priya.id, date: d(-21), content: "Sent follow-up email with case study.", type: "email" },
  ]);
  await db
    .insert(followups)
    .values({ contactId: priya.id, dueDate: d(6), content: "Schedule intro call", type: "task", completed: false });

  // --- David Kim — Pacific Ventures (MEETING, HOLD) ---
  const [david] = await db
    .insert(contacts)
    .values({
      firstName: "David",
      lastName: "Kim",
      title: "General Partner",
      email: "david@pacificvc.com",
      location: "LA",
      background: "Climate tech VC. Good relationship. Referred James Thornton.",
      status: "HOLD",
      stage: "MEETING",
      companyId: co["Pacific Ventures"],
      sortOrder: 5,
      source: "Direct (industry event)",
    })
    .returning();
  await db.insert(interactions).values([
    {
      contactId: david.id,
      date: d(-61),
      content:
        "Caught up at climate tech conference. David not ready for advisory engagement but referred Northbridge.",
      type: "meeting",
    },
    {
      contactId: david.id,
      date: d(-42),
      content: "Moved to HOLD. Good relationship, not a current prospect.",
      type: "note",
    },
  ]);

  // --- Rachel Foster — Horizon Media (RELATIONSHIP) ---
  const [rachel] = await db
    .insert(contacts)
    .values({
      firstName: "Rachel",
      lastName: "Foster",
      title: "CEO",
      email: "rachel@horizonmedia.co",
      linkedinUrl: "https://www.linkedin.com/in/rachelfoster-horizon",
      location: "NYC",
      background: "Digital media studio. Old colleague. Not a prospect — just a good relationship to maintain.",
      status: "ACTIVE",
      stage: "RELATIONSHIP",
      companyId: co["Horizon Media"],
      sortOrder: 6,
      source: "Former colleague",
      // Skeleton journal — appears as "Start journal" CTA on the demo if the user
      // hasn't appended yet. (Server skeleton init also exists; this is just so
      // the demo isn't entirely empty.)
      relationshipJournal: JOURNAL_SKELETON("Rachel Foster"),
    })
    .returning();
  await db.insert(interactions).values([
    {
      contactId: rachel.id,
      date: d(-57),
      content: "Caught up over lunch. Rachel's company is growing fast.",
      type: "meeting",
    },
    {
      contactId: rachel.id,
      date: d(-33),
      content: "Shared an article on AI in media. Rachel replied: 'Great read, thanks!'",
      type: "email",
    },
  ]);
  await db
    .insert(followups)
    .values({ contactId: rachel.id, dueDate: d(16), content: "Coffee catch-up", type: "task", completed: false });

  // --- Tom Nakamura — Sterling Advisors (PASS) ---
  const [tom] = await db
    .insert(contacts)
    .values({
      firstName: "Tom",
      lastName: "Nakamura",
      title: "Managing Director",
      email: "tom@sterlingadvisors.com",
      location: "Chicago",
      background: "M&A advisory. Explored AI partnership but not a fit — they want a full-time hire.",
      status: "ACTIVE",
      stage: "PASS",
      companyId: co["Sterling Advisors"],
      sortOrder: 7,
      source: "Cold email",
    })
    .returning();
  await db.insert(interactions).values([
    {
      contactId: tom.id,
      date: d(-66),
      content: "Cold email. Tom replied, interested in AI for due diligence.",
      type: "email",
    },
    {
      contactId: tom.id,
      date: d(-56),
      content: "Call. Realized they want a full-time AI hire, not advisory. Not a fit.",
      type: "meeting",
    },
    {
      contactId: tom.id,
      date: d(-55),
      content: "Moved to PASS. Offered to help with job spec if needed.",
      type: "note",
    },
  ]);

  // --- Default rules ---
  await db.insert(rules).values([
    {
      name: "Stale Contact Detection",
      description: "Flag ACTIVE contacts with no interaction for 14+ days, unless a future follow-up exists",
      condition: {
        type: "no_interaction_for_days",
        params: { days: 14 },
        exceptions: [{ type: "has_future_followup" }],
      },
      action: {
        type: "create_violation",
        params: { severity: "warning", message_template: "No interaction for {{days_since_last}} days" },
      },
      enabled: true,
    },
    {
      name: "Past-Due Follow-Up",
      description: "Flag follow-ups that are past their due date",
      condition: { type: "followup_past_due", params: {} },
      action: {
        type: "create_violation",
        params: { severity: "warning", message_template: "Follow-up overdue: {{followup_content}}" },
      },
      enabled: true,
    },
    {
      name: "Post-Meeting Follow-Up",
      description: "Ensure a follow-up is created within 48 hours after a meeting",
      condition: { type: "no_followup_after_meeting", params: { hours: 48 } },
      action: {
        type: "create_violation",
        params: { severity: "info", message_template: "No follow-up scheduled after meeting on {{meeting_date}}" },
      },
      enabled: true,
    },
  ]);

  console.log(
    "Seed complete! 8 demo contacts (4 with journals, 2 with briefings — Sarah fresh, Marcus stale), 8 companies, 3 rules.",
  );
  console.log(`\nMCP URL: /mcp/${mcpToken}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
