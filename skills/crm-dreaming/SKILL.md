---
name: crm-dreaming
description: Periodic, proposal-first cleanup of a Claw CRM that consolidates journal sprawl, removes cross-layer duplication, fixes structural drift, and surfaces stale records without losing relationship signal. Use when the user asks to run CRM dreaming, clean up the CRM, consolidate journals, audit CRM hygiene, or perform a scheduled maintenance pass. Do not use for daily inbox/calendar reconciliation, one-off event capture, bulk migration, or pipeline-stage decisions.
---

# CRM Dreaming

Perform a small, safe maintenance pass over an existing Claw CRM. Reduce noise and structural drift while preserving every substantive fact, interpretation, and relationship insight.

## Non-negotiables

- Treat `get_crm_guide` as authoritative for the current data model, validation rules, confidentiality boundaries, and available enums.
- Preserve signal absolutely. Never remove strategic reads, stakeholder context, decisions, outcomes, or useful history merely to make a record shorter.
- Separate proposal from execution. Make no mutation until the user explicitly approves that contact's complete proposal.
- Never invent dates, task outcomes, interaction history, or missing context.
- Keep one contact per proposal so approval and rollback boundaries stay clear.
- Verify every write from the connector response and by rereading the affected surface.
- Report incomplete source coverage. Never describe a partial scan as a complete CRM audit.

## Requirements

Require the Claw CRM MCP connector and its `get_crm_guide` tool. If either is unavailable, stop with:

> The Claw CRM connector is not available. Register the deployment's MCP URL, then retry.

Do not install or configure the connector, and never place its tokenized URL in skill text or output.

## Start the pass

1. Call `get_crm_guide`.
2. Call `get_dashboard` and note record counts, active violations, overdue tasks, upcoming meetings, and recent activity.
3. Call `list_stale_briefings` when available.
4. Select a batch of three to five contacts:
   - Use contacts named by the user first.
   - Otherwise prioritize contacts implicated by violations, stale briefings, overdue work, recent activity, or large journals.
   - If the connector exposes complete contact enumeration, rotate toward the least recently reviewed active records.
   - Deprioritize dormant or closed records unless they have an active violation or the user names them.
5. State the batch and whether selection covered the whole CRM or only the records discoverable through current tools.

Do not write synthetic interactions such as “dreaming pass applied” to track rotation. If the connector lacks dedicated maintenance metadata, prefer risk-based selection and disclose that durable rotation is unavailable.

## Read one contact

Before proposing changes, gather the current record:

- Contact fields and identity
- Full relationship journal via `read_journal`, including its hash
- Interactions via `list_interactions`, paginating as needed
- Active and recently completed tasks and meetings via `list_followups`, paginating as needed
- Briefing and its staleness state

For very large records, read journal sections and paginated atoms in focused windows, then expand around every suspected duplicate. Do not infer a duplicate from truncated content.

## Scan for cleanup candidates

Every finding is a proposal, not an automatic edit.

### Journal structure

- Strip a redundant date from an entry title when the entry heading already supplies that date.
- Consolidate same-date entries with overlapping subjects under one dated heading and distinct H4 subheadings.
- Consolidate duplicate canonical section headings without dropping content.
- Move multi-week or multi-month retrospectives from dated Entries to `## Engagement History`.
- Populate an empty canonical section only from evidence already present elsewhere in the same contact record.
- Leave unconventional but meaningful structure alone unless it violates the live guide or clearly obscures information.

### Cross-layer duplication

- Shorten a journal passage that merely repeats an interaction so the interaction holds the event and the journal holds only interpretation.
- Remove paraphrase duplicates among interactions representing the same real-world event.
- Extract a genuine future commitment from journal prose into a task with an explicit date, leaving only its rationale in the journal.
- Never erase the only copy of information. Apply an additive move before deleting the source copy.

### Misplaced or stale information

