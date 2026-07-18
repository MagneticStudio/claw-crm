# Claw CRM application

This directory contains the Express, React, PostgreSQL, and MCP application deployed by Claw CRM.

Start with the repository-level [README](../README.md) for Docker, Railway, Codex, Claude, and MCP onboarding. The Codex-assisted hosted deployment walkthrough is in [docs/codex-railway-deploy.md](../docs/codex-railway-deploy.md).

## Development

Run commands from this directory:

```bash
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev
```

The demo seed uses PIN `1234` and must never be run against a real CRM database.

Use `npm run build` for compilation verification. Do not use `npm run check`; it exceeds the project's normal memory budget.

## Production startup

`npm start` runs `dist/bootstrap-schema.js` before the web server:

- A truly empty database receives the base Drizzle schema once.
- An established database skips schema push and continues to idempotent boot migrations.
- An inconsistent base-schema sentinel state fails closed and requires deliberate operator repair.

Railway uses [`railway.json`](railway.json), and Docker uses [`Dockerfile`](Dockerfile); both call the same production startup path.
