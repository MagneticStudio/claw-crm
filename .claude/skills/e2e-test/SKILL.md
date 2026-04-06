# E2E Test Skill

Run this skill before creating any PR. It verifies the app works end-to-end by using it as a real user and agent would.

## Prerequisites
- Dev server running (`npm run dev` from `app/`)
- Database seeded (`npm run db:seed` — PIN is 1234)
- Playwright MCP available for browser automation

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
- **Screenshot the CRM page**

### 3. UI: Add a note
- Find the first contact's input field (`placeholder*="note"`)
- Type: `E2E test note: verified app works`
- Press Enter
- Verify the note appears in the contact's timeline with today's date
- **Screenshot the contact showing the new note**

### 4. UI: Create a task (follow-up)
- In the same input, type: `/fu 12/31 E2E test task`
- Verify the command hint appears ("task ready")
- Press Enter
- Verify a task item appears with □ checkbox, `12/31`, and the text
- **Screenshot the task**

### 4b. UI: Create a meeting
- Type: `/mtg 12/25 2pm E2E test meeting @ Test Location`
- Verify the command hint appears in blue ("meeting ready")
- Press Enter
- Verify a meeting item appears with 📅 icon, `12/25 2:00 PM`, content, and location
- **Screenshot the meeting**

### 4c. UI: Edit a follow-up date
- Click on the task created in step 4 to enter edit mode
- Change the date to a different date (e.g., change from 12/31 to 1/15)
- Press Enter or click Save
- Verify the flash says "Updated"
- **Reload the page** (navigate to `/` again)
- After reload, find the same follow-up and verify the date is the NEW date, not the original
- **Screenshot the follow-up showing the persisted date change**

### 5. UI: Complete the task
- Click the square checkbox on the follow-up
- Verify the completion form appears ("Completing: ...")
- Type an outcome: `E2E test: follow-up completed successfully`
- Click Done
- Verify the follow-up disappears and the outcome appears in the timeline
- **Screenshot the timeline showing the outcome**

### 6. UI: Change stage via command
- Type `/stage PROPOSAL` in a contact's input
- Press Enter
- Verify the stage badge updates to PROPOSAL
- **Screenshot the updated badge**

### 7. MCP: Search contacts
- Call the MCP endpoint POST `/mcp/{MCP_TOKEN}` with `tools/call` → `search_contacts` (token from .env or server config)
- Verify it returns contact data with names, stages, statuses

### 8. MCP: Add interaction via agent
- Call `add_interaction` via MCP with a test note
- Navigate to the CRM page in the browser
- Verify the agent's note appears in the contact's timeline (SSE push)
- **Screenshot showing the agent-written note appeared in the UI**

### 9. MCP: Get dashboard
- Call `get_dashboard` via MCP
- Verify it returns `totalContacts`, `activeContacts`, `stageCounts`

### 10. Cleanup
- Kill the dev server
- Report: PASS or FAIL with details of any failures

## Success Criteria
All 10 steps pass. Screenshots captured for visual verification. If any step fails, fix the issue before creating the PR.

## How to Invoke
```
/e2e-test
```
Or: "Run the e2e test skill before creating this PR"
