# Deploy Claw CRM with Codex and Railway MCP

This guide lets a semi-technical operator give Codex bounded access to a Railway account, ask it to create a private Claw CRM instance, and then connect Codex to the CRM itself.

There are two distinct MCP servers:

1. **Railway MCP** manages infrastructure in the operator's Railway account.
2. **Claw CRM MCP** manages relationship data inside the deployed CRM.

Connecting one does not connect the other.

## 1. Prepare the repository

Fork the repository into an account you control, clone the fork, and open the repository folder in Codex. Using a fork gives you a durable place for configuration updates and lets Railway auto-deploy future pushes.

Do not add real contact data, CRM tokens, Railway credentials, or generated MCP URLs to the repository.

## 2. Connect Codex to Railway

Install the [Railway CLI](https://docs.railway.com/cli), then authenticate:

```bash
railway login
```

Railway's current agent setup can configure Codex automatically:

```bash
railway mcp install --agent codex
```

If the installed CLI does not recognize `mcp install`, add the equivalent local stdio server directly:

```bash
codex mcp add railway -- railway mcp
```

Start a new Codex task after configuration so the Railway tools load. Railway recommends local MCP for coding-agent workflows because it shares the local CLI's authentication and project context. A hosted OAuth option is also available at `https://mcp.railway.com`; see [Railway's MCP documentation](https://docs.railway.com/ai/mcp-server).

## 3. Give Codex this deployment prompt

Replace `<project-name>` and `<github-owner>/<repo>` before pasting:

```text
Use the Railway MCP tools and, when local repository context is required, the authenticated Railway CLI to deploy this Claw CRM fork into my Railway account.

Desired outcome:
- A new Railway project named <project-name>.
- One app service sourced from <github-owner>/<repo>, with root directory app, so future pushes to the configured branch auto-deploy.
- One PostgreSQL service in the same Railway project.
- DATABASE_URL on the app service must reference the Postgres service's DATABASE_URL.
- SESSION_SECRET must be a newly generated high-entropy value. Do not print it in chat or write it to the repository.
- A Railway-provided public domain for the app service.
- A successful deployment whose GET /api/config returns HTTP 200.
- Preserve app/railway.json's HOST=0.0.0.0 start command so Railway's proxy and health checks can reach the app.

Safety and data rules:
- Do not run npm run db:seed. This must start as an empty private CRM.
- Do not set MCP_TOKEN. The app creates a per-instance token during first-time setup.
- Do not expose database credentials, SESSION_SECRET, or tokens in chat.
- Do not modify or delete any existing Railway project or service.
- Restrict public access until the operator completes PIN setup; an uninitialized instance lets the first caller to /api/setup claim it.
- If a requested project or service name already exists, stop and ask before reusing it.

Execution:
1. Inspect app/railway.json, app/Dockerfile, app/package.json, and app/.env.example before changing Railway state.
2. Show me a short proposed resource plan and ask for approval before creating anything.
3. Create the project, app service, and Postgres service.
4. Configure the variables and public domain.
5. Deploy from the fork with app as the root directory.
6. Wait for the deployment and health check. Inspect bounded logs if it fails, fix only this new project, and retry.
7. Verify GET /api/config returns 200. Report the public app URL, service names, deployment status, and whether the first-start schema bootstrap succeeded. Do not report secret values.
8. Tell me to open the app URL, choose a PIN, and copy the Claw MCP URL shown by the setup screen.
```

Codex should propose a plan before creating billable resources. Review the project name, workspace, repository, and number of services.

## 4. Complete first-time setup

Open the generated domain. Claw will ask for a 4-6 digit PIN, create the first user, and display a tokenized MCP URL.

On a truly empty database, startup runs the initial schema push once. On later deploys, the bootstrap detects the existing `users` and `contacts` sentinel tables, skips schema push, and hands control to the idempotent boot migrations. If only one sentinel exists, startup fails safely instead of applying an automatic schema change.

## 5. Connect Codex to Claw

Copy the MCP URL from the setup screen or **Settings**, then run locally:

```bash
codex mcp add claw-crm --url "https://your-domain.up.railway.app/mcp/<TOKEN>"
```

Start a new Codex task and verify the connection:

```text
Call get_crm_guide on my Claw CRM and summarize the live snapshot. Do not create or change anything.
```

If Codex cannot see the tool, run `codex mcp list`, confirm the URL is complete, and start a new task. An invalid or stale token intentionally returns `404`; regenerate the MCP token in Claw Settings and update the connector when needed.

## 6. Install the CRM skills

With the repository open in Codex, ask:

```text
Install the crm-management directory from this repository's skills folder into your personal skill setup on this device. Copy the complete directory, including references. If it already exists, show me the diff and ask before replacing it. Confirm where you installed it and whether I need to start a new task. Briefly explain the optional crm-migrate, crm-dreaming, and crm skills, but do not install them unless I ask.
```

Start a new Codex task after installation. Add `crm-migrate` only for a reviewed one-time import, `crm-dreaming` for periodic proposal-first cleanup, or `crm` when proactive ad-hoc capture is valuable. Repeat installation on each device that runs Codex; local skills are not synchronized by the CRM. Keep operator-specific edits in a private working copy, not the public fork.

## 7. Security boundaries

- The tokenized Claw MCP URL grants CRM access. Treat the full URL as a secret.
- Railway MCP grants infrastructure access. Review creation, redeploy, variable, and agent actions before approval.
- Use a dedicated non-critical Railway project and least-privilege workspace access where practical.
- Never put pricing or commercial terms in CRM tasks, interactions, briefings, or contact fields; the shipped CRM skill confines them to the relationship journal.
- Back up Postgres before any manual schema or bulk-data operation.
