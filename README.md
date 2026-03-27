# Claw CRM

Document-first CRM for Magnetic Advisors. A single scrollable notebook view of your entire pipeline — built for one operator, not a sales team.

**Live at**: https://crm.magneticadvisors.ai

---

## Architecture

```
[Browser UI] <--REST/SSE--> [Express API + Postgres] <--eval--> [Rules Engine]
                                      ^
                                      |
                              [MCP Server (remote)]
                              (AI agent interface)
```

- **Data**: Postgres with contacts, companies, interactions, follow-ups, rules, rule violations
- **Frontend**: React notebook-style document view. Inline editing, slash commands, real-time SSE updates
- **Rules**: Business logic stored as DB rows, evaluated reactively + every 15 minutes
- **MCP**: Remote MCP endpoint for AI agents (Claude, openclaw, etc.)
- **Deploy**: Railway (Express serves API + frontend, managed Postgres)

---

## Running Locally

```bash
cd app
cp .env.example .env   # set DATABASE_URL and SESSION_SECRET
npm install
npm run db:push        # push schema to Postgres
npm run db:seed        # seed with contact data (PIN: 1234)
npm run dev            # http://localhost:3000
```

---

## AI Agent Integration

### Remote MCP (Claude Web, Desktop, Mobile)

The CRM exposes a remote MCP endpoint that works with Claude's custom connectors.

**URL**: `https://crm.magneticadvisors.ai/mcp/<TOKEN>`

To set up in Claude:
1. Go to **Settings** → **Custom Connectors** → **Add**
2. Enter the MCP URL (with token)
3. Leave OAuth fields blank
4. Click **Add**

### Local MCP (Claude Desktop, Claude Code)

