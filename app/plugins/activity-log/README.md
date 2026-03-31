# Activity Log Plugin

Audit trail for all system, agent, and user actions.

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_activity_log` | Query the log. Filter by `contactId`, `event`, `source`, `limit`. |

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/activity` | Query log. `?contactId=N`, `?event=rule.evaluated`, `?source=agent`, `?limit=50` |

## Events Logged

| Event | Source | Example |
|-------|--------|---------|
| `contact.created` | agent | "Created Kyle Cross" |
| `contact.updated` | agent | "Updated Kyle Cross: stage, status" |
| `contact.deleted` | agent | "Deleted Kyle Cross" |
| `meeting.created` | agent | "Scheduled call for 4/1 2pm" |
| `meeting.cancelled` | agent | "Cancelled meeting" |
| `briefing.saved` | agent | "Briefing saved (412 chars)" |
| `violation.created` | rule:1 | "No interaction for 27 days" |

## UI

Activity drawer accessible from the header (pulse icon). Shows a chronological list of recent activity.
