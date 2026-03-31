# Meetings Plugin

Schedule and track meetings with contacts. Meetings are items with `type: "meeting"` on the core `followups` table.

## Slash Command

`/mtg M/D time description @ location` — e.g. `/mtg 4/3 2pm Coffee with Idan @ Century City`

## MCP Tools

| Tool | Description |
|------|-------------|
| `set_meeting` | Schedule a meeting (creates item with type "meeting") |
| `get_upcoming_meetings` | List upcoming meetings |
| `cancel_meeting` | Soft-cancel a meeting |

## Rule Conditions

| Condition | Description | Params |
|-----------|-------------|--------|
| `meeting_within_hours` | Contact has a meeting within N hours | `{ hours: 24 }` |

## Item Type

Registered as: `{ name: "meeting", icon: "📅", completable: false, hasTime: true, hasLocation: true }`

Meetings appear alongside tasks in contact cards and the Upcoming strip, sorted by date. After a meeting happens, log it as an interaction with `add_interaction`.
