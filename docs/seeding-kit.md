# Seeding kit

Distribution strategy (decided 2026-06-10): **community posts + one-click deploy**, not directories. MCP directories are overfilled with low-effort listings — the project won't shine there. People who could love Claw hang out in founder/consultant communities and on HN/X/Reddit; the job is to reach them with the story and make trying it one click.

Sequence: **1 → 2 → stagger the rest.** The one-click deploy comes first because every post should end with a link that works in 60 seconds.

## 1. Railway one-click template (~10 min, needs your account) — PREREQUISITE

1. railway.com → New → Template (composer).
2. Services: app from `MagneticStudio/claw-crm`, **root directory `app`**, plus a PostgreSQL service.
3. Variables on app: `DATABASE_URL` → `${{Postgres.DATABASE_URL}}`, `SESSION_SECRET` → generated.
4. **Pre-deploy command (required): `npx drizzle-kit push --force`.** Since the #154 hotfix, `railway.json` pins the start command to `node dist/index.js` (no schema push at boot — that's what protects YOUR production). Template users start from an empty Postgres, so without the pre-deploy push their instance has no tables. For their fresh instances the push is safe and is their schema lifecycle, same as compose self-hosters.
5. Publish, then add the button near the top of README.md:
   `[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/<TEMPLATE_CODE>)`

## 2. Publish the essay

`docs/launch-essay-draft.md` → your Substack/LinkedIn, native (not a link post). It's the spine every other post links back to. Edit to taste first — it's a draft in your voice, not final copy.

## 3. Show HN

- **Title**: `Show HN: Claw CRM – an open-source CRM where the primary user is your AI agent`
- **Text**:

> I'm a solo advisor. CRMs never stuck for me — they're built for sales teams. So I built the anti-CRM: a single scrollable notebook (Express/React/Postgres), where Claude (or any MCP-capable agent) does ~90% of the writes. A scheduled agent reads my inbox and calendar every morning and reconciles the CRM; I scroll the notebook and make decisions.
>
> The interesting part wasn't the app — it was 90 days of agent-hygiene lessons: agents over-log relentlessly; every prompt rule decays until you move it into a server-side validator; cheap writing means agents backfill retrospectives that silently corrupt timelines; "dedup" is a layer-partition problem, not string matching. All of it is encoded as rejection-with-actionable-error in the write path, so any agent on any harness writes clean data.
>
> AGPL. One-click deploy on Railway or `docker compose up`. MCP server + three skills (mental model, bulk import from your existing notes, daily sync) included. Happy to answer anything.

First comment: link the essay + the Railway button.

## 4. Reddit (staggered over ~2 weeks, one sub at a time — drafts, edit to your voice)

**r/consulting or r/freelance** — lead with the pain, tech in comments:

> **I kept my client pipeline in Apple Notes for years. So I built the anti-CRM.**
>
> Solo advisor here. Every CRM I tried was built for sales teams — dashboards, seat licenses, mandatory fields. My actual system was one messy note per client and a guilty feeling.
>
> So I built what I actually wanted: a single scrollable notebook of my whole pipeline. The twist is that my AI assistant does the data entry — it reads my inbox and calendar every morning and keeps the thing true. I scroll it with coffee and make decisions.
>
> Open-sourced it this week. If you live in Apple Notes/Notion and have an AI assistant already, this might be your thing. Link in comments.

**r/selfhosted** — lead with the deploy:

> **Claw CRM — self-hosted, AI-agent-native personal CRM (AGPL, docker compose up)**
>
> Personal CRM for solo operators with a different design center: the primary writer is your AI agent over MCP, not you. Single Express/React/Postgres app, one compose file, PIN auth, no telemetry. The server enforces the data-hygiene contract (date validators, dedup folding, destructive-edit gates), so whatever agent you point at it writes clean data. Railway one-click if you don't want to host.

**r/ClaudeAI** — lead with the agent angle:

> **I gave Claude write access to my CRM for 90 days — here's what the server had to learn to defend against**
>
> Short version: agents over-log, backfilled retrospectives corrupt timelines, and every prompt rule decays — so every rule that mattered became a server-side validator with actionable errors. The repo (AGPL) includes the MCP server (30+ tools) and the skills for daily inbox/calendar sync and bulk import from your existing notes.

## 5. X thread (skeleton — your voice)

1. I kept 30 client relationships in Apple Notes. Every CRM I tried died within a month. So I built the anti-CRM — and made my AI agent the primary user. 🧵
2. The design center: a CRM should be a notebook you scroll, not a database you maintain. One scrollable feed of every client, sorted by urgency.
3. The twist: Claude does ~90% of the writes via MCP. Every morning a scheduled agent reads my inbox + calendar and reconciles the CRM. I just read it.
4. What 90 days taught me: agents over-log relentlessly. Fix: a "will this matter in 6 months?" test, enforced server-side.
5. Prompt rules decay. Validators don't. Every rule that mattered moved from the prompt into the write path: reject with an actionable error, the agent self-corrects mid-session.
6. It's open source (AGPL). One-click deploy on Railway, or docker compose up. Bring your own agent. [link]

## 6. Indie Hackers / founder Slacks & Discords

2-sentence version + the gif: "Open-sourced the CRM my AI assistant runs for me — I scroll the notebook, it does the data entry. One-click deploy, bring your own agent."

## 7. good-first-issue labels (one CLI paste)

```bash
gh label create "good first issue" --repo MagneticStudio/claw-crm --description "Self-contained, well-scoped — great entry point for new contributors" --color 7057ff
for i in 88 97 99 101 102 103 104; do gh issue edit $i --repo MagneticStudio/claw-crm --add-label "good first issue"; done
```

## Parked: directories (deliberate non-goal)

awesome-mcp-servers, PulseMCP, and the MCP registry are deprioritized — overfilled with low-effort listings; the project won't differentiate there, and the audience intent is weaker than community channels. Revisit only if inbound users report discovering tools that way.

## Status

| Channel | Status |
|---|---|
| Railway one-click template | **next — prerequisite for all posts** |
| Essay (Substack/LinkedIn) | draft ready, needs your edit + publish |
| Show HN | ready (after template + essay) |
| Reddit (3 subs) | drafts ready, stagger |
| X thread | skeleton ready |
| IH / Slacks / Discords | blurb ready |
| Labels | one CLI paste |
| Directories | parked |
