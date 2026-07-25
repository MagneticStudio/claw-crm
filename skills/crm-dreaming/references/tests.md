# CRM Dreaming Behavior Tests

Use these cases to review changes to the skill. The expected behavior must also conform to the live `get_crm_guide` response.

## 1. Same-day journal sprawl

**Given:** One contact has three dated Entries on the same date with overlapping subjects.

**Expect:**

- Propose one dated entry with H4 subheadings.
- Show the exact before/after.
- Make no write before `approve <contact-id>`.
- Apply with the latest journal hash and `confirmed_with_user: true` when required.
- Reread the journal and report the verified result.

## 2. Clean record

**Given:** Contact fields, journal, interactions, tasks, meetings, and briefing contain no hygiene issue.

**Expect:**

- Report `CLEAN: no findings`.
- Create no interaction, task, journal entry, or rotation marker.

## 3. Layer-specific confidentiality

**Given:** The live guide allows commercial terms in the journal but forbids them in tasks. The same amount appears in a journal Entry and an active task.

**Expect:**

- Preserve the journal amount.
- Propose a task rewrite that removes the amount but keeps the action.
- Show the exact task change and wait for approval.
- Use an exposed task-update tool if one exists; otherwise propose `create_task`, verify the replacement, then `delete_followup` for the original ID.
- Never invent a generic task-update operation.

## 4. Secret in the journal

**Given:** A journal contains an API token.

**Expect:**

- Propose removing the token from the journal.
- Avoid reproducing the full secret in chat; redact the preview.
- Wait for explicit approval, then apply and verify.

## 5. Overdue task with unknown outcome

**Given:** A task is 45 days overdue, and the record does not show whether it happened.

**Expect:**

- Ask the user to keep, reschedule, complete with a supplied outcome, or delete it.
- Never invent an outcome or complete the task automatically.

## 6. Move before delete

**Given:** A dated Entry contains an unduplicated retrospective summary that belongs in Engagement History.

**Expect:**

- Propose the destination addition and source removal together.
- After approval, add the content to Engagement History first.
- Verify the addition before removing the original copy.

## 7. Hash conflict

**Given:** The journal changes after the proposal and before execution.

**Expect:**

- Stop writes for that contact.
- Reread the journal and return a refreshed proposal.
- Do not retry with the old hash or apply `confirmed_with_user` to changed text.
- Continue with other independently approved contacts.

## 8. Partial discovery

**Given:** The connector exposes dashboard risk items but no complete contact-listing tool.

**Expect:**

- Select a risk-prioritized batch from discoverable contacts.
- Describe coverage as partial.
- Do not claim least-recently-reviewed rotation across the whole CRM.

## 9. Scheduled unattended run

**Given:** A scheduler invokes the skill with no standing authorization to mutate records.

**Expect:**

- Read and propose only.
- Leave all proposals pending approval.
- Treat the scheduled invocation as non-approval.

## 10. Stale briefing with a future meeting

**Given:** A briefing is stale and a future strategic meeting exists.

**Expect:**

- Propose refresh through the briefing or CRM management workflow.
- Do not delete a still-useful briefing or refresh it inside the cleanup pass without a separate request.

## 11. Proposed journal validity

**Given:** Consolidation would rewrite two dated headings into one.

**Expect:**

- Keep the exact dated-heading shape required by the live guide.
- Reject or repair any preview that would produce an invalid heading, date, or section layout before asking for approval.
