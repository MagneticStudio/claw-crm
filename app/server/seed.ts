/* eslint-disable no-console */
import "dotenv/config";
import { db } from "./db";
import { companies, contacts, interactions, followups, rules } from "@shared/schema";
import { hashPin } from "./auth";
import { users } from "@shared/schema";
import { randomBytes } from "crypto";
import { toNoonUTC } from "@shared/dates";

async function seed() {
  console.log("Seeding database with demo data...");

  // Create user
  const pin = await hashPin("1234");
  const apiKey = `claw_${randomBytes(24).toString("hex")}`;
  const mcpToken = randomBytes(16).toString("hex");
  await db.insert(users).values({ pin, apiKey, mcpToken, orgName: "Claw CRM" }).returning();
  console.log(`Created user — PIN: 1234, API key: ${apiKey}, MCP token: ${mcpToken}`);

  /** Days from today → noon UTC. Negative = past, positive = future. */
  const d = (daysFromToday: number) => toNoonUTC(new Date(Date.now() + daysFromToday * 86_400_000));

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
  const [sarah] = await db
    .insert(contacts)
    .values({
      firstName: "Sarah",
      lastName: "Chen",
      title: "Managing Partner",
      email: "sarah@meridiancap.com",
      phone: "415.555.0101",
      website: "meridiancap.com",
      location: "SF",
      background: "Growth-stage VC. Strong AI thesis. Previously at Sequoia.",
      status: "ACTIVE",
      stage: "LIVE",
      companyId: co["Meridian Capital"],
      sortOrder: 0,
      source: "Direct (met at AI Summit 2025)",
      cadence: "Biweekly (Tuesdays)",
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
  ]);
  await db.insert(followups).values({
    contactId: sarah.id,
    dueDate: d(2),
    content: "Prep Q2 portfolio review deck",
    type: "task",
    completed: false,
  });

  // --- Marcus Webb — Atlas Robotics (PROPOSAL) ---
  const [marcus] = await db
    .insert(contacts)
    .values({
      firstName: "Marcus",
      lastName: "Webb",
      title: "CTO",
      email: "marcus@atlasrobotics.io",
      website: "atlasrobotics.io",
      location: "Austin",
      background: "Series B warehouse automation. 200 employees. Engineering team needs AI upskilling.",
      status: "ACTIVE",
      stage: "PROPOSAL",
      companyId: co["Atlas Robotics"],
      sortOrder: 1,
      source: "Sarah Chen (Meridian portfolio)",
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

  // --- Elena Vasquez — Solara Energy (MEETING) ---
  const [elena] = await db
    .insert(contacts)
    .values({
      firstName: "Elena",
      lastName: "Vasquez",
      title: "VP Operations",
      email: "elena.v@solaraenergy.com",
      phone: "310.555.0202",
      location: "LA",
      background: "Commercial solar + storage. 500+ installations. Wants AI for predictive maintenance.",
      status: "ACTIVE",
      stage: "MEETING",
      companyId: co["Solara Energy"],
      sortOrder: 2,
      source: "LinkedIn (cold outreach)",
      additionalContacts: "Mike Torres (CTO): mike@solaraenergy.com",
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
  const [james] = await db
    .insert(contacts)
    .values({
      firstName: "James",
      lastName: "Thornton",
      title: "Principal",
      email: "jthornton@northbridge.co",
      phone: "212.555.0303",
      location: "NYC",
      background: "Family office. Exploring AI across portfolio of 12 companies. Big budget, slow decision-making.",
      status: "ACTIVE",
      stage: "NEGOTIATION",
      companyId: co["Northbridge Holdings"],
      sortOrder: 3,
      source: "Referral (David Kim)",
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
      location: "NYC",
      background: "Digital media studio. Old colleague. Not a prospect — just a good relationship to maintain.",
      status: "ACTIVE",
      stage: "RELATIONSHIP",
      companyId: co["Horizon Media"],
      sortOrder: 6,
      source: "Former colleague",
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

  console.log("Seed complete! 8 demo contacts, 8 companies, 3 rules.");
  console.log(`\nMCP URL: /mcp/${mcpToken}`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
