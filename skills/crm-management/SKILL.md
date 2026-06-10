---
name: crm-management
description: Reconcile the user's personal CRM with their inbox and calendar so every material email and meeting is reflected as an interaction, task, meeting, journal entry, stage change, or briefing. Use when the user wants to (1) run the scheduled CRM sync agent, (2) catch up the CRM after a busy day, (3) prep tomorrow's calendared contacts with briefings. Trigger on "run my CRM agent", "sync my CRM", "catch up my CRM", "process inbox into CRM", or any scheduled invocation. Do not invoke for ad-hoc single-thread logging; use the `crm` skill directly for that.
---

# CRM Management Agent

Scheduled sync that keeps the CRM aligned with inbox and calendar. The CRM is the source of truth for relationships and deals — it only stays true if every material event is reflected.

## Non-negotiables

- **Default to NOT logging.** Over-logging drowns signal. Skip when in doubt. Re-runs catch missed signal cheaply; pruning noise is expensive.
- **No hallucinated contacts.** Never create one. Flag candidates in the summary.
- **Verify every write.** Not "processed" until the CRM confirms.
- **Dedup before writing.** Check existing interactions, tasks, meetings, same-day journal before any write.
- **In-chat summary is the review surface.** Runs unattended; the summary is where the user reviews.

## Required inputs

Verify before running. If any missing, stop with a one-line message.

- `crm` sibling skill (data model + writing contract)
- CRM MCP connector
- Email connector (Gmail or Outlook), inbox + sent for last 1–2 days
- Calendar connector, today + tomorrow

## Setup

1. Invoke `crm` skill.
2. Call `get_crm_guide` for live rules + state.
3. Pull dashboard (recent activity, upcoming meetings, violations).
4. Search inbox (received + sent) for threads touched in last 1–2 days — catches overnight replies without re-walking processed days.
5. Pull calendar today + tomorrow. Cross-reference attendees to CRM contacts by email — 48h forward matches the briefing horizon.

## Read email

Read every relevant thread in full, chronologically. Don't skim newest-only. Don't filter by sender.

- Include sent mail — the user's own replies are often the most important events.
- Include forwarded threads — forwarding signals intent for the CRM to catch up.
- Include CC/BCC — new stakeholders often surface there first.

## Read calendar

Match attendees to CRM contacts by email.

- Apply the strategic-vs-operational filter (next section). Only strategic events enter the Meetings layer.
- Flag events with no contact match. Don't auto-create.
- Use calendar to corroborate or correct email signals (a scheduling thread resolved by a placed event).

## Strategic vs operational meetings

The Meetings layer is curated. Calendar holds every event; CRM holds only relationship-moving moments. Operational meetings never enter the CRM — they drown signal, pollute briefing-candidate logic, and force repetitive cleanup.

**Log as a Meeting (strategic):**
- First meeting with a new contact or new stakeholder on an existing contact
- First conversation on a new engagement, lane, or scope
- First external proof point (demo, pitch, working session for an audience outside the day-to-day team)
- Stage-shifting conversations (proposal walkthrough, renegotiation, signing, escalation)
- One-off high-stakes events (board meetings, investor updates, incident reviews)
- Anything the user explicitly wants briefed

**Never log (operational — leave on calendar):**
- Recurring 1:1 cadences (weekly client 1:1, monthly check-in)
- Daily or weekly team standups and syncs
- Ad-hoc internal alignment calls with a LIVE-stage client
- Internal training, tactical working sessions with recurring collaborators
- "Catch-up" / "check-in" meetings with no new agenda
- Cadence meetings inherited from a recurring calendar series

**Test:** "Will I prepare differently than last time, AND will what happens move the relationship?" Both yes → strategic. Either no → skip.

**Edge cases:**
- Material moment inside a recurring 1:1 → log the moment as interaction; the 1:1 stays off the Meetings layer.
- First instance of what will become a cadence IS strategic. Subsequent instances are not.
- External-audience demo is strategic even if "just a demo" internally.
- New-lane discovery is strategic. A working session two weeks in is not, unless it stage-shifts.

**Cleanup:** Operational meetings found in the layer from prior runs → DELETE on sight. Don't verify whether they happened; they don't belong regardless. Surface count in summary (`CLEANUP: deleted N stale operational meetings on <contact>`).

## What to log

Anything that moves the relationship or deal:

- New prospect replies, proposal responses, acknowledgments
- Scheduling confirmed/changed/cancelled
- Stage changes
- Signals of interest, hesitation, delay
- New stakeholders entering a deal
- Forwarded client emails from the user
- Confirmed strategic calendar meetings with CRM contacts in next 48h

## What NOT to log (LIVE clients)

LIVE clients generate high-volume operational traffic. The test is not "did something happen" but "will this matter in six months."

**Skip:**
- Routine cadence attendance
- Calendar logistics (time changes, declines, Calendly bookings for queued meetings, OOO unless itself the signal, reschedules)
- One-line "thanks" / "got it"
- Cadence invoice receipts and payment confirmations (first payment after a billing change IS signal)
- Internal tooling / infra chatter (permissions changes, tooling renames, ticket opens, platform status, account upgrades, license provisioning) — unless the action itself is a strategic move
- Cross-team coordination that doesn't shift strategy
- Same-thread email volume: one interaction per thread, not per message
- Forward action items not yet done: those are tasks, not interactions
- Operational meetings (see prior section)

**Log:**
- Scope/pricing/compensation changes
- New stakeholders entering the orbit (CoS hire, new VP, board changes)
- Friction moments, stalls, escalations
- Wins worth quoting (testimonials, survey results, internal endorsements)
- Strategic shifts (new initiative, sunset, pivot)
- First payment after a billing change

## Dedup

