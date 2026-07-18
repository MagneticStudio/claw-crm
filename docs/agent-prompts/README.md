# Agent prompts

Agent prompts are assignments, not skills.

- A **skill** is installed into an agent client and teaches a reusable capability: when to invoke it, how to reason, which tools to use, what must never happen, how to verify writes, and how to report.
- An **agent prompt** starts one run—or defines a recurring schedule—for an agent that already has the relevant skill and connectors.

## Ownership boundary

| Question | Owned by |
|---|---|
| When should the agent select this workflow? | Skill trigger metadata |
| How should source data be classified and written? | Skill |
| What are the deduplication and confidentiality rules? | Skill |
| What must the final report contain? | Skill |
| Should this run happen now, daily, or weekly? | Agent prompt or scheduler |
| Which accounts, sources, and time window apply to this run? | Agent prompt |
| Is this a dry run or a write-enabled run? | Agent prompt |

The prompt may repeat a few critical safety constraints as defense in depth, but it must not fork the workflow. When behavior changes, update the skill first; the prompt should continue to invoke it by name.

## Installation and use

1. Install the required skill bundle using the [`skills` installation guide](../../skills/README.md).
2. Register the connectors the skill requires.
3. Run the prompt manually and review the result.
4. Only then place the prompt on a recurring schedule.

Do not install files from this directory as skills. Do not add skill-style YAML frontmatter to them. Never embed MCP URLs, access tokens, email credentials, client names, or other private information in a prompt.

## Available prompts

- [`daily-crm-sync.md`](daily-crm-sync.md) invokes `crm-management` for a daily reconciliation of email, calendar, and configured meeting-transcript sources.
