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
- Verify a meeting item appears with 📅 icon, `12/25 2:00 PM`, content, and location
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

### 6. UI: Change stage via command
- Type `/stage PROPOSAL` in a contact's input
- Press Enter
- Verify the stage badge updates to PROPOSAL
- **Screenshot** → `e2e-screenshots/07-stage-changed.png`

### 7. UI: Search contacts (Cmd+K)
- Click the search icon (magnifying glass) in the header, OR press Cmd+K
- Verify the header switches to an inline search input with a close (X) button
- Verify the Upcoming panel is hidden
- Type a known contact's first name (at least 2 characters)
- Verify the contact list filters in real-time to show only matching contacts
- **Screenshot** → `e2e-screenshots/09-search-by-name.png`

### 7b. UI: Search by interaction/followup content
- Clear the search and type a word that appears in a contact's interaction note or followup (not in any contact name)
- Verify matching contacts appear with a teal snippet line below the contact name
- Verify the snippet shows the field label (e.g., "Note:", "Task:") and the matched term highlighted in yellow
- **Screenshot** → `e2e-screenshots/10-search-snippet.png`

### 7c. UI: Exit search
- Press Escape or click the X button
- Verify the header returns to showing the org name and icons
- Verify the Upcoming panel reappears (if there are upcoming items)
- Verify the previous stage filter is restored
- **Screenshot** → `e2e-screenshots/11-search-exited.png`

### 8. MCP: Search contacts
- Get the MCP token: `curl -s -b <cookie-jar> http://localhost:3000/api/settings | python3 -c "import sys,json; print(json.load(sys.stdin)['mcpToken'])"`
- Initialize MCP session with `method: "initialize"` (must include `Accept: application/json, text/event-stream` header)
- Call `search_contacts` with a known contact name
- Verify response contains `results` array with contact data (name, stage, status) and `totalCount`

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
- Call `append_journal` again with `body: "follow up next week"` (intentionally relative). Verify `ok: false` and `reason: "relative_date"` naming the phrase `next week`.
- Call `edit_journal` with a stale `expectedHash` (e.g. `"0"`). Verify `ok: false`, `reason: "hash_conflict"`.
- Call `edit_journal` to mutate an existing `### YYYY-MM-DD:` heading without `confirmed_with_user`. Verify `ok: false`, `reason: "destructive_edit"`. Retry with `confirmed_with_user: true` — verify it succeeds.
- **Screenshot** → `e2e-screenshots/13-mcp-journal.png` (the CRM page showing the journal badge 📓 on the contact)

### 10c. UI: View, edit, and restore journal
- From the CRM page, click the 📓 badge next to a contact (dim if empty, full opacity if populated). Should navigate to `/journal/<id>`.
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
