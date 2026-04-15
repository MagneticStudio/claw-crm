# Changelog

## 2026-04-15

### Snooze follow-ups by 1/7/14 days
- Hover over any follow-up to reveal snooze buttons (+1d, +7d, +14d)
- Works in both the Upcoming panel and per-contact follow-up lists
- Snooze updates the due date immediately via the existing API (fixes #40)

### Contact card UI polish
- Flash notifications no longer overlap stage/status badges — now inline in the header row (fixes #42)
- Status badge (ACTIVE/HOLD) is always visible and clickable to toggle — no more slash commands needed (fixes #39)
- Date picker in followup edit mode styled with teal accent, rounded corners, Montserrat font (fixes #41)

## 2026-04-14

### Full-text search with BM25 ranking
- Added Cmd+K search with instant contact filtering across all fields (names, notes, tasks, briefings, email, etc.)
- Server-side MiniSearch (BM25) engine powers both the UI and MCP `search_contacts` tool
- Weighted field ranking: name/company 5x, tasks 3x, notes 2x, metadata 1x
- Prefix matching + fuzzy typo tolerance (edit distance ~20%)
- Preview snippets with teal background + yellow match highlights for non-name matches
- Search ignores active stage filter; hides Upcoming panel; auto-switches kanban to list view
- New `GET /api/search` REST endpoint; lazy index rebuild on data mutations
- Removed stats line from header; added search icon with ⌘K tooltip
- Client bundle reduced ~20KB (MiniSearch moved server-side)
- E2E test steps added for search flows

## 2026-04-12

### README rewrite for open source
- Rewrote README as a public splash page: product pitch first, technical details after
- Added 3 screenshots: notebook view, settings (MCP connection), rules engine (live violations)

### Improve E2E testing and add grill-me skill
- E2E screenshots now named by step (`01-crm-loaded.png`, etc.) and wiped at start of each run
- E2E skill writes a `run.json` manifest with branch, timestamp, and per-step results
- Pre-PR hook validates the manifest (exists, recent, passing) instead of just checking for any recent PNG
- `e2e-screenshots/` added to .gitignore — ephemeral proof, not committed artifacts
- CLAUDE.md updated: after adding a major feature, update E2E skill with new steps before running it
- New `/grill-me` skill: structured Q&A to stress-test a plan or design before implementation

## 2026-04-11

### Simplify header: filter + menu dropdowns
- Replaced 6 header buttons + pill row with 2 icons: filter and menu
- Filter dropdown: stages in pipeline order with counts, single-select, tap to toggle
- Menu dropdown: list/kanban toggle, rules, settings, activity log, logout — all with icons + labels
- Filter icon tints accent color when a stage filter is active

### Add lint + format checks to CI, branch protection
- CI now runs `eslint --max-warnings 0` and `prettier --check` before build/test
- Branch protection enabled on main: requires PR, CI pass, no force push

### Clean up all lint warnings to 0
- Typed rules-engine JSONB fields (RuleCondition, RuleException, RuleAction)
- Typed mcp-client.ts API responses with generics
- Replaced all `catch (err: any)` with `catch (err: unknown)`
- Added express-session/express type augmentations
- Fixed all client-side any casts (briefing, metadata, stage includes, badges)
- Suppressed react-refresh false positives for hooks/context/UI files
- Final count: 0 errors, 0 warnings

### Add ESLint + Prettier
- ESLint flat config with TypeScript, React hooks, and agent-friendly autofixable rules
- Prettier configured to match existing code style (2 spaces, double quotes, semicolons, trailing commas)
- `npm run lint`, `lint:fix`, `format`, `format:check` scripts added
- Pre-PR hook now checks lint passes before allowing PR creation
- `no-explicit-any` set to warn (not error) — 46 existing instances, cleanup is separate

### Redesign Kanban desktop view
- Desktop Kanban now fits within the 640px main content width instead of full-width horizontal scroll
- Uses compact pill-style cards (same as mobile) for consistency
- Stages stacked in pairs as a snake layout: LEAD/MEETING → PROPOSAL/NEGOTIATION → LIVE/RELATIONSHIP
- Removed PASS stage from both desktop and mobile Kanban views
- Header stays at 640px max-width in both list and kanban modes

### MCP tool upgrades
- **New `get_dashboard` tool**: One-call CRM snapshot — contacts by stage, overdue tasks, upcoming meetings (48h), violations by severity, recent activity. All with contact names pre-resolved.
- **New `create_task` tool**: Consolidates `set_followup` and `set_meeting` into a single tool with a `type` parameter ("task" or "meeting"). Meeting-specific fields (meetingType, time, location) are optional params.
- **Enriched list responses**: `list_violations` and `get_upcoming_meetings` now include `contactName` alongside `contactId`, eliminating N+1 lookup calls.
- **Pagination**: `search_contacts`, `list_violations`, `get_upcoming_meetings`, and `list_rules` accept `limit`/`offset` and return `{ results, totalCount, hasMore }`.
- **Enum validation**: Stage, status, interaction type, severity, condition type, and meeting type all use `z.enum()` derived from shared constants in `shared/schema.ts`. Adding a new value means updating one array.
- **Actionable error messages**: Not-found errors tell agents which tool to use to find valid IDs. Common DB errors (bad types, FK violations) get auto-detected hints.
- **Dynamic `get_crm_guide`**: Now includes a live snapshot (contact counts by stage, violation count, meetings this week, overdue tasks) and lists all valid enums dynamically.

## 2026-04-09

### Fix MCP session durability + add companyName to MCP tools
- Increased MCP session TTL from 30 minutes to 8 hours to prevent frequent disconnects
- Added `companyName` parameter to `create_contact` and `update_contact` MCP tools
- Company is auto-found by name or auto-created if new

### Move Upcoming Days setting to Settings page (#30)
- Upcoming days picker moved from CRM page to Settings > Upcoming Window
- Setting is now always accessible regardless of whether follow-ups are visible

### Add Kanban board view (#38)
- New toggleable Kanban view alongside existing list view (icon toggle in header)
- Desktop: full-width columns per pipeline stage with drag-and-drop contact cards
- Mobile (<768px): compact horizontal swimlane strips with pill-shaped tiles
- Drag-and-drop between stages updates contact via API with optimistic updates
- HOLD contacts excluded from Kanban view; view preference saved to localStorage
- New dependencies: @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities

### Fix activity log coverage (#43)
- Added logging for all interaction mutations (create, update, delete)
- Added logging for all follow-up/meeting mutations (create, update, complete, delete)
- Added logging for rule mutations (create, update, delete)
- All mutations now flow through `logActivity` in storage.ts, so future actions are covered automatically

## 2026-04-06

### Remove redundant MCP tools
- Cut `get_dashboard` (data available via `search_contacts`)
- Cut `get_pipeline` (data available via `search_contacts` with stage filter)
- Cut `get_activity_log` (debugging tool, not an agent action)
- Removed from all 3 MCP servers (remote, stdio, client)
- REST API endpoints (`/api/dashboard`, `/api/activity`) unchanged — UI still uses them

### Remove plugin system — flatten into core (#35)
- Removed the `plugins/` directory and `CrmPlugin` abstraction entirely
- Meetings routes, briefings routes, activity log routes inlined into `server/routes.ts`
- MCP tools (set_meeting, save_briefing, get_activity_log, etc.) inlined into `server/mcp-remote.ts`
- Briefings and activity_log schemas moved into `shared/schema.ts`
- Briefing enrichment moved directly into `server/storage.ts`
- Rules engine simplified — removed plugin data threading and stub conditions
- Client badges hardcoded as static constant instead of fetched from API
- Net result: -599 lines removed, +233 lines added, 0 behavior changes

## 2026-04-02

### Merge Today + Upcoming into one section (#31)
- Removed the separate "Today" card; all follow-ups and meetings now appear in a single "Upcoming" list
- Today's meetings keep their type-specific icons (📞📹🤝☕) and expandable briefings inline
- Items due today are tagged with a bold **TODAY** label for visual distinction

## 2026-04-01

### Configurable Upcoming Window (#28)
- Inline day toggle (1d / 2d / 3d / 7d / 14d) in the Upcoming section header
- Preference saved to DB via `/api/settings` and served via `/api/config`
- Defaults to 7 days; switching filters upcoming items instantly

### Claw Icon + Dynamic Color Cleanup (#22)
- Added Claw mark icon (three diagonal slashes): SVG favicon, PWA icons (192px, 512px), Apple touch icon
- All hardcoded color constants (`C = {...}`) replaced with `useColors()` hook — UI now fully adapts to the user's chosen primary color
- Removed unused `useMemo` import from App.tsx

## 2026-03-31

### AI-Led Onboarding Flow
- Setup wizard (/setup): PIN creation with confirmation + "Connect your AI agent" page with MCP URL
- Auth redirects to /setup when no user exists (first-time install)
- get_crm_guide detects empty CRM and includes onboarding instructions for the agent
- Dynamic org name in guide (reads from DB settings)

### Bug Fixes
- MCP sessions no longer expire after ~30 seconds. Sessions persist for 30 min of inactivity with automatic cleanup. (#9)
- Dates stored as noon UTC to eliminate timezone off-by-one bugs. Times stored as display strings in user's local timezone. No timezone settings needed. (#10, closes #11)

### Customizable Color Scheme
- Pick one primary color in Settings — UI derives accent dark, accent light, and background automatically
- CSS custom properties (--accent, --accent-dark, --accent-light, --bg) set at runtime
- Stored in DB, served via /api/config, persists across sessions

### Plugin Badges + Briefings Page
- Plugin `badges` interface: plugins declare data keys, icons, and routes for contact card badges
- Briefings plugin: 📋 badge on contacts with briefings, links to `/briefings/:contactId`
- Briefings page: full-page view with upcoming meetings, editable content, create/edit flow
- Keeps main notebook view clean — badges are small, content lives on its own page

### Deploy Fix
- Fixed Railway deploy crash: NIXPACKS builder used Node 18 which lacks `import.meta.dirname`. Simplified railway.json to let Railway auto-detect RAILPACK + Node 22.

### Header Icons
- Rules: lightning bolt (Zap), Settings: gear, Activity: pulse, Logout: arrow
- Rules is no longer a subset of Settings — separate icon and page

### Open Source Prep
- Settings page: org name, MCP token, API key, PIN change — all configurable from the UI
- App name is dynamic (from DB settings, default "Claw CRM") — no hardcoded branding
- MCP token stored in DB, validated from DB — no hardcoded fallback
- Demo seed data: 8 realistic contacts across all pipeline stages
- Railway one-click deploy config (railway.json with pre-deploy schema push)
- AGPL-3.0 license
- Removed all personal CRM data from repo

### UI Fixes
- Upcoming strip: long meeting text truncates instead of overflowing and breaking layout
- Contact card items: icons align to top on multi-line items, text truncates at 80 chars with "..."

### Pre-PR Hook
- Claude Code hook blocks `gh pr create` unless CHANGELOG is updated and E2E tests were run

### Unified Items Model
- Tasks and meetings are now the same entity: items with a `type` field on the core `followups` table
- Tasks show □ checkbox, meetings show 📅 icon — both inline in contact cards, sorted by date
- `/mtg M/D time description @ location` slash command creates meetings
- Upcoming strip shows both tasks and meetings interleaved
- Plugins can register new item types via `itemTypes` on the CrmPlugin interface
- Meetings plugin simplified: no own schema, just type registration + MCP aliases
- Plugin `enrichContact` failures are now caught — won't crash the server

### Documentation
- README MCP tools section now shows only core tools; plugin tools documented in plugin READMEs
- Each plugin has its own README with tools, routes, and data model docs
- CLAUDE.md PR checklist: README update + CHANGELOG entry required

## 2026-03-30

### Plugin Architecture
- Extracted meetings, briefings, and activity-log from core into self-contained plugins under `app/plugins/`
- New `CrmPlugin` interface: registerRoutes, registerTools, enrichContact, ruleConditions, guideText
- Core is now: contacts, interactions, follow-ups, rules, violations. Everything else is a plugin.
- Rule conditions are pluggable — plugins can register custom condition evaluators

### CI/CD
- GitHub Actions CI pipeline: build + Playwright E2E tests on every PR
- E2E test skill (`.claude/skills/e2e-test/`) for agentic pre-PR testing

### Meetings & Briefings
- Meetings: schedule calls/video/in-person/coffee, cancel, complete. MCP tools + API + "Today" UI section
- Briefings: one-per-contact prep notes (upsert). MCP tools + API
- Activity Log: audit trail for all system/agent actions. MCP tool + API + drawer in header

## 2026-03-29

### Stage/Status Separation
- HOLD is a status, not a stage. Stages: LEAD → MEETING → PROPOSAL → NEGOTIATION → LIVE → PASS + RELATIONSHIP

### Design Overhaul
- Applied Magnetic Advisors teal style guide (Montserrat, #2bbcb3 palette, 640px max-width)
- Compact contact cards: details collapsed behind "more...", last 3 interactions shown
- Privacy screen: teal overlay when window loses focus (screen share protection)

### MCP Improvements
- Remote MCP at `/mcp/:token` for Claude custom connectors
- Session auto-recovery after deploys
- Detailed tool descriptions to guide agent formatting
- `get_crm_guide` tool as recommended first call
- Delete tools: contacts, interactions, follow-ups
- try/catch on all tools to prevent session poisoning

### Follow-up Completion Flow
- Completing a follow-up prompts for outcome, logged as interaction
- `/fu`, `/f`, `/follow`, `/todo`, `/task` all create follow-ups

### Rules Engine
- `stage_in` exception type for excluding stages from rules
- `meeting_within_hours` condition (via meetings plugin)
- `update_rule` accepts conditionParams and exceptions

## 2026-03-27

### Initial Build
- Document-first CRM: contacts, interactions, follow-ups, rules, violations
- PIN auth + API key auth
- MCP server with 20+ tools
- Rules engine: reactive + scheduled evaluation
- SSE real-time updates
- Seeded with demo contacts and pipeline data
- Deployed to Railway
- PWA for iOS + Pake Mac desktop app
