# Claw CRM

AI-first personal CRM. A single scrollable notebook view of your entire pipeline — built for one operator, not a sales team. Agents do the work, humans verify.

---

## Architecture

```
[Browser UI] <--REST/SSE--> [Express API + Postgres] <--eval--> [Rules Engine]
                                      ^
                                      |
                              [MCP Server (remote)]
                              (primary write path — agents)
```

- **Core**: Postgres — contacts, companies, interactions, follow-ups, rules, violations, briefings, activity log
- **Frontend**: React notebook-style view. Inline editing, slash commands, SSE real-time updates
- **Rules**: Business logic stored as data (JSONB). Evaluated reactively on writes + every 15 minutes.
- **MCP**: Remote endpoint for AI agents. All tools registered in `server/mcp-remote.ts`.
- **Deploy**: Railway (auto-deploy from GitHub on merge to main)

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

The CRM exposes a remote MCP endpoint compatible with Claude's custom connectors.

**URL**: `https://your-domain.com/mcp/<TOKEN>`

Set up in Claude: **Settings** → **Custom Connectors** → **Add** → paste the MCP URL → leave OAuth blank → **Add**.

### Local MCP (Claude Desktop, Claude Code)

Uses `mcp-client.ts` which calls the REST API over HTTPS:

```json
{
  "mcpServers": {
    "claw-crm": {
      "command": "npx",
      "args": ["tsx", "/path/to/claw-crm/app/server/mcp-client.ts"],
      "env": {
        "CRM_URL": "https://your-domain.com",
        "CRM_API_KEY": "<your-api-key>"
      }
    }
  }
}
```

### REST API

```bash
curl -H "X-API-Key: <key>" https://your-domain.com/api/contacts
```

---

## MCP Tools (Core)

| Tool | Description |
|------|-------------|
| `get_crm_guide` | Returns full agent usage guide. Recommended first call. |
| `search_contacts` | Find by name, company, stage, or status |
| `get_contact` | Full contact with all related data |
| `create_contact` | Add a new contact. Search first to avoid duplicates. |
| `update_contact` | Modify contact fields |
| `delete_contact` | Permanently delete a contact and all related data |
| `add_interaction` | Log a note, email, meeting, or call |
| `delete_interaction` | Remove a timeline entry |
| `set_followup` | Create a follow-up task with due date |
| `complete_followup` | Mark done + log outcome to timeline |
| `delete_followup` | Remove a task without completing it |
| `get_pipeline` | Contacts grouped by stage |
| `get_dashboard` | Summary: active count, overdue follow-ups, violations |
| `list_rules` | All business rules |
| `create_rule` | Add a business rule |
| `update_rule` | Modify rule logic, params, exceptions, or enable/disable |
| `delete_rule` | Remove a rule |
| `list_violations` | Active rule violations |

Additional tools: `set_meeting`, `get_upcoming_meetings`, `cancel_meeting`, `save_briefing`, `get_briefing`, `get_activity_log`.

---

## Rules Engine

Rules are business logic stored as data, not code. Agents can create, modify, and delete rules via MCP.

### How Rules Run
- **Reactively**: after any write to contacts, interactions, follow-ups, or meetings
- **Scheduled**: every 15 minutes for time-based conditions
- **Output**: creates/clears `rule_violation` records, pushed via SSE

### Condition Types

| Condition | Description | Params |
|-----------|-------------|--------|
| `no_interaction_for_days` | No interaction for N days | `{ days: 14 }` |
| `followup_past_due` | Uncompleted follow-up past due date | `{}` |
| `no_followup_after_meeting` | No follow-up within N hours of a meeting | `{ hours: 48 }` |
| `meeting_within_hours` | Contact has a meeting within N hours | `{ hours: 24 }` |
| `status_is` | Contact has specific status | `{ status: "HOLD" }` |
| `stage_is` | Contact is in specific stage | `{ stage: "LEAD" }` |

### Exception Types

| Exception | Description |
|-----------|-------------|
| `has_future_followup` | Contact has an active follow-up with a future due date |
| `stage_in` | Contact is in one of the specified stages (e.g., `{ stages: ["LIVE", "RELATIONSHIP"] }`) |

---

## Data Model

### Pipeline Stages
`LEAD` → `MEETING` → `PROPOSAL` → `NEGOTIATION` → `LIVE` → `PASS`, plus `RELATIONSHIP`

### Contact Statuses
- **ACTIVE** — in the pipeline, needs attention
- **HOLD** — paused, not dead

HOLD is a status, not a stage. A contact can be stage PROPOSAL + status HOLD.

### Entities

| Entity | Description |
|--------|-------------|
| **Contacts** | People you track. One person per record. |
| **Companies** | Linked to contacts via `companyId` |
| **Interactions** | Timeline entries — what happened (past tense) |
| **Follow-ups** | Tasks — what needs to happen (action items with due dates) |
| **Meetings** | Future events — scheduled calls, coffees, etc. |
| **Briefings** | Prep notes — one per contact, upsert |
| **Rules** | Business logic — conditions + actions stored as JSONB |
| **Violations** | Alerts — created by rules, cleared when conditions resolve |
| **Activity Log** | Audit trail — all system, agent, and user actions |

### Follow-Up Completion Flow

When completing a follow-up, describe what happened. This logs the outcome as an interaction:

```
Before:  FU by 3/28: check for Idan's reply
After:   3/28: Checked in with Idan — confirmed coffee next Tuesday
```

Use `complete_followup(followupId, outcome: "what happened")` to do both in one call.

---

## Slash Commands (UI)

| Command | Action | Example |
|---------|--------|---------|
| `/fu M/D text` | Create task | `/fu 4/15 check on proposal` |
| `/f`, `/follow`, `/todo`, `/task` | Same as /fu | `/task 4/1 ping Ari` |
| `/mtg M/D time text @ location` | Create meeting | `/mtg 4/3 2pm Coffee with Idan @ Century City` |
| `/meeting` | Same as /mtg | |
| `/stage STAGE` | Change stage | `/stage PROPOSAL` |
| `/status STATUS` | Change status | `/status HOLD` |
| (plain text + Enter) | Add interaction note | `Had coffee with Idan` |

Tasks show □ checkbox (completable). Meetings show 📅 icon.

---

## Security

- PIN authentication (4-6 digits, hashed with scrypt)
- API key via `X-API-Key` header
- MCP endpoint secured by secret URL token
- Privacy screen: teal overlay when app window loses focus (screen share protection)
- Pricing and deal terms are NEVER stored in the CRM
- Client information is never cross-referenced between contacts

---

## Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Montserrat + JetBrains Mono
- **Backend**: Express, Node.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **MCP**: @modelcontextprotocol/sdk (stdio + StreamableHTTP)
- **Tests**: Playwright E2E
- **CI**: GitHub Actions (build + test on PR)
- **Deploy**: Railway (auto-deploy from main)
- **Desktop**: Pake (Tauri-based native Mac app)
- **Mobile**: PWA (Add to Home Screen on iOS)

---

## Features

All features are built directly into the core codebase for simplicity:

| Feature | What it does | Key files |
|---------|-------------|-----------|
| **Meetings** | Schedule meetings, upcoming view, MCP tools | `server/routes.ts`, `server/mcp-remote.ts` |
| **Briefings** | Per-contact prep notes (upsert), badge on contact cards | `server/routes.ts`, `server/mcp-remote.ts`, `shared/schema.ts` |
| **Activity Log** | Audit trail for all system/agent actions | `server/storage.ts`, `server/routes.ts`, `server/mcp-remote.ts` |