For local MCP via stdio, use `mcp-client.ts` which calls the REST API over HTTPS:

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "claw-crm": {
      "command": "npx",
      "args": ["tsx", "/path/to/claw-crm/app/server/mcp-client.ts"],
      "env": {
        "CRM_URL": "https://crm.magneticadvisors.ai",
        "CRM_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

**Claude Code** — edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "claw-crm": {
      "command": "npx",
      "args": ["tsx", "/path/to/claw-crm/app/server/mcp-client.ts"],
      "env": {
        "CRM_URL": "https://crm.magneticadvisors.ai",
        "CRM_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

### REST API

Any agent can also call the REST API directly with an API key:

```bash
curl -H "X-API-Key: <your-api-key>" https://crm.magneticadvisors.ai/api/contacts
```

---

## MCP Tools Reference

### Read Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `search_contacts` | Find contacts by name, company, stage, or status | `query?`, `stage?`, `status?` |
| `get_contact` | Full contact with interactions, follow-ups, violations | `contactId` |
| `get_pipeline` | Contacts grouped by stage with counts | — |
| `get_dashboard` | Summary: active count, overdue follow-ups, violations, stage counts | — |
| `list_violations` | Active rule violations | `severity?` |
| `list_rules` | All business rules | `enabled?` |

### Write Tools

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `create_contact` | Add a new contact | `firstName`, `lastName`, `stage?`, `status?`, etc. |
| `update_contact` | Modify contact fields | `contactId`, any field to update |
| `add_interaction` | Log a note, email, meeting, or call | `contactId`, `content`, `date?`, `type?` |
| `set_followup` | Create a follow-up task | `contactId`, `content`, `dueDate` (ISO or M/D) |
| `complete_followup` | Mark done, optionally log outcome to timeline | `followupId`, `outcome?` |
| `create_rule` | Add a business rule | `name`, `description`, `conditionType`, `messageTemplate` |
| `update_rule` | Modify a rule (enable/disable, rename) | `ruleId`, fields to update |
| `delete_rule` | Remove a rule | `ruleId` |

### Example Agent Prompts

```
"Show me my pipeline"
"Add a note to Jeff Manson: kickoff call scheduled for April 14"
"Set a follow-up for Sieva on 4/15 to discuss insurance AI team"
"Which contacts are stale?"
"Move Ari Baranian to NEGOTIATION stage"
"Complete the follow-up for Daniel about Metalsa — he confirmed a call next week"
"Create a rule: flag PROPOSAL contacts with no interaction for 10 days"
```

---

## Rules Engine

Rules are business logic stored as data, not code. They evaluate automatically — no agent polling needed.

### How Rules Run

- **Reactively**: after any write to contacts, interactions, or follow-ups
- **Scheduled**: every 15 minutes for time-based conditions (e.g., stale detection)
- **Output**: creates/clears `rule_violation` records, pushed via SSE to the browser

### Built-in Condition Types

| Condition | Description | Params |
|-----------|-------------|--------|
| `no_interaction_for_days` | No interaction for N days | `{ days: 14 }` |
| `followup_past_due` | Uncompleted follow-up past due date | `{}` |
| `no_followup_after_meeting` | No follow-up within N hours of a meeting | `{ hours: 48 }` |
| `status_is` | Contact has specific status | `{ status: "HOLD" }` |
| `stage_is` | Contact is in specific stage | `{ stage: "LEAD" }` |

### Exceptions

Rules can have exceptions that suppress violations:

| Exception | Description |
|-----------|-------------|
| `has_future_followup` | Contact has an uncompleted follow-up with a future due date |

### Default Rules (seeded)

1. **Stale Contact Detection** — Flag ACTIVE contacts with no interaction for 14+ days (unless future follow-up exists)
2. **Past-Due Follow-Up** — Flag follow-ups past their due date
3. **Post-Meeting Follow-Up** — Flag meetings with no follow-up within 48 hours

### Creating Rules via MCP

```
create_rule(
  name: "Proposal Follow-Up",
  description: "Flag PROPOSAL contacts with no interaction for 10 days",
  conditionType: "no_interaction_for_days",
  conditionParams: { days: 10 },
  exceptions: [{ type: "has_future_followup" }],
  severity: "warning",
  messageTemplate: "No interaction for {{days_since_last}} days in PROPOSAL stage"
)
```

---

## Data Model

### Pipeline Stages

`LEAD` → `MEETING` → `PROPOSAL` → `NEGOTIATION` → `LIVE` → `HOLD` / `PASS` / `RELATIONSHIP`

### Contact Statuses

- **ACTIVE** — in the pipeline, needs attention
- **HOLD** — paused, not dead
- **PASS** — declined or not a fit

### Follow-Up Completion Flow

When completing a follow-up, the agent (or user) should describe what happened. This logs an interaction to the timeline, converting the forward-looking task into a past-tense record:

```
Before:  📌 FU by 3/28: check for Idan's reply
After:   3/28: Checked in with Idan — confirmed coffee next Tuesday
```

Use `complete_followup(followupId, outcome: "what happened")` to do both in one call.

---

## Slash Commands (UI)

Type in the input at the bottom of any contact card:

| Command | Action | Example |
|---------|--------|---------|
| `/fu M/D text` | Create follow-up | `/fu 4/15 check on proposal` |
| `/f M/D text` | Same as /fu | `/f 4/1 ping Ari` |
| `/follow M/D text` | Same as /fu | |
| `/todo M/D text` | Same as /fu | |
| `/task M/D text` | Same as /fu | |
| `/stage STAGE` | Change stage | `/stage PROPOSAL` |
| `/status STATUS` | Change status | `/status HOLD` |
| (plain text) | Add interaction note | `Had coffee with Idan, great convo` |

Commands highlight in color as you type, with a hint label showing when the command is valid.

---

## Security Notes

- Web UI uses PIN authentication (4-6 digits, hashed with scrypt)
- API access uses `X-API-Key` header
- Remote MCP endpoint is secured by a secret URL token
- Pricing and deal terms are NEVER stored in the CRM (see ADV-1, ADV-8)
- Client information is never cross-referenced between contacts (see ADV-6)

---

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Montserrat + JetBrains Mono
- **Backend**: Express, Node.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **MCP**: @modelcontextprotocol/sdk (stdio + StreamableHTTP transports)
- **Deploy**: Railway (auto-deploy from GitHub)
- **DNS**: Cloudflare → Railway custom domain
