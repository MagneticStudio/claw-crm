---
name: crm
description: Personal CRM for relationship management. Invoke when the user mentions contacts, pipeline, prospects, clients, leads, follow-ups, meeting prep, interactions, relationship journals, briefings, or case-study material — or when they describe a new person, event, or action that could map to a CRM entity ("I met Sarah today", "follow up with Jeff Friday", "update my notes on Acme", "prep for tomorrow's call"). Assumes the CRM MCP connector is already registered in the client.
---

# Personal CRM

You have access to a personal CRM exposed as an MCP connector. This skill tells you **when to use it** and the **mental model**. The connector itself exposes a `get_crm_guide` tool that returns the live, authoritative contract — call it first thing in any CRM-touching session, before writing anything.

## First move

```
get_crm_guide()
```

It returns the current rule set, valid enums, stage definitions, writing contract, and a live snapshot (contact counts, overdue tasks, upcoming meetings, active rule violations). Everything below is orientation; the guide is the source of truth.

## The data-partition rule — read before every write

Every piece of information has exactly ONE home. **The DATE belongs to the atom. The MEANING belongs to the journal.** If you're about to write the same sentence in two places, one of them is wrong.

## Pre-write checklist

Before calling any CRM write tool, force a single-layer answer to each question. This is the failure mode that produces noise; treat the checklist as mandatory, not advisory.

1. **Which layer does this belong to?** Exactly one of: contact field, interaction, task, meeting, briefing, journal. If you can name two, you are wrong. The atom holds the date; the journal holds the meaning. Same event in two layers is a duplicate.
2. **Will this matter in six months?** If not, do not write it. Calendar churn, OOO notices, infra and tooling chatter, routine acknowledgments, and Calendly booking confirmations all fail this test. Skip them.
3. **Is the verb in past tense?** If the content uses "should", "will", "send", "follow up", "review", "draft", or "prepare", it is a task, not an interaction. Route accordingly. Interactions describe events that already happened.
4. **Is there already an entry for this event on this contact?** Check before every write. Re-narration in a different `type` field counts as a duplicate. A `type: note` that paraphrases a `type: email` you just wrote is forbidden.
5. **Is this thread-level or message-level?** A single thread with multiple replies is one interaction summarizing the exchange, not one per message.

If any answer is wrong or ambiguous, do not write.

## Five-layer mental model

| Layer | What it is | Shape |
|---|---|---|
| **Contact fields** | Canonical facts about the person (title, email, location, company) | One-liners, edit in place |
| **Interactions** | Past-tense atomic events — a call happened, an email went out | One sentence per row, dated |
| **Tasks / Meetings** | Forward-looking action items with due dates | Short, verb-first, ≤10 words |
| **Briefings** | Ephemeral prep for the **next specific** conversation | Bullets, upsert, overwritten each prep |
| **Relationship journal** | Everlasting narrative per contact — interpretation, strategic reads, "what it means" | Long-form markdown; sections: Key People, Wins / Case Study Material, Entries |

Interactions and tasks stay SHORT. The journal is where detail and meaning live. The journal is NOT a log of events — it's the interpretive layer on top of them.

**Worked example — a single call with a client on a given date:**

- Interaction: `<date>: 30min call with X. Discussed Q2 scope.` ← the fact, one sentence
- Task: `Send investment memo to X` due `<future-date>` ← the next action, verb-first
- Journal entry: dated narrative explaining *why* the call mattered, what was read between the lines, what to adjust in the next prep

None of those three duplicate each other.

**Interaction shape, hard rule:** one sentence, past tense, factual. If your interaction is longer than two sentences or contains a strategic read, the interpretation belongs in the journal. Cut the interaction down to one factual sentence and write the interpretation as a journal entry referencing the date.

## Journal anatomy

Canonical sections, in order:

1. `## Key People` — stakeholder roster with roles and current relationship state. Edited in place. Populate as soon as a contact reaches MEETING. An empty roster on a MEETING+ contact is a smell worth fixing in the next pass.
2. `## Wins / Case Study Material` — durable outcomes worth quoting later, edited in place.
3. `## Engagement History` — retrospective phase summaries, scope evolution, role changes, compensation history. Edit in place. Use for content written *about* a multi-week or multi-month span rather than content tied to a single date. Dating retrospectives to event-start distorts the Entries timeline; this section is the right home.
4. `## Entries` — dated narrative, append-mostly. Event-driven interpretation only. One entry per contact per day by default; use H4 subheadings for facets if multiple topics land the same day. Reserve sibling entries for genuinely orthogonal topics.

Optional sections, only when real recurring signal does not fit the four canonicals: `## Open Questions`, `## Risks`, `## Next Moves`. Default answer is still Entries. Forward action items belong in tasks, not in journal prose.

## Tasks and Meetings — the strategic-only rule

The Meetings layer is **curated**, not comprehensive. Your calendar already holds every event you attend. The CRM Meetings layer is reserved for events that shift the relationship trajectory — moments worth preparing differently for.

**Log as a Meeting (strategic):**
- First meeting with a new contact, or first meeting with a new stakeholder on an existing contact
- First conversation on a new engagement, lane, or scope
- First external proof point (demo, pitch, working session for an audience outside the day-to-day team)
- Stage-shifting conversations (proposal walkthrough, renegotiation, signing, escalation)
- One-off high-stakes events (board meetings, investor updates, incident reviews)
- Anything you want a briefing prepared for ahead of time

