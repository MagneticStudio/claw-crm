---
name: crm-migrate
description: One-time bulk import that turns existing client notes into a populated CRM — a pasted notes doc, an Apple Notes / Notion / Google Docs export, a spreadsheet of contacts, or a folder of per-client files. Use when the user wants to (1) set up their CRM from existing notes, (2) import or migrate contacts in bulk, (3) backfill history for clients they already work with. Trigger on "import my notes", "migrate my contacts", "set up my CRM from this", "here are my client notes", or any paste of multi-person historical notes into a fresh CRM. Do not invoke for logging new single events; use the `crm` skill for those.
---

# CRM Migration Agent

Nobody starts from zero. The user has months or years of client history in a notes app, and the value of the CRM depends on that history coming across faithfully. This skill turns a messy source into clean contacts, journals, interactions, and tasks — in one pass, with one confirmation gate.

## Non-negotiables

- **Never invent data.** Empty field beats guessed field. No fabricated emails, titles, dates, or companies.
- **One confirmation gate, then execute.** Present the full migration plan once, get a yes, run it end to end. Don't ask per-contact questions unless a record is genuinely undecidable.
- **The source is history, not gospel.** Log what the notes say happened; route opinions and reads to the journal; route open loops to tasks.
- **Dates must become absolute.** "Last Tuesday" in an undated note is unrecoverable — put the fact in the journal narrative without a fabricated date rather than guessing. If the source note itself is dated, resolve relative phrases against that date.
- **Verbatim material goes in blockquotes.** Emails, quotes, transcripts pasted in the source are preserved exactly, inside `>` blockquotes (this also bypasses the relative-date validator).

## Required inputs

- The CRM MCP connector (stop with one line if missing).
- The source material: pasted text, attached files, or a path the user names.
- The `crm` skill's mental model applies throughout — data-partition rule, five-layer model, pre-write checklist, layered confidentiality.

## Phase 1 — Read and map

1. Call `get_crm_guide` for the live contract and enums.
2. Call `get_dashboard` — if the CRM already has contacts, this is a merge, not a fresh import: check each source person against existing contacts before planning creates.
3. Read the ENTIRE source before writing anything. Build a person-by-person map:
   - **Identity**: name, company, title, email/phone/LinkedIn if present
   - **Stage guess** from the narrative (use the guide's enums): actively scoping → `PROPOSAL`/`NEGOTIATION`; paying client → `LIVE`; went quiet or "not now" → `HOLD` status or `PASS`; warm non-prospect → `RELATIONSHIP`; everyone else → `LEAD`/`MEETING`
   - **Dated events** → interaction candidates (past tense, one sentence each, thread/event-level not line-level)
   - **Narrative, reads, and history** → journal material (Key People, Wins, Engagement History for span summaries, dated Entries where the source gives real dates)
   - **Open loops** ("need to send", "waiting on", "follow up") → task candidates with due dates where stated
4. People mentioned only in passing (a colleague CC'd once) are NOT contacts — they belong in the primary contact's journal `## Key People`.

## Phase 2 — Propose

Present one compact plan for approval:

```
MIGRATION PLAN — 12 contacts from <source>
- Jane Doe (Acme, CEO) → LIVE. 6 interactions (2025-09 → 2026-04), journal w/ Engagement History, 1 task.
- John Roe (Bolt) → PASS. 2 interactions, short journal.
- …
SKIPPED: 3 names mentioned in passing (→ Key People on their primary contact).
UNRESOLVED: "Mike" appears in two clients' notes — same person? (only blocking question)
```

Wait for confirmation. Apply requested corrections to the plan, not mid-write.

## Phase 3 — Execute

Per contact, in this order:

1. `create_contact` — identity fields plus `background` (one-line who-they-are), `source` (how they entered the orbit, if the notes say).
2. `add_interaction` for each dated atomic event — past tense, one sentence, correct `type` (`meeting`/`call`/`email`/`note`). Thread-level granularity.
3. Journal via `batch_append_journal` for dated Entries (chronological, absolute dates), and `edit_journal` to populate `## Key People`, `## Wins / Case Study Material`, and `## Engagement History` (the home for "Q3 2025: phase 1 delivered…" span summaries — do NOT fake a date to force these into Entries).
4. `create_task` for open loops with real due dates. An open loop with no inferable date gets listed in the final report instead of a guessed deadline.
5. Verify each write before moving on. On validation failure (relative date, duplicate section), fix and retry once; if still failing, note it in the report and continue.

Confidentiality (layered, same as the `crm` skill): pricing and deal terms from the source go in the journal only — never into interactions, tasks, or contact fields. Cross-client specifics never cross records. Credentials never migrate at all.

## Phase 4 — Report

End with one summary: contacts created (by stage), interactions/journal entries/tasks written, anything skipped or unresolved, any write that failed validation. Then suggest the natural next step: connect the inbox/calendar sync agent (`crm-management`) so the CRM stays current from here.