- Move stakeholder context, durable wins, open questions, risks, and next moves into the guide's corresponding journal sections when repeated placement is causing drift.
- Flag stale briefings. Propose refresh through the appropriate briefing or management workflow when a future strategic meeting exists; otherwise propose deletion.
- Flag long-overdue tasks for a user decision. Complete a task only when the record proves the outcome; never guess.
- Flag completed meetings that lack a corresponding interaction only when another source proves the meeting occurred.
- Flag probable duplicate contacts for manual review unless the connector exposes a safe, documented merge workflow.

### Live policy violations

Apply only the policies returned by `get_crm_guide`:

- Remove or relocate information that violates a layer-specific confidentiality rule.
- Preserve information in a layer where the guide explicitly allows it.
- Remove credentials, account numbers, tokens, and secrets from every layer. Redact the entire value, including recognizable prefixes, in proposal previews and reports.
- Keep information scoped to the correct relationship record.

Do not turn operator-specific customs into universal rules. When the guide and this skill differ, follow the guide and mention the difference in the proposal.

## Build proposals

Return one proposal per contact:

```text
CONTACT: <name> (<id>)
ASSESSMENT: No findings | Light hygiene | Consolidation | Policy cleanup
COVERAGE: <surfaces and date ranges read>

PROPOSED:
1. <action-first finding and reason>
2. ...

WRITE PLAN:
- <tool>: <exact intended mutation>

PREVIEW:
<before/after or unified diff for every deletion, move, consolidation,
dated-heading edit, or meaning-changing rewrite>

APPROVAL: Reply "approve <id>" to apply this proposal as shown.
```

If there are no findings, report the contact as clean and make no bookkeeping write.

Show an exact preview for every destructive or meaning-changing edit, even when the server's destructive-edit threshold would not require confirmation. Treat silence, a scheduled invocation, and broad approval of another contact as non-approval.

Use only tools the connector actually exposes. If a task or meeting must be rewritten and no update tool exists, propose creating the corrected replacement first, verifying it, and only then deleting the original by ID. Never hide a delete-and-recreate sequence behind an imaginary “update” operation.

Before presenting a proposal, check that every proposed journal heading, date, section, interaction, and task still satisfies the live guide. A cleanup that produces invalid structure is not a valid proposal.

## Apply approved proposals

For each approved contact:

1. Reread every surface to be changed. If content changed after the proposal, stop and return a refreshed proposal.
2. Apply additive moves first:
   - Create an extracted task only when its action and absolute due date are explicit.
   - Add destination content before removing its source copy.
   - When rewriting an atom without an update tool, create and verify its replacement before deleting the original.
3. Apply journal changes with `edit_journal`, the latest `expectedHash`, and the narrowest exact replacement possible.
4. Set `confirmed_with_user: true` only for the exact journal mutation the user approved.
5. Delete or complete stale atoms only through the connector's documented tools and only as approved.
6. After each write, use the returned hash or reread the record before the next mutation.
7. Stop the apply loop for that contact on a validation error, hash conflict, or unexpected response. Continue with other independently approved contacts.

Never silently retry a destructive write, broaden an approved edit, change a pipeline stage, or create a contact.

## Verify and report

Reread all changed surfaces and end with:

```text
CRM dreaming pass <YYYY-MM-DD>. Reviewed N contacts; P proposals;
A applied; H awaiting approval; F failed.

- <contact> (<id>) — APPLIED: <verified changes>
- <contact> (<id>) — PENDING: <proposal summary>
- <contact> (<id>) — CLEAN: no findings
- <contact> (<id>) — FAILED: <tool and actionable error>

Coverage: <complete CRM rotation | risk-prioritized partial batch>
Next candidates: <names/ids when known>
```

Keep the report focused on outcomes, pending decisions, failures, and coverage.

## Boundaries

- Do not reconcile inbox, calendar, or transcript sources; use `crm-management`.
- Do not import historical notes or create contacts; use `crm-migrate`.
- Do not add new strategic interpretation.
- Do not change stages or statuses.
- Do not refresh briefings inside the cleanup pass unless the user separately requests meeting preparation.

Maintainers: read [references/tests.md](references/tests.md) when changing this workflow. Do not load the test cases during a normal pass.
