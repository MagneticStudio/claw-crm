# Schema changes

Railway auto-deploys code but NOT schema. Without a migration path in the repo, the deployed code runs against a stale DB and crashes. Past incident (2026-04-19): the `relationship_memory` → `relationship_journal` rename shipped in PR #68 ran fine locally, then broke prod because Railway's Postgres still had `relationship_memory`. CI didn't catch it — CI's test DB is always freshly created with the new schema, so it never exercises the upgrade path.

## The rule

Every PR that modifies `app/shared/schema.ts` MUST include a matching entry in `app/server/boot-migrations.ts`. CI enforces this (see `.github/workflows/ci.yml`).

The migration runs on every server start before `registerRoutes`. It must be:

1. **Idempotent** — safe to run N times. Use `IF EXISTS` / `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DO $$ BEGIN ... END $$` guards.
2. **Non-destructive** — never `DROP`, `TRUNCATE`, or `DELETE` here. Destructive changes go through a deliberate PR with explicit user approval, not boot code.
3. **Verified locally** — restart the dev server; logs should show `[boot-migration] <name>: ok` and the app should boot without errors.
4. **Self-documenting** — the migration's `name` field prefixed with the ISO date and the PR number.

## Common shapes

**Add column:**
```sql
ALTER TABLE x ADD COLUMN IF NOT EXISTS col type;
```

**Rename column:**
```sql
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'x' AND column_name = 'old_col'
  ) THEN
    ALTER TABLE x RENAME COLUMN old_col TO new_col;
  END IF;
END $$;
```

**Rename table:** same pattern via `information_schema.tables`.

**New table:**
```sql
CREATE TABLE IF NOT EXISTS ... ( ... );
```

## When NOT to use a boot migration

Anything destructive — dropping columns or tables, data rewrites, constraint tightening that can fail on existing rows. Those need a named migration file, explicit user approval, and a plan for rollback.

## Dev-time workflow

Local dev can still use `npm run db:push` for experimentation. The PR must carry the boot migration so prod catches up automatically on the next Railway deploy. Do not rely on remembering to run `db:push` against prod — we don't have prod credentials in CI, and `db:push` is interactive anyway.

## Long-term direction

The boot-migrations pattern is the minimum viable fix. The cleaner path is committed `drizzle-kit generate` migration files that run via `drizzle-kit migrate` on deploy. Consider when the migration list gets unwieldy or when we need destructive migrations with rollback.
