#!/bin/bash
# Pre-PR hook: blocks gh pr create unless checklist is complete
# Receives JSON on stdin with tool_input.command
# Only activates when the command contains "gh pr create"

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# Only check for PR creation commands
if ! echo "$COMMAND" | grep -q "gh pr create"; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

ERRORS=""

# 1. Check CHANGELOG was modified on this branch vs main
CHANGELOG_CHANGED=$(git diff main --name-only 2>/dev/null | grep -c "CHANGELOG.md")
if [ "$CHANGELOG_CHANGED" -eq 0 ]; then
  ERRORS="$ERRORS CHANGELOG.md not updated."
fi

# 2. Check for recent E2E run manifest (within last 30 minutes, result = pass)
RUN_MANIFEST="e2e-screenshots/run.json"
if [ ! -f "$RUN_MANIFEST" ]; then
  ERRORS="$ERRORS No E2E run manifest — run the E2E test skill first."
elif ! find "$RUN_MANIFEST" -mmin -30 2>/dev/null | grep -q .; then
  ERRORS="$ERRORS E2E run manifest is stale (>30 min) — re-run the E2E test skill."
elif ! python3 -c "import json; d=json.load(open('$RUN_MANIFEST')); exit(0 if d.get('result')=='pass' else 1)" 2>/dev/null; then
  ERRORS="$ERRORS E2E run manifest shows failures — fix them before creating a PR."
fi

# 3. Check lint passes (errors only — warnings are OK)
cd "$CLAUDE_PROJECT_DIR/app" 2>/dev/null
npx eslint . --quiet 2>/dev/null
LINT_EXIT=$?
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null
if [ "$LINT_EXIT" -ne 0 ]; then
  ERRORS="$ERRORS Lint errors found — run 'npm run lint:fix' in app/ first."
fi

# 4. Check PR is assigned to Parker
if ! echo "$COMMAND" | grep -q "parkervoss"; then
  ERRORS="$ERRORS PR must be assigned to parkervoss (add --assignee parkervoss)."
fi

if [ -n "$ERRORS" ]; then
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Pre-PR checklist failed:${ERRORS} Fix these before creating a PR."
  }
}
EOF
  exit 0
fi

exit 0
