# E2E Test Skill

Run this skill before creating any PR. It verifies the app works end-to-end by using it as a real user and agent would.

## Prerequisites
- Dev server running (`npm run dev` from `app/`)
- Database seeded (`npm run db:seed` — PIN is 1234)
- Claude-in-Chrome browser extension (primary). Playwright MCP is a fallback only.

## Screenshot Protocol

Before running any steps, wipe the screenshot directory and start fresh:
```bash
rm -rf e2e-screenshots && mkdir -p e2e-screenshots
```

Name every screenshot by step number and description:
- `e2e-screenshots/01-crm-loaded.png`
- `e2e-screenshots/02-note-added.png`
- `e2e-screenshots/03-task-created.png`
- etc.

After all steps complete, write a manifest file:
```bash
# e2e-screenshots/run.json
{
  "branch": "<current git branch>",
  "timestamp": "<ISO 8601>",
  "steps": {
    "01-crm-loaded": "pass",
    "02-note-added": "pass",
    ...
  },
  "result": "pass"   // or "fail"
}
```

The pre-PR hook validates this manifest exists and is recent.

## Steps

### 1. Start dev server
```bash
cd app && npm run dev &
sleep 6
curl -s http://localhost:3000/api/user  # should return 401 (not authenticated)
```

### 2. UI: Login with PIN
- Navigate to `http://localhost:3000`
- Should redirect to `/auth` with "MAGNETIC ADVISORS" and "Enter PIN"
- Enter PIN `1234`, click Unlock
- Should see the CRM page with contacts loaded
- **Screenshot** → `e2e-screenshots/01-crm-loaded.png`

### 3. UI: Add a note
- Find the first contact's input field (`placeholder*="note"`)
- Type: `E2E test note: verified app works`
- Press Enter
- Verify the note appears in the contact's timeline with today's date
- **Screenshot** → `e2e-screenshots/02-note-added.png`

### 3b. UI: Long note truncation with more/less toggle
- In the same contact's input, paste a long note (>280 chars), e.g. repeat a sentence until it exceeds 280 characters: `E2E long note test. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit.`
- Press Enter
- Verify the rendered note ends in `…` followed by a `more...` button (teal link)
- Click `more...` — verify the full note is revealed and the button now reads `less`
- Click `less` — verify the note collapses back to the truncated form
- **Screenshot** → `e2e-screenshots/02b-note-truncation.png`

### 4. UI: Create a task (follow-up)
- In the same input, type: `/fu 12/31 E2E test task`
- Verify the command hint appears ("task ready")
- Press Enter
- Verify a task item appears with □ checkbox, `12/31`, and the text
- **Screenshot** → `e2e-screenshots/03-task-created.png`

### 4b. UI: Create a meeting
- Type: `/mtg 12/25 2pm E2E test meeting @ Test Location`
- Verify the command hint appears in blue ("meeting ready")
- Press Enter
- Verify a meeting item appears with 📅 icon, `12/25 2pm` (time renders as typed — the parser stores the raw token), content, and location
- **Screenshot** → `e2e-screenshots/04-meeting-created.png`

### 4c. UI: Edit a follow-up date
- Click on the task created in step 4 to enter edit mode
- Change the date to a different date (e.g., change from 12/31 to 1/15)
- Press Enter or click Save
- Verify the flash says "Updated"
- **Reload the page** (navigate to `/` again)
- After reload, find the same follow-up and verify the date is the NEW date, not the original
- **Screenshot** → `e2e-screenshots/05-date-edit-persisted.png`

### 5. UI: Complete the task
- Click the square checkbox on the follow-up
- Verify the completion form appears ("Completing: ...")
- Type an outcome: `E2E test: follow-up completed successfully`
- Click Done
- Verify the follow-up disappears and the outcome appears in the timeline
- **Screenshot** → `e2e-screenshots/06-task-completed.png`

### 5b. UI: Cmd+K full-text search
- Press **Cmd+K** (or Ctrl+K) anywhere on the CRM page. Verify the org name in the header is replaced by a search input with placeholder "Search contacts, interactions, tasks…" and that the Stage Filter icon is hidden (Menu icon stays).
- Type a contact's first name (e.g. `sarah`). Verify the contact list filters down to matches with that contact at the top.
- Clear the input. Type a distinctive word that appears in one contact's interaction or task content (e.g. `kicking` for Sarah Chen in the seed data). Verify only the contact whose body contains that word appears.
- Press **ArrowDown** twice. Verify the 2nd result gets a teal ring (3px box-shadow) and scrolls into view if off-screen. Press **ArrowUp** — highlight moves back.
- Press **Enter** — the input blurs but the filtered list and the query persist.
- Press **Esc** — the search collapses, the query clears, and the full contact list is restored.
- Apply a stage filter (e.g. PROPOSAL only), then open search and type a query — verify results ignore the stage filter (search overrides stage filter).
- **Screenshot** → `e2e-screenshots/06b-search-body-match.png`

