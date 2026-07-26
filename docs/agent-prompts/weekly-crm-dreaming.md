# Weekly CRM Dreaming

This is a scheduled assignment for Codex, Claude, or another MCP-capable agent. It is not a skill and should not be installed in a skills directory.

Before using it, install [`crm-dreaming`](../../skills/crm-dreaming/SKILL.md) and register the deployed Claw CRM MCP connector.

The `crm-dreaming` skill is the canonical operating procedure. Keep cleanup categories, approval gates, write ordering, validation, and reporting rules there.

## Prompt to schedule

```text
Run the crm-dreaming workflow now as a proposal-only weekly maintenance pass.

Review a risk-prioritized batch of three to five contacts. If the connector cannot enumerate the whole CRM, use the contacts discoverable through violations, stale briefings, overdue work, upcoming meetings, and recent activity, then label coverage as partial.

Do not mutate any CRM record during this scheduled run. Return the per-contact proposals and approval instructions required by crm-dreaming. Unapproved contacts must remain unchanged.
```

## Scheduling notes

- Run weekly after the last daily CRM sync of the workweek.
- Run it manually once before enabling a schedule so the operator can review batch selection and proposal quality.
- Continue the resulting task to approve individual contacts with `approve <contact ID>`.
- Do not embed the MCP URL, token, contact names, client information, or other private configuration in the scheduled prompt.
