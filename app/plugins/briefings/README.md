# Briefings Plugin

Store per-contact prep notes for upcoming conversations.

## MCP Tools

| Tool | Description |
|------|-------------|
| `save_briefing` | Save prep notes for a contact (one per contact, upsert) |
| `get_briefing` | Retrieve a contact's briefing |

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/briefings/:contactId` | Get briefing |
| PUT | `/api/briefings/:contactId` | Save/update briefing |
| DELETE | `/api/briefings/:contactId` | Delete briefing |

## Data

One briefing per contact (upsert semantics). Good for: talking points, recent news, open items, relationship notes. Briefings appear when expanding a meeting in the "Today" section.
