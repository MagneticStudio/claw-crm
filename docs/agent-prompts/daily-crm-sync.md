# Daily CRM Sync

This is a scheduled assignment for Codex, Claude, or another MCP-capable agent. It is not a skill and should not be installed in a skills directory.

Before using it, install [`crm-management`](../../skills/crm-management/SKILL.md). The optional core `crm` skill is not required for this scheduled workflow.

The scheduled agent needs access to:

- The deployed Claw CRM MCP connector.
- Received and sent email.
- Today and tomorrow on the operator's calendar.
- Meeting notes or transcripts when the operator uses them as a source of record.

The `crm-management` skill is the canonical operating procedure. Keep routing, deduplication, meeting curation, validation, and reporting rules there.

## Prompt to schedule

```text
Run the crm-management workflow now.

Reconcile the CRM against email threads touched in the last 1-2 days, calendar events for today and tomorrow, and meeting notes or transcripts from the last 1-2 days when that source is configured.

Before writing, call get_crm_guide for the authoritative CRM contract and live state. Read each relevant source item in full, deduplicate across email, calendar, transcripts, and existing CRM records, and verify every write.

Do not create contacts. Do not log routine logistics. Keep structured interactions, tasks, and meetings sparse; preserve substantive advice, impact, and forward plans in the relationship journal. Apply the strategic-versus-operational meeting test from crm-management.

If an expected connector is unavailable, stop before writing and state which source is missing. Do not present partial coverage as a complete run.

End with the action-first review queue required by crm-management, beginning with source counts and CRM write count. If nothing needs attention, say "All clear."
```

## Scheduling notes

- Run once each weekday after the operator's main working hours, or twice daily for a high-volume pipeline.
- Keep the 1-2 day overlap. Deduplication makes reruns safe and the overlap catches late replies and delayed transcripts.
- Start manually before enabling a schedule so the operator can review connector permissions and the first run's write quality.
- Do not embed MCP tokens, email credentials, client names, or other secrets in the prompt.
