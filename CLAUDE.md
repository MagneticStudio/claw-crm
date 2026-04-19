# CLAUDE.md

See @app/package.json for available scripts. See @app/shared/schema.ts for all enums and constants.

## Commands

IMPORTANT: All commands run from the `app/` directory.

```bash
cd app
npm run dev            # Dev server at localhost:3000
npm run build          # Verify compilation (vite + esbuild)
npm run lint:fix       # Autofix lint (type imports, const, ===)
npm run format         # Prettier format
npm run db:push        # Push schema to Postgres
npm run db:seed        # Seed demo data (PIN: 1234)
npm run test           # Playwright E2E (full suite)
npm run test -- tests/auth.spec.ts  # Single test file
```

**IMPORTANT: Never run `npm run check` (tsc --noEmit) — it OOMs. Use `npm run build` instead.**

## Architecture

- Express + React + Postgres, all source in `app/`
- Single write path: all mutations → `server/storage.ts` → SSE broadcast → rules evaluation → activity log
- MCP remote endpoint at `/mcp/:token` (StreamableHTTP). All MCP tools must have try/catch or they crash the session.
- MCP session recovery: stale session IDs auto-create fresh sessions. Don't error on unknown sessions.
- Rules are data (JSONB), not code. Agents CRUD them via MCP.
- Railway auto-deploys from main. Root directory is `app/`. Schema is NOT auto-migrated — see "Schema changes" below.

## Conventions

- Stage = pipeline position, Status = ACTIVE or HOLD. HOLD is NOT a stage. See `shared/schema.ts` for valid values.
- MCP tool `create_task` handles both follow-ups (type "task") and meetings (type "meeting").
- Follow-ups are tasks. When completed, log the outcome as an interaction.
- Meetings are future events. After they happen, log as an interaction.
- Feature branches + PRs only. **Never push to main.**
- Style: see @app/tailwind.config.ts for theme. Montserrat font, teal (#2bbcb3), 640px max-width, 12px border-radius. Keep UI minimal — every element must earn its place.

## Code quality

- Run `npm run lint:fix` after changes, `npm run format` after new files or large edits.
- CI runs `--max-warnings 0` — fix all warnings before pushing.
- Prefer `unknown` with type narrowing over `any` for new code. Prefix unused params with `_`.

## Before submitting a PR

1. **If the PR adds a major feature, add new E2E steps to `.claude/skills/e2e-test/SKILL.md` covering key flows BEFORE running tests.** This is not optional — every user-facing feature must have E2E coverage.
2. Run the E2E test skill (`.claude/skills/e2e-test/SKILL.md`). Do not create PR if any step fails.
3. Update README.md if architecture, tools, or workflows changed.
4. Add a CHANGELOG.md entry.

## After creating a PR

Don't assign reviewers — instead, own the PR through merge:

1. Monitor CI (`gh pr checks <num> --watch` or poll with `gh pr checks <num>`).
2. If CI fails, read the failing job logs, fix the cause, and push again.
3. If reviewers leave comments, read them (`gh api repos/MagneticStudio/claw-crm/pulls/<num>/comments`), respond or address, and push fixes.
4. Once CI is green and there are no unresolved comments, merge to main (`gh pr merge <num> --squash --delete-branch`). Railway auto-deploys from main.

## Schema changes

Every PR that modifies `app/shared/schema.ts` MUST also update `app/server/boot-migrations.ts` (CI enforces this). Railway does NOT auto-run `drizzle-kit push`. See @.claude/docs/schema-changes.md.

## Gotchas

- Dates: use `fmtDate` from `lib/utils.ts`. Using `format()` from date-fns causes off-by-one timezone bugs.
- Never store pricing, deal terms, or cross-reference clients.
