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

- **Data**: Postgres — contacts, companies, interactions, follow-ups, meetings, briefings, rules, violations, activity log
- **Frontend**: React notebook-style view. Inline editing, slash commands, SSE real-time updates
- **Rules**: Business logic stored as data (JSONB). Evaluated reactively on writes + every 15 minutes
- **MCP**: Remote endpoint for AI agents. Primary interface for data mutation.
- **Activity Log**: Audit trail for all system, agent, and user actions
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

## MCP Tools Reference

### Guide
| Tool | Description |
|------|-------------|
| `get_crm_guide` | Returns full agent usage guide. Recommended first call. |

### Contacts
| Tool | Description |
|------|-------------|
| `search_contacts` | Find by name, company, stage, or status |
| `get_contact` | Full contact with interactions, follow-ups, meetings, briefing, violations |
| `create_contact` | Add a new contact. Search first to avoid duplicates. |
| `update_contact` | Modify contact fields |
| `delete_contact` | Permanently delete a contact and all related data |

### Timeline
| Tool | Description |
|------|-------------|
| `add_interaction` | Log a note, email, meeting, or call |
| `delete_interaction` | Remove a timeline entry |

### Tasks
| Tool | Description |
|------|-------------|
| `set_followup` | Create a follow-up task with due date |
| `complete_followup` | Mark done + log outcome to timeline |
| `delete_followup` | Remove a task without completing it |

### Meetings
| Tool | Description |
|------|-------------|
| `set_meeting` | Schedule a meeting (call, video, in-person, coffee) |
| `get_upcoming_meetings` | List meetings in next N hours/days |
| `cancel_meeting` | Soft-cancel a meeting |

### Briefings
| Tool | Description |
|------|-------------|
| `save_briefing` | Save prep notes for a contact (one per contact, upsert) |
| `get_briefing` | Retrieve a contact's briefing |

### Pipeline
| Tool | Description |
|------|-------------|
| `get_pipeline` | Contacts grouped by stage |
| `get_dashboard` | Summary: active count, overdue follow-ups, violations, meetings today |

### Rules
| Tool | Description |
|------|-------------|
| `list_rules` | All business rules |
| `create_rule` | Add a business rule |
| `update_rule` | Modify rule logic, params, exceptions, or enable/disable |
| `delete_rule` | Remove a rule |
| `list_violations` | Active rule violations |

### Activity Log
| Tool | Description |
|------|-------------|
| `get_activity_log` | View system activity: rule evaluations, agent actions, violations. Filter by contact, event type, or source. |

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
| `/fu M/D text` | Create follow-up | `/fu 4/15 check on proposal` |
| `/f`, `/follow`, `/todo`, `/task` | Same as /fu | `/task 4/1 ping Ari` |
| `/stage STAGE` | Change stage | `/stage PROPOSAL` |
| `/status STATUS` | Change status | `/status HOLD` |
| (plain text + Enter) | Add interaction note | `Had coffee with Idan` |

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
