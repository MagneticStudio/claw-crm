---
name: crm
description: Personal CRM for relationship management. Invoke when the user mentions contacts, pipeline, prospects, clients, leads, follow-ups, meeting prep, interactions, relationship journals, briefings, or case-study material — or when they describe a new person, event, or action that could map to a CRM entity ("I met Sarah today", "follow up with Jeff Friday", "update my notes on Acme", "prep for tomorrow's call"). Assumes the CRM MCP connector is already registered in the client.
---

# Personal CRM

You have access to a personal CRM exposed as an MCP connector. This skill tells you **when to use it** and the **mental model**. The connector itself exposes a `get_crm_guide` tool that returns the live, authoritative contract — call it first thing in any CRM-touching session, before writing anything.

## First move

```
get_crm_guide()
```

It returns the current rule set, valid enums, stage definitions, writing contract, and a live snapshot (contact counts, overdue tasks, upcoming meetings, active rule violations). Everything below is orientation; the guide is the source of truth.

## The data-partition rule — read before every write

Every piece of information has exactly ONE home. **The DATE belongs to the atom. The MEANING belongs to the journal.** If you're about to write the same sentence in two places, one of them is wrong.

## Five-layer mental model

| Layer | What it is | Shape |
|---|---|---|
| **Contact fields** | Canonical facts about the person (title, email, location, company) | One-liners, edit in place |
| **Interactions** | Past-tense atomic events — a call happened, an email went out | One sentence per row, dated |
| **Tasks / Meetings** | Forward-looking action items with due dates | Short, verb-first, ≤10 words |
| **Briefings** | Ephemeral prep for the **next specific** conversation | Bullets, upsert, overwritten each prep |
| **Relationship journal** | Everlasting narrative per contact — interpretation, strategic reads, "what it means" | Long-form markdown; sections: Key People, Wins / Case Study Material, Entries |

Interactions and tasks stay SHORT. The journal is where detail and meaning live. The journal is NOT a log of events — it's the interpretive layer on top of them.

**Worked example — a single call with a client on a given date:**

- Interaction: `<date>: 30min call with X. Discussed Q2 scope.` ← the fact, one sentence
- Task: `Send investment memo to X` due `<future-date>` ← the next action, verb-first
- Journal entry: dated narrative explaining *why* the call mattered, what was read between the lines, what to adjust in the next prep

None of those three duplicate each other.

## When to invoke this skill

- User mentions any person by name in a relationship context ("Alex said", "met with Jordan", "check in with Priya")
- User describes a future action tied to a person ("follow up", "send", "schedule", "remind me about")
- User asks about pipeline state, overdue items, upcoming meetings, prospect status
- User asks to prep for a meeting or review notes on a client
- User pastes historical notes, a transcript, or context they want preserved for someone

## Writing rules

The server enforces strict validation — **absolute dates only, no relative phrases, dated entry headings, destructive-edit gates**. Full contract (accepted date formats, trigger words, section structure, confirmation flags) is in `get_crm_guide`. Call it once per session and operate from its output.

## If the connector isn't reachable

If the CRM tools don't appear in your tool list, or calls return "tool not found," tell the user in one line:

> The CRM connector isn't registered in this Claude. Add it under Settings → Connectors using the MCP URL from your CRM deployment, then retry.

Do not attempt to install or configure the connector yourself.

## Confidentiality

Never store pricing, deal terms, or cross-reference details between clients. This is a notebook, not a deal tracker.
