import "dotenv/config";
import { db } from "./db";
import { companies, contacts, interactions, followups, rules } from "@shared/schema";
import { hashPin } from "./auth";
import { users } from "@shared/schema";
import { randomBytes } from "crypto";

async function seed() {
  console.log("Seeding database...");

  // Create user
  const pin = await hashPin("1234"); // Default PIN, change after setup
  const apiKey = `claw_${randomBytes(24).toString("hex")}`;
  const [user] = await db.insert(users).values({ pin, apiKey }).returning();
  console.log(`Created user with API key: ${apiKey}`);

  // Create companies
  const companyData = [
    { name: "Lido Advisors", website: "lidoadvisors.com" },
    { name: "WPS Publishing", website: "wpspublish.com", notes: "Western Psychological Services" },
    { name: "Cairns Health", website: "cairns.ai", notes: "Khosla Ventures-backed AI healthcare startup (formerly CoCo Health). Radar-driven, AI-enabled care platform for aging/polychronic patients." },
    { name: "Enduring Ventures", website: "enduring.ventures", notes: "Berkshire-inspired long-term holding company. 15-20 businesses, revenues $20M-$500M range, most under $50M." },
    { name: "OpenComp", website: "opencomp.com", notes: "AI-powered compensation benchmarking platform" },
    { name: "TruAmerica Multifamily", website: null, notes: "Closed $708M Workforce Housing Fund II" },
    { name: "Grupo Proeza", website: null, notes: "$4B Monterrey conglomerate. Metalsa (Tier-1 auto), Citrofrut (agriculture), Olaro (US nurse staffing), Proeza Ventures. 13,000 employees." },
    { name: "FIT House of Brands", website: null, notes: "F45, FS8, VAURA Pilates" },
    { name: "Pirros", website: null, notes: null },
    { name: "UpKeep", website: "upkeep.com", notes: null },
    { name: "Edited Capital", website: "editedcapital.com", notes: "PE firm, Fund III ($150M)" },
    { name: "First American Title", website: null, notes: "National Commercial Services" },
  ];

  const createdCompanies: Record<string, number> = {};
  for (const c of companyData) {
    const [company] = await db.insert(companies).values(c).returning();
    createdCompanies[c.name] = company.id;
  }

  // Helper to create date in 2026
  const d = (m: number, day: number) => new Date(2026, m - 1, day);

  // --- Kyle Cross / Idan Tal — Lido Advisors ---
  const [lido] = await db.insert(contacts).values({
    firstName: "Kyle", lastName: "Cross",
    title: "Founder's Team + MD, IM DevOps & Data Science",
    email: "ital@lidoadvisors.com",
    website: "lidoadvisors.com",
    location: "LA",
    background: "Kyle: Vanderbilt (Econ/History), UCLA (MBA + MPH). Built ML algo predicting cardiac arrests.\nIdan Tal: PhD Brain Research (Bar-Ilan), ex-Synchron (BCI), now building data/AI infrastructure at Lido.",
    status: "ACTIVE", stage: "MEETING",
    companyId: createdCompanies["Lido Advisors"],
    sortOrder: 0,
    source: "Kyle Cross (AF's contact)",
    additionalContacts: "Idan Tal: PhD Brain Research, ital@lidoadvisors.com",
  }).returning();

  const lidoInteractions = [
    { contactId: lido.id, date: d(2,23), content: "Kyle told Lido's AI lead about AF. They want to talk. Big AI push underway.", type: "note" },
    { contactId: lido.id, date: d(2,23), content: "Lido asked for NDA. AF declined, prefers to talk first.", type: "note" },
    { contactId: lido.id, date: d(3,10), content: "AF had call with Idan Tal. 45 min turned into 1.5 hours. Went really well.", type: "meeting" },
    { contactId: lido.id, date: d(3,15), content: "AF sent follow-up to Idan. Warm tone — references personal convo, pattern recognition across orgs, alludes to \"something more structured.\" Mentions locking in May commitments.", type: "email" },
    { contactId: lido.id, date: d(3,19), content: "AF followed up with Idan. Original 3/15 email was caught in Lido's spam filter. Idan replied: feeling is mutual, wants to chat again, wants to understand \"what something more structured would look like\" so he can make the case internally at Lido.", type: "email" },
    { contactId: lido.id, date: d(3,19), content: "AF replied: proposed coffee or lunch in Century City next week, Tue or Thu anytime starting 11 AM.", type: "email" },
    { contactId: lido.id, date: d(3,25), content: "AF followed up with Idan.", type: "email" },
  ];
  await db.insert(interactions).values(lidoInteractions);
  await db.insert(followups).values({ contactId: lido.id, dueDate: d(3,28), content: "Check for Idan's reply on Century City meetup", completed: false });

  // --- Jeff Manson — WPS Publishing ---
  const [wps] = await db.insert(contacts).values({
    firstName: "Jeff", lastName: "Manson",
    title: "President + CEO",
    email: "jmanson@wpspublish.com", phone: "424.201.8888",
    website: "wpspublish.com",
    location: "Torrance, CA",
    background: "Lisa Bouyer (VP Enterprise Planning): logistics + contracts contact",
    status: "ACTIVE", stage: "LIVE",
    companyId: createdCompanies["WPS Publishing"],
    sortOrder: 1,
    source: "Ryan Chan (referral)",
    additionalContacts: "Lisa Bouyer (VP Enterprise Planning)",
  }).returning();

  const wpsInteractions = [
    { contactId: wps.id, date: d(3,9), content: "Jeff re-engaged, wants AI coding enablement for engineering team. Team signing Claude Code license.", type: "note" },
    { contactId: wps.id, date: d(3,9), content: "AF outlined high-impact enablement sprints. Shared Calendly.", type: "email" },
    { contactId: wps.id, date: d(3,9), content: "Jeff scheduled call for Fri 3/13 10:30am PT. Very positive.", type: "note" },
    { contactId: wps.id, date: d(3,13), content: "Call happened. Briefing: crm/briefings/jeff-manson-wps.md", type: "meeting" },
    { contactId: wps.id, date: d(3,15), content: "Proposal drafted and sent.", type: "note" },
    { contactId: wps.id, date: d(3,16), content: "Proposal sent. Jeff replied within 15 min, wants to proceed. Requesting MSA, SOW, sending their NDA. Lisa Bouyer cc'd, handling logistics. 13-person tiger team.", type: "email" },
    { contactId: wps.id, date: d(3,16), content: "AF drafted reply covering timing (90 min sessions, 4-5 hrs over 2-3 weeks), recording OK, pre-work brief, SOW/MSA attached.", type: "note" },
    { contactId: wps.id, date: d(3,18), content: "Lisa Bouyer emailed: reviewing contract, expects to finalize shortly. Planning to kick off week of April 13th.", type: "email" },
    { contactId: wps.id, date: d(3,19), content: "Lisa Bouyer sent redlined MSA + WPS standard Data Protection Agreement (DPA, CCPA compliance). AF sent to legal counsel for review.", type: "email" },
    { contactId: wps.id, date: d(3,19), content: "Parker read full email. Lisa's MSA revision summary: Added PII definition + CCPA carveout, Delaware law + neutral-site arbitration.", type: "note" },
    { contactId: wps.id, date: d(3,20), content: "AF sent back another round of legal edits to WPS + answered operational questions.", type: "email" },
    { contactId: wps.id, date: d(3,24), content: "WPS accepted AF's contract redlines. Signing now. 🎉", type: "note" },
  ];
  await db.insert(interactions).values(wpsInteractions);
  await db.insert(followups).values({ contactId: wps.id, dueDate: d(4,6), content: "Prep for kickoff week of April 13th (pre-work brief, session plan for 13-person tiger team)", completed: false });

  // --- Jamey Edwards — Cairns Health ---
  const [cairns] = await db.insert(contacts).values({
    firstName: "Jamey", lastName: "Edwards",
    title: "President & Chief Strategy Officer",
    email: "jameye@gmail.com",
    website: "cairns.ai",
    location: null,
    background: "Khosla Ventures-backed AI healthcare startup (formerly CoCo Health). Radar-driven, AI-enabled care platform.",
    status: "HOLD", stage: "RELATIONSHIP",
    companyId: createdCompanies["Cairns Health"],
    sortOrder: 2,
    source: "Ryan Chan (UpKeep)",
    additionalContacts: "Nicky Hawthorne (Head of Ops): nicky@cairns.ai | 310.488.9848",
  }).returning();

  const cairnsInteractions = [
    { contactId: cairns.id, date: d(3,13), content: "First meeting. Briefing: crm/briefings/jamey-edwards-cairns.md", type: "meeting" },
    { contactId: cairns.id, date: d(3,15), content: "Proposal drafted.", type: "note" },
    { contactId: cairns.id, date: d(3,16), content: "Proposal sent. Jamey replied: \"Will review this with Andrew and revert back shortly.\"", type: "email" },
    { contactId: cairns.id, date: d(3,18), content: "Jamey forwarded proposal thread to Nicky + Andrew.", type: "email" },
    { contactId: cairns.id, date: d(3,18), content: "Nicky Hawthorne emailed requesting a brief follow-up. AF booked Fri 3/20 at 2pm PT.", type: "email" },
    { contactId: cairns.id, date: d(3,19), content: "Nicky: \"Actually going to snag you 15 minutes with our CEO, Andrew, instead.\" Then Anya: budget too high, cancelled meeting.", type: "email" },
    { contactId: cairns.id, date: d(3,19), content: "AF replied graciously: \"No problem. Appreciate the quick and direct response.\"", type: "email" },
    { contactId: cairns.id, date: d(3,23), content: "Anya reversed the pass. AF met with Andrew (CEO) at 4:45 PM. Not ICP. They want long-term engagement, not sprint model. Moving to HOLD/RELATIONSHIP.", type: "meeting" },
  ];
  await db.insert(interactions).values(cairnsInteractions);
  await db.insert(followups).values({ contactId: cairns.id, dueDate: d(4,7), content: "Coffee with Jamey (casual, relationship-building)", completed: false });

  // --- Sieva Kozinsky — Enduring Ventures ---
  const [enduring] = await db.insert(contacts).values({
    firstName: "Sieva", lastName: "Kozinsky",
    title: "Co-founder & Co-CEO",
    email: "sieva@enduring.ventures",
    website: "enduring.ventures",
    location: null,
    background: "Berkshire-inspired long-term holding company. 15-20 businesses. Ukrainian-born, Wharton MBA (Jerome Fisher). Surfs, loves Nosara. Office near the Grove, LA. Wife + 8-month-old son Sasha.",
    status: "ACTIVE", stage: "MEETING",
    companyId: createdCompanies["Enduring Ventures"],
    sortOrder: 3,
    source: "Ryan Chan (UpKeep), YPO connection",
  }).returning();

  const enduringInteractions = [
    { contactId: enduring.id, date: d(3,14), content: "First meeting. Both Ukrainian-born. THE PLAY: Under contract to acquire insurance company. 500 employees, extremely manual. Sieva thinks 500→75 with AI. SEAL Team 6 model: 2-3 person ops/AI team at holding company level.", type: "meeting" },
    { contactId: enduring.id, date: d(3,15), content: "Tabled follow-up until Tue 3/18 per AF", type: "note" },
    { contactId: enduring.id, date: d(3,18), content: "Draft ready (coffee offer, SEAL Team 6 vetting, surf guide). Not yet sent.", type: "note" },
    { contactId: enduring.id, date: d(3,19), content: "AF deprioritized. Focusing on higher-intent pipeline. AF sent Sieva the Santa Teresa surf guide (as promised). Warm, low-key touchpoint.", type: "email" },
    { contactId: enduring.id, date: d(3,19), content: "Sieva replied same day: \"thanks Alex! hope to get my crew down there soon :) good to meet you too.\" Warm, positive.", type: "email" },
  ];
  await db.insert(interactions).values(enduringInteractions);
  await db.insert(followups).values({ contactId: enduring.id, dueDate: d(4,7), content: "Circle back with Sieva", completed: false });

  // --- OpenComp ---
  const [opencomp] = await db.insert(contacts).values({
    firstName: "Bobby", lastName: "Benfield",
    title: "CEO",
    email: "bobby@opencomp.com",
    website: "opencomp.com",
    location: null,
    background: "AI-powered compensation benchmarking platform",
    status: "HOLD", stage: "MEETING",
    companyId: createdCompanies["OpenComp"],
    sortOrder: 4,
    source: "Elena Zislin (J.P. Morgan Technology Ventures)",
  }).returning();

  const opencompInteractions = [
    { contactId: opencomp.id, date: d(3,10), content: "AF added. Intro via Elena Zislin.", type: "note" },
    { contactId: opencomp.id, date: d(3,15), content: "AF pinged Elena today", type: "note" },
    { contactId: opencomp.id, date: d(3,19), content: "Elena made the intro to Bobby Benfield. Bobby said he believes OpenComp is \"significantly behind in how we use AI.\" AF replied same day with Calendly links.", type: "email" },
    { contactId: opencomp.id, date: d(3,23), content: "Discovery call 4pm PT with Bobby + Rony (CTO). Small company, AF not excited. Moving to HOLD.", type: "meeting" },
  ];
  await db.insert(interactions).values(opencompInteractions);

  // --- Austen Mount — TruAmerica ---
  const [truamerica] = await db.insert(contacts).values({
    firstName: "Austen", lastName: "Mount",
    title: "Director of Portfolio Management | Running AI process",
    email: null,
    website: "linkedin.com/in/austenmount",
    location: null,
    background: "CPA (inactive). TruAmerica closed $708M Workforce Housing Fund II.",
    status: "ACTIVE", stage: "MEETING",
    companyId: createdCompanies["TruAmerica Multifamily"],
    sortOrder: 5,
    source: "Friend (met at wedding ~2/14)",
  }).returning();

  const truamericaInteractions = [
    { contactId: truamerica.id, date: d(2,14), content: "AF met Austen at wedding. He's leading AI initiatives at TruAmerica.", type: "meeting" },
    { contactId: truamerica.id, date: d(3,4), content: "AF met with Austen", type: "meeting" },
    { contactId: truamerica.id, date: d(3,15), content: "AF and Austen touched base recently", type: "note" },
    { contactId: truamerica.id, date: d(3,19), content: "AF reached out to schedule a workout together next week. Keeping it casual/relationship-building.", type: "email" },
    { contactId: truamerica.id, date: d(3,26), content: "AF pinged Austen.", type: "email" },
  ];
  await db.insert(interactions).values(truamericaInteractions);
  await db.insert(followups).values({ contactId: truamerica.id, dueDate: d(4,9), content: "Check for reply on workout scheduling", completed: false });

  // --- Daniel Martinez-Valle — Grupo Proeza ---
  const [proeza] = await db.insert(contacts).values({
    firstName: "Daniel", lastName: "Martinez-Valle",
    title: "CEO",
    email: "daniel.martinez-valle@proeza.com.mx",
    website: "linkedin.com/in/daniel-martinez-valle-8026a/",
    location: "Monterrey, Mexico",
    background: "New CEO (Sep 2024). Stanford GSB, ex-Orbia CEO (led Netafim acquisition), IDEO.org board. $4B conglomerate.",
    status: "ACTIVE", stage: "LIVE",
    companyId: createdCompanies["Grupo Proeza"],
    sortOrder: 6,
    source: "Nancy (mutual friend, original intro)",
    additionalContacts: "Blanca Cadena (scheduler): blanca.cadena@proeza.com.mx\nAnna (Chief of Staff)",
  }).returning();

  const proezaInteractions = [
    { contactId: proeza.id, date: d(10,28), content: "On-site Monterrey. Board fireside chat at Club Industrial, exceeded expectations. Engine 2 voice-first AI concept identified.", type: "meeting" },
    { contactId: proeza.id, date: d(10,31), content: "Follow-up email sent. 30/60/90 AI Implementation Plan.", type: "email" },
    { contactId: proeza.id, date: d(2,6), content: "AF re-engaged Daniel re: AI agents.", type: "email" },
    { contactId: proeza.id, date: d(2,16), content: "Daniel replied, wants Zoom. Looped in Blanca Cadena.", type: "email" },
    { contactId: proeza.id, date: d(3,17), content: "Zoom call 3:00 PM PT. Anna joined. Daniel admitted no progress since engagement. Alex demoed Claude Cowork, OpenClaw, Claude for Excel. Presented 5-layer value stack. Daniel identified 3 paths: Olaro, Citrofrut, Metalsa.", type: "meeting" },
    { contactId: proeza.id, date: d(3,24), content: "AF followed up with Daniel.", type: "email" },
  ];
  // Note: Oct dates use 2025, but we'll use month 10 in 2026 for simplicity. Actually let's fix this.
  // The Oct interactions are from 2025, let's use proper dates
  const proezaInteractionsFixed = [
    { contactId: proeza.id, date: new Date(2025, 9, 28), content: "On-site Monterrey. Board fireside chat at Club Industrial, exceeded expectations. Engine 2 voice-first AI concept identified.", type: "meeting" as const },
    { contactId: proeza.id, date: new Date(2025, 9, 31), content: "Follow-up email sent. 30/60/90 AI Implementation Plan.", type: "email" as const },
    { contactId: proeza.id, date: d(2,6), content: "AF re-engaged Daniel re: AI agents.", type: "email" as const },
    { contactId: proeza.id, date: d(2,16), content: "Daniel replied, wants Zoom. Looped in Blanca Cadena.", type: "email" as const },
    { contactId: proeza.id, date: d(3,17), content: "Zoom call. Anna joined. Daniel admitted no AI progress. Alex demoed Claude Cowork, OpenClaw, Claude for Excel. Presented 5-layer value stack. Daniel identified 3 paths: Olaro (Boca Raton, most ready), Citrofrut, Metalsa.", type: "meeting" as const },
    { contactId: proeza.id, date: d(3,24), content: "AF followed up with Daniel.", type: "email" as const },
  ];
  await db.insert(interactions).values(proezaInteractionsFixed);
  await db.insert(followups).values({ contactId: proeza.id, dueDate: d(3,28), content: "Check for Daniel's reply on Metalsa + Boca Raton CEO conversations", completed: false });

  // --- Ryan Mayes — FIT House of Brands ---
  const [fit] = await db.insert(contacts).values({
    firstName: "Ryan", lastName: "Mayes",
    title: "COO",
    email: "rmayes@fithousehq.com",
    website: null,
    location: "LA",
    background: "F45, FS8, VAURA Pilates",
    status: "ACTIVE", stage: "PROPOSAL",
    companyId: createdCompanies["FIT House of Brands"],
    sortOrder: 7,
    source: "Cyrus Massoumi (cyrus@drb.ai)",
  }).returning();

  const fitInteractions = [
    { contactId: fit.id, date: d(2,23), content: "Cyrus intro'd AF + Ryan", type: "note" },
    { contactId: fit.id, date: d(2,27), content: "AF had Zoom with Ryan", type: "meeting" },
    { contactId: fit.id, date: d(3,4), content: "AF sent proposal. Awaiting response.", type: "email" },
    { contactId: fit.id, date: d(3,19), content: "AF followed up. Shared Substack post on AI adoption challenges.", type: "email" },
    { contactId: fit.id, date: d(3,19), content: "Ryan replied: \"Good article!\" Still reviewing proposal. Positive tone, no objections.", type: "email" },
  ];
  await db.insert(interactions).values(fitInteractions);
  await db.insert(followups).values({ contactId: fit.id, dueDate: d(4,16), content: "Follow up on proposal decision", completed: false });

  // --- Ari Baranian — Pirros ---
  const [pirros] = await db.insert(contacts).values({
    firstName: "Ari", lastName: "Baranian",
    title: "CEO",
    email: "ari@pirros.com", phone: "818.939.5595",
    website: null,
    location: "LA (Cahuenga Blvd)",
    background: null,
    status: "ACTIVE", stage: "PROPOSAL",
    companyId: createdCompanies["Pirros"],
    sortOrder: 8,
    source: "Boris Silver (boris@fundersclub.com)",
  }).returning();

  const pirrosInteractions = [
    { contactId: pirros.id, date: d(1,14), content: "Boris intro'd AF + Ari", type: "note" },
    { contactId: pirros.id, date: d(1,15), content: "Intro call", type: "meeting" },
    { contactId: pirros.id, date: d(2,23), content: "Ari re-engaged, new use case", type: "note" },
    { contactId: pirros.id, date: d(2,27), content: "AF had conversation with Ari", type: "meeting" },
    { contactId: pirros.id, date: d(2,28), content: "AF sent proposal. Wants March in-person meeting.", type: "email" },
  ];
  await db.insert(interactions).values(pirrosInteractions);
  await db.insert(followups).values({ contactId: pirros.id, dueDate: d(4,1), content: "Soft touch, catch-up on latest AI developments", completed: false });

  // --- Ryan Chan — UpKeep ---
  const [upkeep] = await db.insert(contacts).values({
    firstName: "Ryan", lastName: "Chan",
    title: "CEO & Founder",
    email: null,
    website: "upkeep.com",
    location: null,
    background: "YPO connection. Incredible human and operator. Referred Jeff Manson, Jamey Edwards, Sieva Kozinsky.",
    status: "ACTIVE", stage: "LIVE",
    companyId: createdCompanies["UpKeep"],
    sortOrder: 9,
    source: "Direct",
    cadence: "Weekly (Wednesdays)",
  }).returning();

  const upkeepInteractions = [
    { contactId: upkeep.id, date: d(3,26), content: "Ongoing: Standing weekly meeting every Wednesday. Ryan is a current Tier 3 client and one of Alex's strongest relationships.", type: "note" },
  ];
  await db.insert(interactions).values(upkeepInteractions);

  // --- Krista Morgan — Edited Capital ---
  const [edited] = await db.insert(contacts).values({
    firstName: "Krista", lastName: "Morgan",
    title: "Managing Partner",
    email: "krista@editedcapital.com", phone: "720.326.6939",
    website: "editedcapital.com",
    location: null,
    background: "PE firm, Fund III ($150M). Husband: Masum, CEO of DeliveryBizPro (DBP)",
    status: "HOLD", stage: "HOLD",
    companyId: createdCompanies["Edited Capital"],
    sortOrder: 10,
    source: "Direct (existing relationship)",
  }).returning();

  const editedInteractions = [
    { contactId: edited.id, date: new Date(2025, 8, 24), content: "Krista pitched co-founding AI-native PE backbone", type: "meeting" },
    { contactId: edited.id, date: new Date(2025, 9, 8), content: "AF interested but at capacity", type: "note" },
    { contactId: edited.id, date: new Date(2025, 10, 7), content: "Krista pushing to close Fund III. Left door open for 2026.", type: "note" },
    { contactId: edited.id, date: d(3,5), content: "AF moved to HOLD", type: "note" },
  ];
  await db.insert(interactions).values(editedInteractions);

  // --- Lyndsey Arthurs — First American Title ---
  const [firstam] = await db.insert(contacts).values({
    firstName: "Lyndsey", lastName: "Arthurs",
    title: "Underwriter, National Commercial Services",
    email: null,
    website: "linkedin.com/in/lyndsey-arthurs-a967484",
    location: null,
    background: null,
    status: "HOLD", stage: "HOLD",
    companyId: createdCompanies["First American Title"],
    sortOrder: 11,
    source: "Direct",
  }).returning();

  const firstamInteractions = [
    { contactId: firstam.id, date: d(2,24), content: "AF added to CRM", type: "note" },
    { contactId: firstam.id, date: d(3,5), content: "AF moved to HOLD", type: "note" },
  ];
  await db.insert(interactions).values(firstamInteractions);
  await db.insert(followups).values({ contactId: firstam.id, dueDate: d(3,28), content: "Initial outreach", completed: false });

  // --- Seed default rules ---
  await db.insert(rules).values([
    {
      name: "Stale Contact Detection",
      description: "Flag ACTIVE contacts with no interaction for 14+ days, unless a future follow-up exists",
      condition: { type: "no_interaction_for_days", params: { days: 14 }, exceptions: [{ type: "has_future_followup" }] },
      action: { type: "create_violation", params: { severity: "warning", message_template: "No interaction for {{days_since_last}} days" } },
      enabled: true,
    },
    {
      name: "Past-Due Follow-Up",
      description: "Flag follow-ups that are past their due date",
      condition: { type: "followup_past_due", params: {} },
      action: { type: "create_violation", params: { severity: "warning", message_template: "Follow-up overdue: {{followup_content}}" } },
      enabled: true,
    },
    {
      name: "Post-Meeting Follow-Up",
      description: "Ensure a follow-up is created within 48 hours after a meeting",
      condition: { type: "no_followup_after_meeting", params: { hours: 48 } },
      action: { type: "create_violation", params: { severity: "info", message_template: "No follow-up scheduled after meeting on {{meeting_date}}" } },
      enabled: true,
    },
  ]);

  console.log("Seed complete! 11 contacts, 12 companies, 3 rules created.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
