# Changelog

## 2026-05-15

### Meetings are never "overdue"
A meeting is a scheduled event — once its date is in the past, it has *happened*, not become overdue. The CRM was treating past-dated meetings the same as past-dated tasks: flagging them with the red `OVERDUE` label in the Upcoming list and on contact cards, and generating Past-Due Follow-Up rule violations. Wrong semantics, wrong visual treatment.

Gated three spots on `type !== "meeting"`:
- `crm-page.tsx` Upcoming list — `isOverdue` no longer flips true for meetings.
- `contact-block.tsx` per-contact followup display — same fix.
- `rules-engine.ts` `followup_past_due` condition (and its activity-message helper) — meetings never match, so the rule fires on tasks only.

Past meetings now render with their normal blue date prefix and neutral body text. The `no_followup_after_meeting` rule still handles the "you should log this" nudge — that's the right surface for it.

## 2026-05-14

### Slash-command placeholder advertises `/stage` and `/status`
The contact card's slash-command input used to read `+ note, /fu 4/15 task, /mtg 4/3 2pm meeting` — only two of the four available commands. After we removed the stage/status pills (PR #77), `/stage` and `/status` became the primary edit path for those fields but weren't discoverable from the input itself. New placeholder is `+ note · /fu · /mtg · /stage · /status` — all four advertised, dropping the M/D + time syntax cues since the typing-time contextual hint above the input already shows those when you start typing.

## 2026-05-11

### Confidentiality rule: layer-specific scoping
The previous `get_crm_guide` confidentiality block was too blunt — "NEVER put pricing or deal terms in the CRM" — and forced agents to strip strategically important content from the journal where it actually belongs (case-study material, engagement history, partnership terms over time). New rules:
- **Pricing / dollar amounts / fees / commission rates:** allowed in the journal only (Entries, Engagement History, Wins, Key People). Forbidden in tasks, interactions, briefings, and contact fields. Tasks/interactions reference payments by date + scope, not figure.
- **Cross-client specifics:** never, in any layer.
- **Credentials / account numbers / secrets:** never, anywhere.

Pure text/policy update. No validator changes; the journal already accepts dollar amounts. Existing entries stay valid; cleanup of pricing in tasks/interactions is a `crm-dreaming` skill job.

### Journal hygiene: triple-shot — double-dated headings, briefing/meeting linkage, Engagement History
Three related issues surfaced during a CRM audit, all in the journal/briefing subsystem. Shipping together because they share an audience and a fix shape.

**Issue 1 — Double-dated entry headings.** `append_journal` / `batch_append_journal` prepended `### YYYY-MM-DD:` while LLM callers regularly included the date as the first token of `title`, producing `### 2026-05-10: 2026-05-10: Foo`. New `stripDatePrefix(title)` helper in `shared/journal.ts` silently strips a leading absolute-date pattern from the title (YYYY-MM-DD, M/D/YYYY, "May 10, 2026", year-only "August 2025", "Q3 2025", "spring 2026") before composing the heading. Purely additive — no valid title started with one of those patterns. Existing entries untouched; the agent-side `crm-dreaming` skill handles historical cleanup via `edit_journal`.

**Issue 2 — Briefings linked to a specific meeting.** Schema: new optional `briefings.meeting_id` (FK to `followups.id`, ON DELETE SET NULL). Boot migration adds the column idempotently. Tools:
- `prepare_briefing` returns `candidateMeetingId` (next pending meeting on the contact) + `previousBriefing.linkedMeeting` / `previousBriefing.staleReason`. Agent passes `candidateMeetingId` through to `save_briefing.meetingId`.
- `save_briefing` accepts and persists optional `meetingId`.
- `get_briefing` returns `meetingId` + `linkedMeeting` (date/content/location) + `staleReason` (`age` / `meeting_completed` / `wrong_meeting` / null).
- New `getBriefingStaleness(briefing, meetings)` helper in `shared/briefing.ts` — single source of truth used by client + server. A briefing is stale when age >7d, OR the linked meeting has completed, OR a newer meeting is now next pending on the contact.
- Briefings without `meetingId` fall back to age-only — backward compatible.
- Briefing page surfaces the reason in the stale banner ("the meeting this was for has already happened" / "a newer meeting is now next") and shows the linked meeting context line above the briefing.

