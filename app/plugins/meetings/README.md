# Meetings Plugin

Schedule and track meetings with contacts.

## MCP Tools

| Tool | Description |
|------|-------------|
| `set_meeting` | Schedule a meeting (call, video, in-person, coffee) |
| `get_upcoming_meetings` | List meetings in next N hours/days |
| `cancel_meeting` | Soft-cancel a meeting |

## Rule Conditions

| Condition | Description | Params |
|-----------|-------------|--------|
| `meeting_within_hours` | Contact has a meeting within N hours | `{ hours: 24 }` |

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/meetings` | List meetings. `?contactId=N`, `?today=true` |
| GET | `/api/meetings/upcoming` | Upcoming meetings. `?hours=24` |
| POST | `/api/meetings` | Create meeting |
| PUT | `/api/meetings/:id` | Update meeting |
| POST | `/api/meetings/:id/cancel` | Cancel meeting |
| POST | `/api/meetings/:id/complete` | Mark meeting as completed |

## Data

Meetings are future events — not interactions. After a meeting happens, log it as an interaction with `add_interaction`. Meetings appear in the "Today" section on the CRM page.

Types: `call`, `video`, `in-person`, `coffee`
