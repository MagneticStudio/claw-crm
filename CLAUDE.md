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
- Railway auto-deploys from main. Root directory is `app/`.
- **Railway does NOT auto-run `drizzle-kit push`.** Code deploys; schema does not. See "Schema changes" below.

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

## Schema changes (MANDATORY when touching shared/schema.ts)

Railway auto-deploys code but NOT schema. Without a migration path in the repo, the deployed code runs against a stale DB and crashes. Past incident: the memory → journal rename shipped in PR #68 ran fine locally, then broke prod because Railway's Postgres still had `relationship_memory`.

**The rule:** every PR that modifies `shared/schema.ts` MUST include a matching boot-time migration in `app/server/boot-migrations.ts`. The migration runs on every server start before `registerRoutes` and must be:

1. **Idempotent** — safe to run N times. Use `IF EXISTS` / `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DO $$ BEGIN ... END $$` guards.
2. **Non-destructive** — never DROP, TRUNCATE, or DELETE here. Destructive changes need a deliberate PR with explicit user approval, not boot code.
3. **Verified locally** — restart the dev server; logs should show `[boot-migration] <name>: ok` and the app should boot without errors.
4. **Self-documenting** — the migration's `name` field should be prefixed with the ISO date and reference the PR number.

Common shapes:
- Add column: `ALTER TABLE x ADD COLUMN IF NOT EXISTS col type;`
- Rename column: wrap in `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE ...) THEN ALTER TABLE ... RENAME COLUMN ... END IF; END $$;`
- Rename table: same pattern via `information_schema.tables`
- New table: `CREATE TABLE IF NOT EXISTS ... ( ... );`

Local dev can still use `npm run db:push` for experimentation, but the PR must carry the boot migration so prod catches up automatically. Do not rely on remembering to run `db:push` against prod — we don't have prod credentials in CI, and it's interactive anyway.

**When NOT to use a boot migration:** anything destructive (dropping columns/tables, data rewrites, constraint tightening). Those need a named migration file, explicit user approval, and a plan for rollback.

## Gotchas

- Dates: use `fmtDate` from `lib/utils.ts`. Using `format()` from date-fns causes off-by-one timezone bugs.
- Never store pricing, deal terms, or cross-reference clients.
