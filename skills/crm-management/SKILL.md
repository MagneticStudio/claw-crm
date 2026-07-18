---
name: crm-management
description: Reconcile an operator's personal CRM with email, calendar, and meeting notes or transcripts so material relationship activity is reflected as an interaction, task, meeting, journal entry, stage change, or briefing. Use for scheduled CRM syncs, catching up after a busy day, processing inbox activity into the CRM, or preparing briefings for upcoming strategic meetings. Do not use for a single named email thread or meeting; handle that focused event directly through the CRM connector.
---

# CRM Management Agent

Run a scheduled or on-demand sync that keeps the CRM aligned with the operator's communication systems. The CRM is the source of truth for relationships and opportunities only when material events are captured without burying the signal in routine activity.

This workflow is client-agnostic. It works with Codex, Claude, or another MCP-capable agent and with any compatible email, calendar, and meeting-notes connectors.

## Non-negotiables

- **Default to not logging structured atoms.** Over-logging interactions, tasks, and meetings drowns signal. Skip them when in doubt. The journal is the exception: preserve advice, impact, and forward plans richly when they will matter later.
- **Never hallucinate contacts.** Do not create a contact during a sync. Flag candidates for the operator.
- **Verify every write.** An item is not processed until the CRM confirms the write.
- **Deduplicate before writing.** Check existing interactions, tasks, meetings, and the same-day journal before every write.
- **Treat the final summary as the review surface.** Scheduled runs may be unattended; the summary is where the operator reviews decisions and exceptions.
- **Do not claim coverage you did not have.** If a configured source is unavailable, stop before writing and report the missing source. Never describe a partial run as a full sync.

## Required inputs

- The CRM MCP connector.
- An email connector with inbox and sent-mail access.
- A calendar connector with access to today and tomorrow.
- If the operator relies on meeting notes or transcripts, a connector for that system (for example, Granola or an equivalent source).

Email and calendar are the minimum for a full daily sync. Transcript coverage is optional only when the operator has explicitly chosen not to use it.

## Setup

1. Call `get_crm_guide` for the authoritative data model, writing contract, live rules, enums, and state.
2. Pull the CRM dashboard: recent activity, upcoming meetings, overdue tasks, and active violations.
3. Search received and sent email for threads touched in the last 1-2 days. The overlap catches overnight replies and makes reruns safe.
4. Pull calendar events for today and tomorrow. Match external attendees to CRM contacts by email.
5. When transcript coverage is enabled, pull meetings from the last 1-2 days, including the transcript and any generated summary. Match counterparties using the calendar attendee list, email address, and organization.

## Read email

Read each relevant thread in full and in chronological order.

- Include sent mail; the operator's reply may be the material event.
- Include forwarded threads; forwarding often signals intent or a new stakeholder.
- Include CC and BCC context where the connector exposes it.
- Summarize one real-world thread or event once, not once per message.

## Read calendar

- Match attendees to contacts by email. Flag unmatched external attendees; never auto-create them.
- Apply the strategic-versus-operational filter below before adding anything to the CRM Meetings layer.
- Use the calendar to corroborate email. A scheduling thread resolved by a calendar event is one event, not two interactions.

## Read meeting notes and transcripts

Treat a completed conversation as a first-class source, not as secondary evidence to email.

- Read the transcript and summary for relationship movement, decisions, objections, advice, impact, plans, and commitments—not for a play-by-play recap.
- Match counterparties to existing contacts. Use calendar attendees and email domains to corroborate identity. Flag unmatched counterparties.
- Apply the same strategic-versus-operational meeting filter used for the calendar.
- Route each piece of information to one destination: a discrete fact or dated commitment becomes a structured atom; advice, impact, and forward-looking context belong in the journal; pure logistics is dropped.
- A recurring meeting may remain outside the Meetings layer while a material moment inside it becomes an interaction or journal entry.
- Deduplicate across sources. A call found in a transcript, calendar event, and follow-up email is one real-world event.

## Strategic versus operational meetings

The Meetings layer is curated. The calendar holds every event; the CRM holds only relationship-moving moments.

**Log as a Meeting:**

- First meeting with a new contact or a new stakeholder on an existing relationship.
- First conversation about a new engagement, lane, or scope.
- First external proof point such as a demo, pitch, or working session for a new audience.
- A stage-shifting conversation: proposal review, renegotiation, signing, escalation, or renewal.
- A one-off high-stakes event such as a board meeting, investor update, or incident review.
- Anything the operator explicitly wants briefed.

**Do not log as a Meeting:**

- Recurring one-to-one meetings or routine client cadences.
- Daily or weekly team standups and status syncs.
- Internal alignment calls on an active engagement.
- Tactical training or working sessions with recurring collaborators.
- Catch-ups with no new agenda.
- Later instances of a recurring calendar series.

Test: **Will the operator prepare differently than last time, and can this conversation move the relationship?** Both must be yes.

Edge cases:

- A material moment inside a recurring meeting becomes an interaction or journal entry; the recurring meeting stays out of the Meetings layer.
- The first instance of what will become a cadence can be strategic. Later instances are not.
- A session for a new external audience can be strategic even if the internal team calls it a routine demo.
- New-scope discovery is strategic. Routine delivery work is not unless it changes the relationship or stage.

Delete stale operational meetings previously added to the Meetings layer and report the count. This is taxonomy cleanup, not deletion of the calendar event.