**Issue 3 — `## Engagement History` canonical section.** New canonical section between Wins and Entries. Edited in place via `edit_journal`, no `### YYYY-MM-DD:` requirement. Home for retrospective phase summaries — content authored about a *span* rather than about a single date (scope evolution, role changes, "Q1 2025 — Phase 1"). Mixing those into Entries with backdated headings distorted long-running timelines. Added to `CANONICAL_SECTIONS`, included in `JOURNAL_SKELETON`, accepted by `read_journal`'s `section` enum, documented in `get_crm_guide`. New `detectDateSpanDays(body)` helper plus a non-blocking `wide_date_span` warning on `append_journal` responses when the body references dates spanning >7 days — soft nudge that the content probably belongs in Engagement History.

**Follow-up — `delete_briefing` MCP tool.** New tool so the dreaming skill can clear briefings flagged as stale-and-targeting-completed-meeting without an awkward placeholder save. Idempotent.

## 2026-05-04

### Seed: idempotent wipe-then-insert; populates journal, briefings, linkedin URLs
The seed accumulated duplicates on each re-run (we'd end up with three "Sarah Chen" rows). Now TRUNCATEs every table CASCADE before inserting, so re-running gives a clean state every time. Adds a safety guardrail: refuses to run against a non-local DB unless `CLAW_SEED_FORCE=1` is set, prints the target host, and pauses 3 seconds for the operator to abort.

Also catches the seed up to features that have shipped since:
- **Sarah Chen:** rich relationship journal (Key People + Wins + 3 Entries with absolute dates) + a fresh 8-section briefing dated today.
- **Marcus Webb:** smaller journal + a 10-day-old briefing that demonstrates the staleness banner + hidden-on-card behavior.
- **Elena Vasquez & James Thornton:** medium journals.
- **Rachel Foster:** initialised journal skeleton.
- **All five active prospects:** populated `linkedinUrl` so briefing-research flows have something to follow.

New `dIso(daysFromToday)` helper produces inline `YYYY-MM-DD` strings for the journal/briefing prose so dated content stays anchored against today regardless of when the seed runs.

## 2026-04-29

### Upcoming list: 2-line layout so task content is actually readable on mobile
At 390 px viewport every Upcoming row crammed checkbox + date + time + content + contact name + day-relative onto a single flex line. The content column had `truncate min-w-0` and the others were `flex-shrink-0`, so the content got squashed — a "Check for replies on Santa Monica deal" task displayed as `Check for repl…` with the meta still visible. Useless when the whole point of Upcoming is scanning what to do next.

Restructured each row into a small meta strip on top (`4/28 · TODAY · Laurent Slutzky`, smaller and muted) and the task content on its own line below, full-width and readable. Day-relative markers (`OVERDUE`, `TODAY`, `1d`) move from screaming bold pills to inline `· Today` / `· Overdue` segments that keep their warning colors but stop dominating. Snooze hover row stays put (desktop hover only). Meeting expand chevron still aligned to the row top.

Same layout works at all widths — desktop has the same 2-line structure but everything reads even more easily.

## 2026-04-27

### Briefing + journal render markdown properly, sized for the app
The briefing page wasn't rendering markdown at all (`whitespace-pre-wrap` over the raw content). The journal page used Tailwind Typography's `prose prose-sm`, which produces big article-style typography that doesn't match the rest of the UI's compact 11–13px Montserrat aesthetic. Both pages also surfaced HTML comment placeholders from the skeleton templates (e.g. `<!-- Roster of stakeholders... -->`) directly in the read view.

New shared `<Markdown>` component in `client/src/components/markdown.tsx` is now used by both pages. It:
- Strips HTML comments before rendering, so skeleton placeholders never leak.
- Replaces `prose` with custom-sized components matching the app: 13px body, 15px title, 11px uppercase tracked section labels, teal-accented `### YYYY-MM-DD:` entries, compact bullets, teal-bordered italic blockquotes for verbatim email/transcript material, JetBrains-style inline `code`.
- Uses Montserrat throughout, inherits theme colors via `useColors()`.

### Untrack stray `.playwright-hub` artifacts
`.playwright-mcp/` is gitignored (line 6 of `.gitignore`) but four `console-*.log` files were tracked from before the rule existed. Removed via `git rm --cached` — the directory remains on disk and will keep being created by the playwright tooling, just not synced to GitHub.

### Fix: followup date edits silently revert on Save
The followup edit flow's Save button used `onMouseDown` + `e.preventDefault()` — pattern copy-pasted from the *interaction* edit flow, where it correctly prevents the input's `onBlur` from firing `handleInteractionSave` first. The followup inputs have no `onBlur`, so the `preventDefault` was unnecessary and actively broke the native `<input type="date">` picker: focus stayed on the input, the picker's value didn't always commit to React state in time, and the save handler closed over a stale `editingFollowupDate`. New date got dropped, old date persisted.

Two fixes:
- Switched the Save and Trash buttons from `onMouseDown` + `preventDefault` to plain `onClick`. The focus-trap pattern wasn't needed here.
- Added a `ref` on the date input and read its live DOM value at save time, falling back to React state. This bulletproofs against Safari's `<input type="date">` quirk where `onChange` only fires on blur — the live ref always has the committed value regardless of React batching.

Verified by manually setting the DOM input value without dispatching events (mimicking Safari's stale-state scenario) and clicking Save — date persisted correctly.

## 2026-04-23

### Fix: "days until" off-by-one for followups due tomorrow
The Upcoming list and contact-card follow-up chips used `differenceInDays` from date-fns, which measures 24-hour periods rather than calendar-day boundaries. With due dates stored at noon UTC and "now" at 8 AM PT, tomorrow's item was only ~21 hours away and rounded down to `0d` — items due tomorrow displayed as "today-ish" when they should have read `1d`. Switched both spots to `differenceInCalendarDays`, which counts midnight crossings independent of the hour-of-day. Items due 4/24 now correctly show `1d` on 4/23.

## 2026-04-20

### Briefing upgrade — research protocol, enforced 8-section format, staleness
Briefings were a single free-form blob. The agent got no guidance on what to research, no target format, no prior context beyond what it bothered to look up. Every briefing was invented from vibes.

**New MCP tool — `prepare_briefing(contactId)`.** Always call this first. Returns a JSON prep pack: the contact record (including `linkedinUrl` if set), every interaction, active + recently-completed followups, the relationship journal, any existing briefing (labeled `previousBriefing` with `ageDays` + `stale` flag), the canonical template, a `required_sections` list, and the research protocol the agent must follow before writing. The protocol tells the agent to draw on its knowledge of the user, fetch the contact's LinkedIn, web-search the person and company, cross-reference for shared ground, and re-read the journal. If a previous briefing exists, it's handed back as a starting point — agents update in place rather than rewriting.

**Canonical 8-section format, enforced server-side.** Every briefing must contain `## TL;DR → ## About them → ## About the company → ## Shared ground → ## Our history → ## What to discuss → ## Offers / asks → ## Watch-outs`, in order. `save_briefing` validates and rejects with a specific error naming missing or out-of-order sections; the REST PUT endpoint validates too, so the UI gets the same guardrail. The error message points the agent back at `prepare_briefing` for the template. UI "Start from template" prefills the 8-section skeleton on first create.

**Staleness — 7-day TTL.** A briefing stops surfacing on the contact list once it's >7 days old. The `Briefing` text link disappears from the contact card. The briefing page still renders the content with a yellow stale banner + age callout so the user can review and refresh with their agent. `get_briefing` and `prepare_briefing` both return `stale` + `ageDays` so agents know when to refresh vs. preserve.

**New contact field — `linkedinUrl`.** Optional text field on `contacts`. Exposed through `create_contact`, `update_contact`, `get_contact`, and `prepare_briefing`. Biggest research unlock for the agent: a direct pointer to the person's profile. Boot migration adds the column idempotently.

**Rewritten `get_crm_guide` → Briefings section.** The one-liner that said "store prep notes" is now a full workflow: always call prepare_briefing → research per protocol → write to template → save_briefing validates. Points at the enforced section list and the staleness rule.

`app/shared/briefing.ts` owns the contract — constants, template, validator, staleness helper — so server (MCP + REST), client (contact card + briefing page) all read the same truth.

### Contact header: text links for Briefing/Journal, quieter status
Emoji badges (📋 / 📓) are gone. Briefing and Journal now appear as plain teal text links on the right of the contact card header, matching the existing `more…` / `Show N earlier` link style already used inside the card. Much better tap targets on mobile, and consistent visual language across the row.

Stage/status pills are also gone from the header row — they took real estate for values rarely touched in the list view. Status moved to a 3px colored left-edge bar on each card: teal for `ACTIVE`, violet for `HOLD`. Stage remains changeable via the existing `/stage XXX` slash command in the note input (and drag-drop on the kanban). Status still responds to `/status ACTIVE` / `/status HOLD`.

Also removed the stale/violations warning triangle from the header — it was redundant with the violation rows rendered below the contact card and the red `OVERDUE` marker on tasks.

## 2026-04-19

### CRM Inbox Agent reference prompt + README cleanup
New `docs/agent-prompts/crm-inbox-agent.md` — a pastable prompt for scheduled agents (Claude Cowork, OpenClaw, etc.) that do a daily inbox scan and keep the CRM aligned. Covers read discipline (full threads, sent mail, CC/BCC), what to log vs. skip for LIVE clients, dedup, tool layering, briefing generation when a meeting is imminent, and terse reporting.

README cleanup while I was there:
- Tool count updated 16+ → 25+
- Journal added to the Why Claw feature list (was invisible)
- MCP Tools table updated with `peek_last_journal_entry` and `batch_append_journal`
- Entities table gained a Journal row
- New "Agent prompts" subsection linking to `docs/agent-prompts/`

### CRM skill — proactive mental model for Claude
New `skills/crm/SKILL.md` — a ~3 KB always-loaded skill that orients Claude to the CRM concept (five-layer data model, data-partition rule, when to invoke) before any tool call. Progressive disclosure: skill loads first, then Claude calls `get_crm_guide` for the detailed contract (stage enums, writing validator, section structure), then individual tools on demand.

Install paths documented in README. Claude Code: copy to `~/.claude/skills/crm/`. Claude.ai personal: paste into a Project's Custom Instructions (plugin/skill auto-install for claude.ai consumer doesn't exist yet).

The skill assumes the MCP connector is already registered; if tools are missing, it surfaces a one-line prompt telling the user to add the connector.

### MCP session durability — spec-compliant 404 for stale sessions
After every Railway redeploy, Claude clients holding an old `Mcp-Session-Id` would soft-fail: tool calls quietly returned empty or errored in a way the client couldn't recover from, forcing a manual disconnect+reconnect of the connector.

Root cause: on unknown session IDs, the route handler was silently creating a fresh transport. The new transport hadn't been initialized, so the SDK returned HTTP 400 "Server not initialized" — not the HTTP 404 that MCP clients MUST auto-re-initialize on per the 2025-06-18 StreamableHTTP spec.

Fix: stale session IDs now return `HTTP 404` with JSON-RPC error `-32001 Session not found`. Claude Desktop / Claude.ai auto-re-initialize on this exact signal. No user action needed after redeploy.

Also tightened the handshake contract:
- `initialize` with no session ID → mint a fresh session (correct).
- Non-initialize call with no session ID → 404 (was permissive).
- GET SSE stream with unknown session ID → 404 (was auto-creating a phantom transport).

### Journal UX round 2 — verbatim quotes, informal dates, scoped edits
Second batch of feedback from hands-on migration across three clients (~30 entries, ~15 rejections).

**P0 — Verbatim blockquote escape (the one real bug)**
Relative-phrase detection now skips lines wrapped in markdown blockquotes (lines starting with `>`). Verbatim quotes — client emails, meeting transcripts, draft scripts — preserve the original author's words including their relative dates. The agent's own prose outside the quote still enforces absolute dates. Dates INSIDE the quote still count toward the "substantive content needs an anchor" check, so a fully-quoted entry with an absolute date inside passes cleanly.

**P1 — Informal date formats**
Added: `early|mid|late YYYY`, `early|mid|late Q# YYYY`, `spring|summer|fall|autumn|winter YYYY`. Fuzzy anchors are how humans actually describe old events ("fall 2025 retrospective") and forcing Q# mapping loses nuance.

**P4 — Day-of-week lookahead fix**
"On Friday May 1, 2026" was rejected even though a full absolute date immediately followed. Lookahead now tolerates a trailing digit OR month name. "On Friday" alone still rejects — the trigger + bare day name remains caught.

**P6a — `peek_last_journal_entry` returns `hash`**
Now a valid `expectedHash` for `edit_journal` comes back in the peek response. No full re-read needed to chain peek → edit.

**P6b — `edit_journal` accepts optional `section` param**
Scopes the match to within one named section (`Key People`, `Wins / Case Study Material`, `Entries`, `Open Questions`, `Risks`, `Next Moves`). Replacements can't accidentally cross section boundaries; "oldString appears twice" resolves when the occurrences are in different sections. New rejection reason: `section_not_found`.

**Docs**
Agent guide now enumerates trigger words for day-of-week detection, lists every accepted absolute-date format, explains the blockquote escape, and notes that clients with stale tool caches should reconnect the MCP connector after a deploy (P2 workaround — server can't fix client-side caches).

### Journal UX fixes — feedback from first real use
Based on hands-on migration of historical notes. All server-side; no schema changes.

**Validator**
- Relative-phrase detector no longer over-fires on generic day-of-week usage. "Monday through Friday" and "Mon/Wed/Fri cadence" now pass — only trigger words (`next/this/last/by/on/until/starting/before/after/every/each/coming`) before a day name are rejected.
- Accepted date formats extended: `August 2025` (Month YYYY) and `Q3 2025` (Q# YYYY) now count as absolute dates for historical summaries where day-precision isn't realistic.
- Validation failures now return `field`, `offending`, `position`, `excerpt` (±40 chars around the match), and `acceptedFormats`. The error payload names exactly what broke; no more guessing which rule fired.
- Distinct failure reasons: `relative_phrase`, `relative_day_of_week`, `no_absolute_date`, `invalid_date` (instead of a conflated `relative_date`).

**Append flow**
- `append_journal` accepts an optional `date` (ISO YYYY-MM-DD) param for backdating migrated notes. Defaults to today.
- New `batch_append_journal` tool: submit 1–50 entries as one transactional call with per-entry `date`. Validates all-or-nothing; per-entry results returned on any failure. Designed for bulk historical imports.
- New `peek_last_journal_entry` tool: returns just the most recent dated Entry (heading + body) without re-reading the full doc.

**Read flow**
- `read_journal` accepts an optional `section` param (`Key People` | `Wins / Case Study Material` | `Entries` | `Open Questions` | `Risks` | `Next Moves`). Returns just that section; full-doc hash always returned for use with `edit_journal`.

**Destructive-edit threshold**
- Raised from 20% to 40% shrink. Removing one test entry from a small doc was triggering the confirm gate unnecessarily; cleanups now pass. Heading-mutation protection unchanged — existing dated Entries remain immutable without explicit approval.

**Optional sections**
- Agent guide and tool descriptions now formally allow `## Open Questions`, `## Risks`, `## Next Moves` as optional additions to the canonical three. Default is still Entries.

**Tool descriptions**
- Consolidated the "where does this go?" decision tree in `get_crm_guide`. Individual tool descriptions now reference it by name instead of restating — reduces drift and cuts repetition.

### Boot migrations + CI guard for schema changes (hotfix)
- **What went wrong**: PR #68's `relationship_memory` → `relationship_journal` rename landed in code but not on Railway's production DB. Railway auto-deploys code but does NOT run `drizzle-kit push`. The rules engine started crashing in prod every 15 minutes with `column relationship_memory does not exist`. CI passed because its test DB is always freshly created with the new schema — it never sees the upgrade path.
- **Fix**: `app/server/boot-migrations.ts` runs idempotent DDL on startup before `registerRoutes`. Renames the column/table/index conditionally; no-ops when already migrated.
- **Prevention**: CI now fails any PR that changes `app/shared/schema.ts` without also updating `app/server/boot-migrations.ts`. CLAUDE.md codifies the rule (idempotent, non-destructive, verified locally, dated migration entries).

## 2026-04-18

### Relationship journal — persistent per-contact narrative document (#66)
- New `relationship_journal` TEXT column on contacts: a freeform markdown document for the full living narrative of a relationship. Fourth content layer alongside `background`, `briefing`, and `interactions`. Tasks/follow-ups/interactions stay short reminders; the journal is where the detail and interpretation live.
- **Strict three-section contract**: every journal is exactly `## Key People` (roster, edit in place), `## Wins / Case Study Material` (outcomes, edit in place), and `## Entries` (append-only dated `### YYYY-MM-DD: <title>` blocks). Agent guide + tool descriptions forbid inventing new top-level sections.
- **Anti-duplication rule** baked into the agent guide: the DATE belongs to the atom (interaction/task/meeting), the MEANING belongs to the journal. Decision table + worked example guide Claude to avoid redundant writes across entities.
- MCP tools: `read_journal`, `edit_journal`, `append_journal`. `edit_journal` mirrors Claude's local Edit (exact-string match, `replaceAll`, `expectedHash` for optimistic locking). `append_journal` auto-prepends today's ISO date in the Entries section and seeds the skeleton on first call.
- MCP resource: `journal://contact/{id}/journal.md` lists every contact as a file-like resource with `text/markdown` mime.
- Absolute-date-only validator: relative phrases (`today`, `next week`, `this Friday`, etc.) are rejected with a specific error. Substantive content must include an absolute date.
- Unified destructive-edit gate: edits that shrink the doc ≥20% (and ≥500 chars) or mutate an existing `### YYYY-MM-DD:` Entry heading require `confirmed_with_user: true`.
- Full revision history in `contact_journal_revisions` (pre-write snapshots, kept forever).
- Frontend: new `/journal/:contactId` page with rich-text editor (Tiptap + `tiptap-markdown`, user never sees raw markdown syntax), read mode via `react-markdown`, history drawer with side-by-side diff and Restore, destructive-shrink confirm dialog, live SSE refresh via `journal_updated` events. Badge 📓 on every contact.
- REST endpoints: `GET/PUT /api/contacts/:id/journal`, `GET /api/contacts/:id/journal/revisions`, `GET /api/contacts/:id/journal/revisions/:revId`.

### README: 20-second hype video
- Embedded 9:16 demo GIF (`docs/hype.gif`) at the top of the README — renders inline on the repo home with native autoplay/loop
- MP4 source (`docs/hype.mp4`) kept alongside and linked for higher-quality playback

## 2026-04-16

### PR workflow: Claude owns PRs end-to-end
- Pre-PR hook no longer requires `--assignee parkervoss`
- CLAUDE.md documents the post-create flow: monitor CI, address comments, merge when green (Railway auto-deploys from main)

### Truncate long interaction notes
- Individual notes over 280 characters now collapse with a `more...` / `less` toggle so one long note can't fill the page
- Auto-expands when a search term matches inside the note, so matches stay visible

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
