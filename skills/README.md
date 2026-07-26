# Add the Claw CRM skills to your agent

The `skills/` directory is a portable bundle for the operator's own AI agent. After cloning the repository, ask the local agent to add these skills to its personal setup on that device.

The skills contain operating instructions only. They do not contain CRM data, MCP URLs, tokens, email credentials, or client-specific configuration.

## Which skill to install

- **Install `crm-management` for the normal Claw workflow.** It is standalone: it calls `get_crm_guide` for the authoritative CRM contract, then reconciles email, calendar, and configured meeting transcripts.
- **Add `crm-migrate` only for an initial bulk import.** It is also standalone and calls `get_crm_guide` before planning writes.
- **Add `crm-dreaming` for periodic hygiene.** It proposes small, per-contact cleanups for journal sprawl, duplication, stale records, and live policy violations, then writes only after explicit approval.
- **Add `crm` only if you want proactive ad-hoc capture.** It teaches the agent to recognize conversational cues such as “I met someone today” or “follow up Friday” as CRM work even when the user did not explicitly name the CRM or a tool. The MCP guide already contains its substantive writing contract, so `crm` is not required by either workflow skill.

The agent must install each complete directory, not only `SKILL.md`; supporting `references/` files are part of the skill.

## Codex or Claude Code

Open the cloned repository in the agent and ask:

```text
Install the crm-management directory from this repository's skills folder into your personal skill setup on this device.

Copy the complete directory, including references and other supporting files. Do not modify the source copy. If a skill with the same name is already installed, show me the differences and ask before replacing it. When finished, tell me where you installed it and whether I need to start a new task or session for discovery.

Also explain the optional crm-migrate, crm-dreaming, and crm skills in one sentence each, but do not install them unless I ask.
```

For a project-local installation instead, replace “personal skill setup” with “this project's local skill setup.” Personal installation makes the CRM workflows available across tasks; project-local installation limits them to one working directory.

Repeat this step on every device that hosts a local agent. Claw CRM does not synchronize local agent skills.

## Install and run CRM dreaming

Ask the local agent:

```text
Install the crm-dreaming directory from this repository's skills folder into my personal skill setup on this device.

Copy the complete directory, including references and agent metadata. Do not modify the source copy. If a skill with the same name is already installed, show me the differences and ask before replacing it. When finished, tell me where you installed it and whether I need to start a new task or session for discovery.
```

After restarting if required, run `Run CRM dreaming` for a three-to-five-contact maintenance batch or `Run CRM dreaming on <contact name or ID>` for a focused pass. The first response is proposal-only. Reply `approve <contact ID>` to apply one proposal; everything else remains unchanged.

For weekly scheduling, use [`docs/agent-prompts/weekly-crm-dreaming.md`](../docs/agent-prompts/weekly-crm-dreaming.md). Scheduled runs surface proposals but do not authorize writes.

## Claude Desktop or Claude.ai

Create a private Claude Project and ask Claude to add `crm-management` to the project's instructions or knowledge. Add `crm-migrate` for an initial import, `crm-dreaming` for periodic hygiene, or `crm` for proactive ad-hoc capture only when wanted.

Never paste the tokenized Claw MCP URL into skill text. Register the deployed CRM as a connector separately.

## Verify

Start a new task or session and ask:

```text
Which Claw CRM skills are installed, and when would you invoke each one? Do not call any tools or change CRM data.
```

Then register the deployed Claw MCP URL and verify it separately with a read-only `get_crm_guide` call.

## Updating

After pulling a newer repository version, ask the agent to compare the shipped skill directories with its installed copies. Review the diff before replacement, especially if the installed copies contain private customizations.
