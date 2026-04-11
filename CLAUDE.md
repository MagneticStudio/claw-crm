# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
```bash
cd app
npm run dev          # Dev server at localhost:3000
npm run build        # Production build (vite + esbuild) — USE THIS to verify code compiles
npm run lint         # ESLint check (errors fail, warnings OK)
npm run lint:fix     # ESLint autofix (type imports, const, var, ===)
npm run format       # Prettier format all source files
npm run db:push      # Push schema to Postgres (drizzle-kit)
npm run db:seed      # Seed database (PIN: 1234)
npm run test         # Playwright E2E tests
```

**Do NOT run `npm run check` (tsc --noEmit).** It OOMs on this machine even at 8GB heap. Use `npm run build` instead — esbuild catches import/syntax errors and is what Railway uses for deploys.

## Architecture
- Express + React + Postgres, all source in `app/`
- Single write path: all mutations go through `server/storage.ts` → SSE broadcast → rules evaluation → activity log
- MCP remote endpoint at `/mcp/:token` (StreamableHTTP). All tools must have try/catch or they crash the session.
- Rules are data (JSONB in `rules` table), not code. Agents CRUD them via MCP.

## Conventions
- Stage = pipeline position: LEAD → MEETING → PROPOSAL → NEGOTIATION → LIVE → PASS, plus RELATIONSHIP
- Status = ACTIVE or HOLD. HOLD is NOT a stage.
- Valid values for stages, statuses, etc. are defined as shared constants in `shared/schema.ts`.
- Feature branches + PRs only. Never push to main.
- MCP tool `create_task` handles both follow-ups (type "task") and meetings (type "meeting").
- Follow-ups are tasks. When completed, log the outcome as an interaction.
- Meetings are future events. After they happen, log as an interaction.
- Style: Montserrat font, teal palette (#2bbcb3), 640px max-width, 12px border-radius cards.

## Code quality
- Run `npm run lint:fix` after making changes. It autofixes type imports, const/let, and equality operators.
- Run `npm run format` if you've written new files or made large edits.
- The pre-PR hook checks lint passes. Fix lint errors before creating a PR.
- `@typescript-eslint/no-explicit-any` is a warning. Prefer `unknown` with type narrowing for new code, but don't refactor existing `any` unless specifically asked.
- Prefix unused parameters with `_` (e.g., `_req`, `_err`) to satisfy no-unused-vars.

## Before submitting a PR
1. Run the E2E test skill (`.claude/skills/e2e-test/SKILL.md`): start dev server, test UI + MCP flows, screenshot each step. Do not create PR if any step fails.
2. Update README.md if the PR changes architecture, adds tools, or changes how things work.
3. Add a CHANGELOG.md entry describing what changed.

## Watch out for
- Dates render in UTC (fmtDate in `lib/utils.ts`). Using `format()` from date-fns causes off-by-one timezone bugs.
- MCP session recovery: stale session IDs auto-create fresh sessions. Don't error on unknown sessions.
- Railway auto-deploys from main. Root directory is `app/`.
- Never put pricing or deal terms in the CRM. Never cross-reference clients.