### 6. UI: Change stage via command
- Type `/stage PROPOSAL` in a contact's input
- Press Enter
- Verify the flash "Stage → PROPOSAL" appears on the contact's card (briefly)
- Switch the top stage filter to `PROPOSAL` and verify the contact now appears in that list
- **Screenshot** → `e2e-screenshots/07-stage-changed.png`

### 6b. UI: Briefing/Journal text links and status bar
- On the contact list, verify each contact card has:
  - A 3px colored bar on its left edge (teal for ACTIVE, violet for HOLD)
  - A `Journal` text link on the right of the header row — teal if the relationship journal is populated, muted gray if empty
  - A `Briefing` text link on the right of the header row **only when a briefing exists AND it's <7 days old** for that contact
- Click the `Journal` link for a contact — verify it navigates to `/journal/<id>`
- Navigate back; click the `Briefing` link for a contact that has one — verify it navigates to `/briefings/<id>`
- Verify the stage pill and status pill appear on the header row before the Briefing/Journal links (restored in PR #142) — tinted rounded pills; no emoji badges
- **Screenshot** → `e2e-screenshots/07b-header-links.png`

### 6c. UI: Briefing template + validation + staleness
- Navigate to `/briefings/<id>` for a contact without a briefing. Verify the empty state reads "No briefing yet" and shows a **Start from template** button. Click it.
- Verify the textarea prefills with the 8-section skeleton (`## TL;DR` → `## About them` → `## About the company` → `## Shared ground` → `## Our history` → `## What to discuss` → `## Offers / asks` → `## Watch-outs`), monospace, HTML comments acting as placeholders.
- Edit one section and click **Save**. Verify it persists.
- Now test validation: edit the briefing, delete the `## Watch-outs` section, click Save. Verify the save is rejected with a red error box naming the missing section and telling you to call `prepare_briefing`.
- Fabricate a stale briefing (age > 7 days) — via DB: `UPDATE briefings SET updated_at = NOW() - INTERVAL '8 days' WHERE contact_id = <id>;`
- Reload `/briefings/<id>`. Verify a yellow **Stale** banner appears above the briefing: "Stale — last updated 8 days ago. Briefings older than 7 days stop surfacing on contact cards."
- Navigate back to the contact list (`/`). Verify the `Briefing` text link on that contact's card is **gone** (the Journal link is still there).
- **Screenshot** → `e2e-screenshots/07c-briefing-template-and-staleness.png`

### 6d. MCP: prepare_briefing + save_briefing validation
- Call `prepare_briefing` via MCP with a known contactId. Verify the response JSON includes: `contact` (with `linkedinUrl` field), `interactions`, `activeFollowups`, `recentlyCompletedFollowups`, `journal`, `previousBriefing` (with `content`, `updatedAt`, `ageDays`, `stale`) if one exists, `template`, `research_protocol`, `required_sections`, and `instructions`.
- Call `save_briefing` via MCP with malformed content (e.g. missing sections). Verify `isError: true` and the error text enumerates every missing section plus the canonical order.
- Call `save_briefing` via MCP with content that has all 8 sections out of order. Verify `isError: true` and the error names the first out-of-order header.
- Call `save_briefing` via MCP with a valid 8-section briefing. Verify it succeeds.
- Call `get_briefing` via MCP on the contact. Verify the response JSON includes `content`, `updatedAt`, `ageDays`, and `stale: false`.

### 6e. UI: Create a contact via the + button
- On the CRM page (desktop width), verify a **UserPlus icon button** (`aria-label="Add contact"`) appears in the header between the search icon and the stage-filter icon.
- Resize to mobile width (≤640px): verify the header button is hidden and a **56px round teal FAB** (`aria-label="Add contact"`) appears fixed bottom-right. Resize back to desktop.
- Click the header Add contact button. Verify a bottom sheet (`data-testid="add-contact-sheet"`) slides up with fields: First name, Last name, Company, Title, Email, LinkedIn URL, and an **Add contact** submit button (disabled until First name has text).
- Fill First name `E2E`, Last name `Contact`, Company `E2E Test Co`, click **Add contact**.
- Verify the sheet closes and a new contact card "E2E Contact" appears in the list with company "E2E Test Co" (find-or-create company path: POST /api/contacts with `companyName`).
- Create a second contact with the same company name `E2E Test Co` — verify via API or DB that both contacts share one company row (no duplicate company created).
- **Screenshot** → `e2e-screenshots/08-contact-created.png`

### 6f. UI: Desktop master-detail layout (≥1024px)
- At a 1280px viewport in list view, verify the page is two-pane: a left rail (`data-testid="contact-rail"`, ~360px) of compact contact rows (name + company + stage tag + status edge bar) with the Upcoming strip above it, and a right detail pane (`data-testid="contact-detail"`) showing ONE full contact card.
- Verify the first displayed contact is selected by default (teal-highlighted row, its card in the detail pane).
- Click a different row — verify the detail pane switches to that contact and the row highlights.
- In the detail pane, add a note via the input — verify it lands on the selected contact.
- Open search (Cmd+K), type a contact name, press ArrowDown then Enter — verify the highlighted result becomes the selected contact in the detail pane.
- Switch to kanban view at 1280px: verify all six stage columns render side by side (no stacked pairs). Click a kanban card — verify it switches to list view with that contact selected in the detail pane.
- Resize to 800px — verify the classic single-column card list returns (no rail, no detail pane). Resize to 390px — single column persists (mobile unchanged).
- **Screenshot** → `e2e-screenshots/09-master-detail.png`

### 9. MCP: Add interaction via agent
- Call `add_interaction` via MCP with a test note
- Navigate to the CRM page in the browser
- Verify the agent's note appears in the contact's timeline (SSE push)
- **Screenshot** → `e2e-screenshots/12-mcp-agent-note.png`

### 10. MCP: Get dashboard
- Call `get_dashboard` via MCP
- Verify it returns `totalContacts`, `byStage`, `overdueTasks`, and `activeViolations`

### 10b. MCP: Read, append, and edit relationship journal
- Call `read_journal` with a known `contactId`. Verify the response JSON includes `content`, `hash`, `initialized`, and `sizeBytes`. For a fresh contact, `initialized` should be false and `content` should be the seeded skeleton.
- Call `append_journal` with that contactId, `title: "E2E seed entry"`, `body: "Logged from E2E on 2026-04-18. Confirmed live server accepts append."`. Verify `ok: true`, `seeded: true`, and `entryHeading` matches `### YYYY-MM-DD: E2E seed entry`.
- Call `append_journal` again with `body: "follow up next week"` (intentionally relative). Verify `ok: false` and `reason: "relative_phrase"` with `offending: "next week"`.
- Same-day fold: call `append_journal` again with `title: "E2E same-day follow"`, `body: "Second event on 2026-04-18. Should fold under the existing H3."`, `date: "2026-04-18"` (matching the seed entry's date). Verify `ok: true`, `foldedInto` is present and equals the seed entry's `### 2026-04-18: …` heading, and `entryHeading` is that same H3 (not a new sibling). Then call `read_journal` and verify the doc contains exactly ONE `### 2026-04-18:` heading followed by an `#### E2E same-day follow` subheading.
- Call `edit_journal` with a stale `expectedHash` (e.g. `"0"`). Verify `ok: false`, `reason: "hash_conflict"`.
- Call `edit_journal` to mutate an existing `### YYYY-MM-DD:` heading without `confirmed_with_user`. Verify `ok: false`, `reason: "destructive_edit"`. Retry with `confirmed_with_user: true` — verify it succeeds.
- **Screenshot** → `e2e-screenshots/13-mcp-journal.png` (the CRM page showing the teal `Journal` link on the contact)

### 10c. UI: View, edit, and restore journal
- From the CRM page, click the `Journal` text link next to a contact (muted gray if empty, teal if populated). Should navigate to `/journal/<id>`.
- Verify the journal renders as formatted text (no `**`, `#`, or `[` visible in the rendered view).
- Click Edit → the Tiptap editor appears. Make a small change (add a bold phrase via toolbar or add a sentence).
- Click Save → confirm content persists (reload page, change still visible).
- **Screenshot** → `e2e-screenshots/14-journal-edited.png`
- Click History → the revisions drawer appears with entries tagged `agent` or `user` and timestamps.
- Click a revision → the diff view renders with added (green) and removed (red) lines inline.
- **Screenshot** → `e2e-screenshots/15-journal-diff.png`
- Click Restore this version → confirm the modal, verify the earlier content is restored as a new revision (history list grows; prior content still in list).

### 10d. UI: Destructive-edit confirm
- Enter edit mode on a journal with substantial content (at least ~50 chars).
- Select all and delete most of it (leaving <50% of prior length).
- Click Save → the browser confirm dialog should fire naming the shrink percentage. Click Cancel → nothing persists. Click Save again → the UI only proceeds past confirm.
- **Screenshot** → `e2e-screenshots/16-journal-destructive-confirm.png`

### 11. Cleanup
- Kill the dev server
- Write `e2e-screenshots/run.json` manifest with branch, timestamp, and per-step results
- Report: PASS or FAIL with details of any failures

## Success Criteria
All 11 steps (including 10b–10d) pass. Screenshots captured for visual verification. If any step fails, fix the issue before creating the PR.

## How to Invoke
```
/e2e-test
```
Or: "Run the e2e test skill before creating this PR"
