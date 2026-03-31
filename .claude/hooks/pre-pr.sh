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

# 2. Check for recent E2E test screenshots (within last 30 minutes)
RECENT_SCREENSHOTS=$(find .playwright-mcp -name "*.png" -mmin -30 2>/dev/null | head -1)
if [ -z "$RECENT_SCREENSHOTS" ]; then
  ERRORS="$ERRORS No recent E2E test screenshots — run the E2E test skill first."
fi

# 3. Check PR is assigned to Parker
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