Before every write, check the same fact isn't already on the contact for the same date. Skip silently if so.

- **Interactions:** thread-level match. One interaction per thread per event.
- **Never write `type: note` paraphrasing an `email`/`call`/`meeting` already on the same event.** One type per event.
- **Tasks/meetings:** same contact + same date + substantively same content. Near-match with different date → update, don't create.
- **Journal:** call `peek_last_journal_entry` first. Same-date entry exists → prefer `edit_journal` (H4 subhead) over sibling entry. Siblings are for orthogonal topics.
- **Meetings on contact:** never duplicate from calendar.

## Tool discipline

- **Interactions.** Past-tense facts, one sentence.
- **Pre-write tense check.** Scan content for forward verbs (should, will, needs to, send, review, follow up, draft, prepare, schedule, check). If present → it's a task. Route to `create_task`.
- **Tasks.** Prep or nudges with due dates. Check existing first.
- **Meetings.** Strategic only. Default to NOT creating; calendar already captures the event. Delete operational ones from prior runs.
- **Journal.** Interpretation and strategic reads. One entry per contact per day. Reference atoms by date; don't re-narrate.
- **Stage.** Update when reality moved.
- **Follow-ups.** Complete/delete stale. Operational meetings: delete on sight, no verification. Surface count in summary.

Date belongs to the atom. Meaning belongs to the journal. Don't write the same sentence twice.

## Contacts

Do not create. Flag candidates with one line of context.

## Briefings

Build a briefing when **all** hold:

- Contact has a pending **strategic** meeting in next 24h. Operational meetings never warrant briefings — and shouldn't be in the layer anyway.
- Either no briefing exists, OR existing is stale (>7 days), OR existing was scoped to a different meeting than the next pending one.

The third condition is missed most often. If `previousBriefing.meetingId` differs from current next pending → refresh.

Source from email history, CRM interactions, calendar, light public research. Cover: who, role, history, why now, likely goals, open questions, talking points, risks. Save and verify.

Do not pre-build briefings without a pending meeting in 24h.

## End-of-run scans

Before composing the summary:

1. **Stage-change scan.** Journal recommends a stage move? → `DECIDE: <contact> — journal recommends <NEW_STAGE>? Confirm.` Don't apply.
2. **Conditional follow-up scan.** Journal says `"if silent by <date>"`, `"check back on <date>"`? → Create the task if date is unambiguous; else `TASK SUGGESTED:`.
3. **Backdating sanity check.** Journal entry covers >7 days? → belongs in `## Engagement History`, not Entries.
4. **Volume scan.** >3 interactions on one contact this run → review as a set. Collapse same-event pairs. Delete any failing the six-month test. Last line of defense against over-logging.

## Verify

Every write confirmed. If failed/uncertain, surface in summary.

## Report inline

End every run with one summary — the user's review queue. Concrete action items and issues only. Not a full activity log.

Include:

- Anything needing user decision/action
- Anyone who might warrant a new contact, with one line of context
- Any LIVE deal at risk of slipping
- Any failed/uncertain CRM write
- Any material unmatched calendar attendee
- Anything from end-of-run scans
- Count of operational meetings deleted

Format each item action-first:

- `DECIDE: Proposal accepted by Acme. Move to NEGOTIATION? Follow-up drafted.`
- `REVIEW: Jordan confirmed May 5, 9-11 AM. Meeting logged, briefing built.`
- `FLAG: New stakeholder priya@acme.com cc'd on Acme thread, no contact exists.`
- `AT RISK: Deal's pushed timing two weeks again. LIVE deal slipping.`
- `STAGE: Acme — journal recommends NEGOTIATION? Confirm.`
- `CLEANUP: Deleted 4 stale operational meetings on Acme.`

Lead with: `Processed N threads, M calendar events, K writes to CRM.` If nothing needs attention, follow with `All clear.`

## Tests

1. **Happy path.** 3 threads (2 logged, 1 new proposal reply). 1 calendar event tomorrow with a known LEAD. Expected: 1 interaction, 1 stage move flagged, 1 meeting + 1 briefing.
2. **Dedup re-run.** Twice in an hour, no new data. Expected: zero new writes on second run.
3. **Same-day journal dedup.** Same-day entry exists. Expected: `edit_journal` extends, not sibling.
4. **Unknown attendee.** Calendar attendee with no matching contact. Expected: not created; flagged.
5. **LIVE noise filter.** Thread is "rescheduling Tuesday to Wednesday." Expected: skipped.
6. **Briefing refresh on changed meeting.** 6-day briefing scoped to group call; next meeting is 1:1 lunch. Expected: refreshed for 1:1.
7. **Connector down.** Calendar unavailable. Expected: stop, one-line message, no partial writes.
8. **Thread-level dedup.** 4 messages on one thread over 2 days. Expected: one interaction.
9. **Note-paraphrasing-email guard.** Agent writes `email`, then tries `note` for same thread. Expected: second rejected as dup.
10. **Tense-check guard.** Inbox: "I should follow up with the prospect next week." Expected: routed to `create_task` with date.
11. **Volume-scan trigger.** 5 interactions on one contact. Expected: scan fires, collapse before completing.
12. **Strategic-vs-operational filter at write time.** Calendar has (a) weekly 1:1 with LIVE client, (b) first discovery on new lane. Expected: (b) logged + briefed; (a) skipped, no row created.
13. **Operational meeting cleanup.** Prior run logged weekly cadence as Meeting; now overdue. Expected: deleted this run, count surfaced. NOT flagged for review.
14. **Recurring series, first instance.** First-ever 1:1 with new collaborator. Expected: logged. Second instance: skipped.
15. **Operational meeting with material moment.** Weekly 1:1 where client announces scope shift. Expected: scope shift as interaction; 1:1 NOT logged.