**Never log as a Meeting (operational — leave on the calendar):**
- Recurring 1:1 cadences (weekly client 1:1, monthly check-in)
- Daily or weekly team standups and syncs
- Ad-hoc internal alignment calls with an active client
- Internal training and working sessions with recurring collaborators
- "Catch-up" / "check-in" meetings with no new agenda
- Cadence meetings inherited from a recurring calendar series

**The test:** "Will I prepare for this differently than the last time, AND will what happens here move the relationship?" Both yes → log it. Either no → skip the Meetings layer.

**Edge cases:**
- A recurring 1:1 where something material happens — log the EVENT as an interaction. The 1:1 itself stays off the Meetings layer.
- The first instance of what will become a cadence IS strategic. Subsequent instances are not.
- An external-audience demo is strategic even if it's "just a demo" internally — the audience makes it strategic.
- A discovery call on a brand-new lane is strategic. A working session two weeks in is not, unless it stage-shifts.

**Cleanup:** Operational meetings found in the Meetings layer from prior agent runs should be deleted on sight. The calendar carries the historical record; the Meetings layer doesn't need to.

**Why this matters:** Briefings are scoped to the next Meeting on a contact. If the layer is polluted with operational cadences, the briefing-candidate selector picks the wrong meeting and the agent preps for the wrong conversation. Keeping the layer curated preserves the signal value of every entry.

## When to invoke this skill

- User mentions any person by name in a relationship context ("Alex said", "met with Jordan", "check in with Priya")
- User describes a future action tied to a person ("follow up", "send", "schedule", "remind me about")
- User asks about pipeline state, overdue items, upcoming meetings, prospect status
- User asks to prep for a meeting or review notes on a client
- User pastes historical notes, a transcript, or context they want preserved for someone

## Writing rules (practical patterns)

The server enforces strict validation — absolute dates only, no relative phrases, dated entry headings, destructive-edit gates. Full contract in `get_crm_guide`. Call it once per session and operate from its output. Beyond the server contract, observe the following patterns to avoid the most common journal-hygiene issues:

- **Do NOT prefix the title with the entry date.** The server prepends `### YYYY-MM-DD:` automatically. A title like `2026-05-10: Jordan split TPM` renders as `### 2026-05-10: 2026-05-10: Jordan split TPM`. Lead the title with a verb or noun, not a date.
- **One entry per contact per day.** If two topics warrant capture on the same day, write one entry with H4 subheadings (`#### Topic A`, `#### Topic B`). Only create sibling entries for genuinely orthogonal subjects.
- **Do not re-narrate the atom.** If an interaction already captures the fact, the journal entry references it by date and goes straight to the interpretation. "On 2026-05-10 the JD reply landed; the strategic read is..." not "They replied 2026-05-10 with minor changes; proposed using Friday for three things; the strategic read is..."
- **Verbatim quotes go in markdown blockquotes** (lines starting with `>`). Blockquotes bypass the relative-date check; surrounding prose still has to use absolute dates. Use this when preserving someone else's exact words, especially if they used relative phrasing.
- **Retrospective summaries belong in Engagement History.** A "Phase 1 / Q1 2025" entry written in April 2026 distorts the Entries timeline if dated to phase-start. Put it in Engagement History and reference the span ("Q1 2025") in the heading.
- **Conditional rules belong in tasks, not prose.** "If silent by 2026-05-15, move to HOLD" is a task with a due date, not a journal sentence. Encode the action; let the journal hold the rationale.
- **Never write a `type: note` interaction that paraphrases an `email`, `call`, or `meeting` interaction on the same event.** Pick one type and one entry per event. A "summary note" describing what just got logged as an email is a duplicate.
- **Operational chatter is not relationship signal.** Infra logistics, tooling renames, permissions changes, calendar reschedules, OOO notices, Calendly bookings, ticket opens belong in the operational system, not the CRM. If you cannot complete the sentence "this will matter to the relationship six months from now because...", do not log it.

## If the connector isn't reachable

If the CRM tools don't appear in your tool list, or calls return "tool not found," tell the user in one line:

> The CRM connector isn't registered in this Claude. Add it under Settings → Connectors using the MCP URL from your CRM deployment, then retry.

Do not attempt to install or configure the connector yourself.

## Confidentiality

This is a notebook, not a deal tracker. The rules differ by layer.

- **Pricing, dollar amounts, deal terms, fees, commission rates:** allowed in the journal only (Entries, Engagement History, Wins, Key People). The journal is the interpretive layer — compensation history, scope-and-cash reset narratives, and revenue-pattern reads belong there. **Forbidden** in tasks, interactions, briefings, contact fields (background, source, additionalContacts), and any other operational or atomic layer. Those surfaces show up in dashboards, exports, and meeting prep, and pricing leakage there is harder to contain. When a task or interaction needs to reference a payment or invoice, use date and scope only (`Acme paid invoice INV-2035 on 2026-05-11`), not the figure.
- **Cross-client specifics:** never. Client A specifics do not appear on Client B's record; prospect specifics do not appear on another prospect's record. Generic patterns are fine; named-client details are not. This applies to all layers including the journal.
- **Credentials, account numbers, secrets:** never, anywhere.
