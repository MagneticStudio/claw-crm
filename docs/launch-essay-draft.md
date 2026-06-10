# I let Claude run my CRM for 90 days. Here's what broke, and what I had to build.

*By Alex Furmansky — founder of [Claw CRM](https://github.com/MagneticStudio/claw-crm), an open-source, AI-native personal CRM for solo operators.*

I'm a solo advisor. Like most solo consultants, my "CRM" used to be a notes app: one messy document per client, a calendar, and a guilty feeling that I was forgetting someone. Real CRMs never stuck — they're built for sales teams with managers and dashboards and seat licenses, not for one person managing thirty high-touch relationships.

So I built the anti-CRM: a single scrollable notebook backed by Postgres, with one unusual design decision — **the primary user is not me. It's my AI agent.** Claude connects over MCP and does ~90% of the writes: it reads my inbox and calendar every day and keeps the CRM true. I scroll the notebook every morning and make decisions.

Ninety days of daily agent-driven usage later, I have learnings I haven't seen written down anywhere. Most writing about AI agents covers demos. This is what happens in week six.

## 1. Agents over-log. Relentlessly.

Left to its own judgment, an agent logs *everything*: the calendar reschedule, the "thanks, got it" reply, the Calendly confirmation, the OOO notice. Each one is locally defensible — "something happened, I recorded it." Collectively they drown the signal the CRM exists to preserve.

The fix wasn't a better prompt; it was a **test**: *"Will this matter to the relationship six months from now?"* If the agent can't complete the sentence "this matters because…", it doesn't write. We also made the default explicit: **when in doubt, don't log.** Re-running a sync catches missed signal cheaply; pruning noise is expensive.

## 2. Every prompt rule decays. Server validation doesn't.

This is the most important thing we learned, and it reshaped the architecture.

We'd add a rule to the agent's instructions — "use absolute dates," "don't duplicate sections," "one journal entry per day." It would work for a week. Then a long context, a model update, or an unusual input would produce the old failure again. Prompt rules are suggestions; under pressure, suggestions decay.

So every rule that mattered migrated into the server as a validator that **rejects the write with an actionable error**:

- Relative dates ("next week") in the permanent journal → rejected with the offending phrase named
- A second journal entry on the same date → folded into the first as a subheading, automatically
- A forward-looking "should follow up" written as a past-tense event → rejected, told to create a task instead
- An entry title that duplicates the date the server already prepends → scrubbed
- A briefing missing one of its eight canonical sections → rejected with the section named
- An edit that would silently delete most of a document → blocked behind an explicit confirmation flag

The pattern: **treat the agent like a brilliant, occasionally careless intern, and make the database the editor that never tires.** A mediocre agent on any platform now writes clean data, because dirty data doesn't get accepted. That's also what makes the system harness-agnostic — the discipline lives in the contract, not in any one model's prompt.

## 3. Timelines get distorted by retrospectives

An agent summarizing "Q1 of last year" would dutifully date the entry to last January — and silently rewrite history, burying it under a year of newer entries where no one would ever see it was written *today*. We had to give retrospective content its own home (an "Engagement History" section, edited in place, no dates required) and keep the dated timeline strictly for things that happened on the date they claim.

Humans don't make this mistake because writing is expensive for us. Agents write cheaply, so they backfill — and backfilling corrupts timelines unless the schema refuses it.

## 4. The meetings layer rots unless it's curated

The CRM let agents log meetings, so agents logged *all* meetings — every weekly 1:1, every standup. Sounds harmless until you realize meeting-prep briefings are scoped to "the next meeting on this contact." Pollute the meetings layer with recurring cadences and the agent preps for the wrong conversation every time.

The rule that fixed it: **the calendar already holds every event; the CRM holds only relationship-moving moments.** The test is two questions — *will I prepare differently than last time, AND will what happens move the relationship?* Both yes → log it. Either no → skip. Operational meetings from old runs get deleted on sight.

## 5. Dedup is a layer-partition problem, not a string-matching problem

Naive duplicate writes (same sentence twice) are rare. The real duplication is *cross-layer re-narration*: the same event as an interaction, then again as a longer journal entry, then a "summary note" paraphrasing the email it just logged. Three different strings; one event; three records.

The fix is a partition rule the agent must answer before every write: **the date belongs to the atom; the meaning belongs to the journal.** One event, one home per layer. The interaction is one past-tense sentence; the journal references it by date and goes straight to interpretation. If you're about to write the same sentence in two places, one of them is wrong.

## 6. The unlock isn't the chat. It's the unattended sync.

For the first month I used the CRM conversationally — "log my call with Jordan." Useful, but it didn't change my life; I was still the data-entry mechanism, just with extra steps.

The step-change came from a **scheduled sync agent**: every morning it reads the last day of inbox (sent mail included — your own replies are the most informative events), the next 48 hours of calendar, reconciles everything against the CRM, builds briefings for tomorrow's meetings, and ends with a short action-first report: `DECIDE: Acme accepted the proposal — move to NEGOTIATION?` / `FLAG: new stakeholder cc'd, no contact exists.`

I stopped doing data entry entirely. The CRM became true *without me* — and the morning notebook scroll became the entire workflow.

## What this adds up to

If you're building anything agents write to, the transferable lessons:

1. **Make the store enforce the contract.** Prompts decay; validators don't.
2. **Give every kind of information exactly one home**, and reject writes that blur the partition.
3. **Default agents to silence.** Re-runs are cheap; noise is expensive.
4. **Curate, don't mirror.** An agent that copies a data source (calendar, inbox) into your system adds nothing but bulk.
5. **Errors are prompts.** A rejected write with a precise, actionable message teaches the agent mid-session. The error channel is your best instruction channel.

Claw CRM is open source (AGPL) — Express + React + Postgres, with a full MCP server, the rules engine, and the three skills (mental model, bulk import, scheduled sync) included: **github.com/MagneticStudio/claw-crm**. `docker compose up` and you're running in two minutes. Bring your own agent.