## Three destinations

Every distinct piece of information goes to exactly one primary destination. One real-world event may yield a factual atom and separate journal meaning, but the same sentence must never appear in both.

### Structured atom

Use an interaction, task, meeting, or stage change for discrete facts, dated commitments, and relationship-moving events:

- A proposal response, decision, objection, or material acknowledgment.
- A new stakeholder entering the relationship.
- A completed material call or email exchange.
- A committed next action with a real due date.
- Scope, commercial, timeline, or stage movement.
- A strategic meeting worth preparing for.

### Journal

The journal is the durable advisory and relationship narrative. Capture:

- Advice or recommendations the operator gave and the context around them.
- Actions the operator took and their effect on the other organization.
- Decisions the operator influenced and what was at stake.
- The counterparty's forward plans, timing, constraints, and the operator's expected role.
- Evidence that could later support a case study, value retrospective, renewal, proposal, or expanded scope.

Favor density over brevity. Every sentence should earn its place, but do not remove substantive context merely to keep the journal short.

### Drop

Drop pure logistics and low-value noise:

- Routine reschedules, declines, booking confirmations, and out-of-office messages.
- One-line acknowledgments such as "thanks" or "got it."
- Routine invoice receipts or payment confirmations, unless they signal a commercial change.
- Permissions, account setup, ticket status, platform chatter, and license provisioning unless the action is strategically meaningful.
- Same-thread message volume after the real event is already represented.
- Future actions that are not yet complete; route real commitments to tasks instead.

For active clients, use the six-month test: **Will the operator want this later for a case study, value retrospective, renewal, proposal, or important message?** If not, drop it.

## Deduplication

Before every write, check whether the same fact already exists for the same contact and date.

- **Interactions:** one per thread or real-world event. Never add a `note` that paraphrases an `email`, `call`, or `meeting` for the same event.
- **Tasks and meetings:** same contact, date, and substantive content is a duplicate. A near-match on another date should be updated, not recreated.
- **Journal:** call `peek_last_journal_entry` first. Extend a same-day entry with `edit_journal` and a distinct H4 subheading instead of creating overlapping sibling entries.
- **Calendar:** never duplicate an existing contact meeting.
- **Cross-source:** transcript, calendar, and email evidence about the same event produce one interaction.

## Writing discipline

- **Interactions:** one factual, past-tense sentence.
- **Pre-write tense check:** content containing `should`, `will`, `needs to`, `send`, `review`, `follow up`, `draft`, `prepare`, `schedule`, or `check` is probably a task, not an interaction.
- **Tasks:** verb-first, short, and attached to a real due date.
- **Meetings:** strategic only. Default to not creating one because the calendar already contains the event.
- **Journal:** interpretation, advice, impact, forward plans, and strategic meaning. One entry per contact per day by default.
- **Stage:** update only when reality moved. If the CRM journal merely recommends a stage move, surface it for a decision instead of applying it automatically.
- **Follow-ups:** complete or delete stale items. When completing one, log the outcome as an interaction.

The date belongs to the atom. The meaning belongs to the journal. Do not write the same sentence twice.

## Contacts

Do not create contacts during a sync. Flag candidates with one line of context and the source that surfaced them.

## Briefings

Build or refresh a briefing only when all of these are true:

- The contact has a pending strategic meeting in the next 24 hours.
- No briefing exists, the existing briefing is older than seven days, or it was written for a different meeting.

If `previousBriefing.meetingId` differs from the current next meeting, refresh it even when it is less than seven days old.

Use email history, CRM interactions, calendar context, the journal, and light public research. Cover who they are, why the meeting matters now, history, likely goals, open questions, talking points, offers or asks, and risks. Save the briefing with the current meeting ID and verify the write.

Do not create a briefing without a strategic meeting in the next 24 hours.

## End-of-run scans

Before reporting:

1. **Stage scan:** if the journal recommends a move, report `DECIDE: <contact> — move to <stage>?` Do not apply it silently.
2. **Conditional follow-up scan:** when the journal says "if silent by <date>" or "check back on <date>," create the task only when the date is unambiguous; otherwise report `TASK SUGGESTED:`.
3. **Backdating scan:** narrative covering more than seven days belongs in `## Engagement History`, not a dated Entry.
4. **Volume scan:** if the run creates more than three interactions for one contact, review them as a set, collapse same-event pairs, and remove anything that fails the six-month test.

## Verify and report

Confirm every write. Surface any failure or uncertainty instead of silently continuing.

End with one concise review queue, not a full activity log. Start with:

`Processed N threads, M calendar events, T transcripts, K CRM writes.`

Then include only items needing attention:

- `DECIDE: <contact> accepted the proposal. Move to NEGOTIATION?`
- `REVIEW: <contact> confirmed the strategic meeting. Meeting logged and briefing refreshed.`
- `FLAG: <email> appeared as a new stakeholder; no contact exists.`
- `AT RISK: <contact> moved timing again; the active opportunity may slip.`
- `TASK SUGGESTED: <contact> should be checked on <date>.`
- `CLEANUP: Deleted N stale operational meetings for <contact>.`

If nothing needs attention, follow the first line with `All clear.`

## Tests

Behavior and regression tests live in `references/tests.md`. They are for maintainers and should not be loaded during a normal sync.
