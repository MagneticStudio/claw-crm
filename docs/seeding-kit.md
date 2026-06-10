# Seeding kit

Ready-to-paste submissions for every distribution channel. Each section is one founder action — copy, paste, send. Keep this file updated as channels respond.

## 1. awesome-mcp-servers (PR to punkpeye/awesome-mcp-servers)

Add under **📇 Customer Data Platforms** (or **🗄️ Databases** if CDP section absent), alphabetical order:

```markdown
- [MagneticStudio/claw-crm](https://github.com/MagneticStudio/claw-crm) 📇 ☁️/🏠 - AI-native personal CRM for solo operators. Notebook-style pipeline with a 30+ tool MCP server: contacts, interactions, tasks, meeting briefings, relationship journals with server-enforced writing rules, and a rules engine agents can CRUD.
```

## 2. PulseMCP (pulsemcp.com/submit)

- **Name**: Claw CRM
- **URL**: https://github.com/MagneticStudio/claw-crm
- **Category**: CRM / Productivity
- **Description** (short): Open-source personal CRM built for AI agents. Remote MCP (StreamableHTTP) + local stdio. 30+ tools with server-enforced data hygiene: agents log interactions, manage tasks and meetings, write relationship journals (absolute-dates validator, revision history), build meeting briefings, and manage automation rules stored as data. `docker compose up` to self-host.

## 3. Show HN

- **Title**: `Show HN: Claw CRM – an open-source CRM where the primary user is your AI agent`
- **Text**:

> I'm a solo advisor. CRMs never stuck for me — they're built for sales teams. So I built the anti-CRM: a single scrollable notebook (Express/React/Postgres), where Claude (or any MCP-capable agent) does ~90% of the writes. A scheduled agent reads my inbox and calendar every morning and reconciles the CRM; I scroll the notebook and make decisions.
>
> The interesting part wasn't the app — it was 90 days of agent-hygiene lessons: agents over-log relentlessly; every prompt rule decays until you move it into a server-side validator; cheap writing means agents backfill retrospectives that silently corrupt timelines; "dedup" is a layer-partition problem, not string matching. All of it is encoded as rejection-with-actionable-error in the write path, so any agent on any harness writes clean data.
>
> AGPL, docker compose up to run, MCP server + three skills (mental model, bulk import from your existing notes, daily sync) included. Happy to answer anything.

(Publish the essay first if possible and link it in the first comment: `docs/launch-essay-draft.md`.)

## 4. MCP Registry (registry.modelcontextprotocol.io)

The registry indexes installable servers. Claw's remote MCP is per-deployment (each user's own URL + token), so list the **local stdio client**:
- Run `mcp-publisher init` in repo root, point `server.json` at `app/server/mcp-client.ts` usage (`npx tsx .../mcp-client.ts` with `CRM_URL`/`CRM_API_KEY` env), namespace `io.github.magneticstudio/claw-crm`, then `mcp-publisher publish` (GitHub auth).

## 5. Railway marketplace template (~10 min, needs your account)

1. railway.com → New → Template (composer).
2. Services: app from `MagneticStudio/claw-crm` repo, **root directory `app`**, plus a PostgreSQL service.
3. Variables on app: `DATABASE_URL` → `${{Postgres.DATABASE_URL}}`, `SESSION_SECRET` → generated.
4. Start command default (`npm start`); pre-deploy command `npx drizzle-kit push --force` (or rely on Docker CMD if using the Dockerfile builder).
5. Publish; then add the "Deploy on Railway" button markdown to README:
   `[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/<TEMPLATE_CODE>)`

## 6. good-first-issue labels (permission-gated for agents)

```bash
gh label create "good first issue" --repo MagneticStudio/claw-crm --description "Self-contained, well-scoped — great entry point for new contributors" --color 7057ff
for i in 88 97 99 101 102 103 104; do gh issue edit $i --repo MagneticStudio/claw-crm --add-label "good first issue"; done
```

## 7. Community posts (after HN, staggered)

- **r/consulting / r/freelance**: lead with the pain ("I kept clients in Apple Notes until..."), not the tech. Link the essay, mention open source + self-host in comments.
- **Fractional-exec / solo-consultant Slack & Discord groups**: 2-sentence version + gif.
- **LinkedIn/Substack**: the essay itself, native.

## Status

| Channel | Status |
|---|---|
| awesome-mcp-servers | ready to PR |
| PulseMCP | ready to submit |
| Show HN | ready (publish essay first) |
| MCP Registry | needs `mcp-publisher` run |
| Railway template | needs account flow |
| Labels | needs one CLI paste |
| Community posts | after HN |
