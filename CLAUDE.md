# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
cd app
npm install              # install dependencies
npm run dev              # dev server at http://localhost:3000
npm run build            # production build (vite + esbuild)
npm run start            # run production build
npm run check            # typecheck (tsc --noEmit)
npm run db:push          # push schema changes to Postgres (drizzle-kit push)
npm run db:seed          # seed database with initial data
npm run mcp              # run MCP server (stdio transport, for local Claude Desktop/Code)
```

For production DB operations, prefix with the Railway connection string:
```bash
DATABASE_URL="postgresql://...@shuttle.proxy.rlwy.net:53371/railway" npm run db:push
```

## Architecture

Four-layer system: **Data → Rules → API/MCP → UI**

```
[Browser UI] <--REST/SSE--> [Express API + Postgres] <--eval--> [Rules Engine]
                                      ^
                                      |
                              [MCP Server (remote)]
```

**All source code is in `app/`**. The repo root just has README, CLAUDE.md, and gitignore.

### Backend (`app/server/`)
- `index.ts` — Express server entry point, starts rules scheduler
- `routes.ts` — REST API endpoints for all entities + SSE event stream
- `storage.ts` — Database CRUD layer. All mutations broadcast SSE events and trigger rules evaluation. Contains `logActivity()` which logs to the activity_log table.
- `rules-engine.ts` — Evaluates business rules reactively (on data change) and on schedule (every 15 min). Conditions: `no_interaction_for_days`, `followup_past_due`, `no_followup_after_meeting`, `meeting_within_hours`, `status_is`, `stage_is`. Exceptions: `has_future_followup`, `stage_in`.
- `mcp-remote.ts` — Remote MCP endpoint at `/mcp/:token` using StreamableHTTP transport. Creates a fresh MCP server per session. All tools have try/catch to prevent session poisoning.
- `mcp-client.ts` — Local MCP client (stdio) that calls the REST API. For Claude Desktop/Code.
- `mcp-server.ts` — Direct DB MCP server (stdio). Legacy, prefer mcp-client.ts.
- `auth.ts` — PIN-based auth + API key middleware
- `sse.ts` — SSE broadcast manager
- `seed.ts` — Seeds database with initial contact data
- `db.ts` — Postgres connection via node-postgres + Drizzle

### Frontend (`app/client/`)
- `src/pages/crm-page.tsx` — Main notebook view. "Today" meetings, "Upcoming" follow-ups, contact cards.
- `src/pages/rules-page.tsx` — Rules management with violation display
- `src/pages/auth-page.tsx` — PIN login with teal gradient
- `src/components/contact-block.tsx` — Contact card with inline editing, slash commands, follow-up completion flow
- `src/hooks/use-crm.ts` — React Query mutations for all CRM operations
- `src/hooks/use-sse.ts` — SSE listener that invalidates React Query cache
- `src/hooks/use-auth.tsx` — Auth context (PIN + session)
- `src/App.tsx` — Privacy screen overlay when window loses focus

### Shared (`app/shared/`)
- `schema.ts` — Drizzle ORM schema. Tables: users, companies, contacts, interactions, followups, meetings, briefings, rules, rule_violations, activity_log. The `ContactWithRelations` type includes all related data.

## Key Patterns

- **Storage layer is the single write path.** All mutations go through `storage.ts` which handles SSE broadcast, rules evaluation trigger, and activity logging.
- **MCP tools must have try/catch.** An unhandled exception in a tool crashes the MCP session, causing all subsequent calls to fail.
- **Rules are data, not code.** Stored as JSONB in the `rules` table. Agents can CRUD rules via MCP.
- **Activity log is the audit trail.** `storage.logActivity()` is called from mutations. Agents can query it via `get_activity_log` MCP tool.
- **SSE pushes all data changes to the browser.** The frontend invalidates React Query cache on any event.
- **MCP sessions auto-recover after deploys.** Stale session IDs get a fresh session instead of an error.

## Data Model

- **Stage** = pipeline position: LEAD → MEETING → PROPOSAL → NEGOTIATION → LIVE → PASS, plus RELATIONSHIP
- **Status** = active or paused: ACTIVE or HOLD. HOLD is NOT a stage.
- **Follow-ups** are forward-looking tasks. When completed, the outcome is logged as an interaction.
- **Meetings** are future events (not interactions). After a meeting happens, log it as an interaction.
- **Briefings** are one per contact (upsert) — prep notes for upcoming conversations.

## Workflow Rules

- **Always use feature branches and PRs.** Never push directly to main. Parker (openclaw agent) reviews PRs.
- **Railway auto-deploys from main.** Root directory is `app/`. Every merge to main triggers a build+deploy.
- **Remote MCP endpoint** is at `/mcp/:token` — the token is a secret URL path for auth.
- **Never put pricing or deal terms in the CRM.** Never cross-reference client details between contacts.

## Style Guide

- Font: Montserrat (300-700) + JetBrains Mono for dates/code
- Palette: Background `#f0f8f8`, cards white, borders `#d4e8e8`, text `#1a2f2f`, muted `#5a7a7a`, accent `#2bbcb3`
- Max content width: 640px
- Cards: 12px border-radius, 1px border
- Contact cards are compact: no chevron toggle, details collapsed behind "more..." preview
- Follow-ups: square checkbox icon (not checkmark), no emoji
