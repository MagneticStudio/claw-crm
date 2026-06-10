# Contributing to Claw CRM

Thanks for your interest. Claw is an AI-native personal CRM for solo operators — and an opinionated one. Read this before opening a PR so your work lands smoothly.

## The taste test

Every change is measured against two pillars:

1. **Simplicity of UI/UX.** Claw should feel like Apple Notes, not Salesforce. Every element must earn its place. If a feature needs a settings page, a tooltip, and an onboarding step to explain, it's probably wrong for Claw.
2. **Agent connectivity.** Agents do ~90% of the writes. Anything that makes the MCP surface richer, safer, or easier for an agent to use correctly is on-thesis. Anything that assumes a human is the primary data-entry path is suspect.

When in doubt, open an issue and ask before building.

## Getting started

```bash
cd app
cp .env.example .env   # set DATABASE_URL and SESSION_SECRET
npm install
npm run db:push
npm run db:seed        # demo data, PIN: 1234
npm run dev            # http://localhost:3000
```

## Ground rules

- **Feature branches + PRs only.** Never push to main.
- **Single write path.** All mutations go through `server/storage.ts` → SSE broadcast → rules evaluation → activity log. Don't add side doors.
- **MCP tools need try/catch.** An uncaught throw crashes the session.
- **Schema changes** to `app/shared/schema.ts` must also update `app/server/boot-migrations.ts` (CI enforces this).
- **Lint clean.** `npm run lint:fix` then `npm run format`. CI runs `--max-warnings 0`.
- **Don't run `npm run check`** — it OOMs. Use `npm run build`.
- **E2E before PR.** Run the E2E skill (`.claude/skills/e2e-test/SKILL.md`). New user-facing features need new E2E steps.
- **Changelog.** Every PR adds a `CHANGELOG.md` entry.

## Good first issues

Look for the `good first issue` label — mostly self-contained UI polish (dark mode, date picker, empty states, animations) where the data model and write path are untouched.

## Conventions worth knowing

- **Stage vs status.** Stage = pipeline position (`LEAD` → `LIVE`, plus `PASS`/`RELATIONSHIP`). Status = `ACTIVE` or `HOLD`. HOLD is not a stage.
- **Follow-ups are tasks; meetings are future events.** Both live in the `followups` table, discriminated by `type`.
- **Rules are data,** stored as JSONB and CRUD-able by agents. Don't hardcode business logic.
- **Dates:** use `fmtDate` from `lib/utils.ts`. `format()` from date-fns causes off-by-one timezone bugs.
- **Style:** Montserrat, teal `#2bbcb3`, 12px radius. See `app/tailwind.config.ts`.

## License

AGPL-3.0. By contributing you agree your contributions are licensed under the same terms.
