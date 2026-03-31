# Changelog

## 2026-03-31

### Bug Fixes
- MCP sessions no longer expire after ~30 seconds. Sessions persist for 30 min of inactivity with automatic cleanup. (#9)
- Dates stored as noon UTC to eliminate timezone off-by-one bugs. Times stored as display strings in user's local timezone. No timezone settings needed. (#10, closes #11)

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
- Seeded with 11 contacts from Magnetic Advisors pipeline
- Deployed to Railway at crm.magneticadvisors.ai
- PWA for iOS + Pake Mac desktop app
