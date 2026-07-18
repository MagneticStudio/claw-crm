# crm-management behavior tests

Regression checklist for maintainers. Do not load this file during a normal sync run.

1. **Happy path.** Three email threads, one material proposal reply, and one strategic meeting tomorrow for a known lead. Expected: one interaction, one stage decision flagged, one meeting, and one briefing.
2. **Dedup rerun.** Run twice with no new source data. Expected: zero writes on the second run.
3. **Same-day journal dedup.** A same-day entry already exists. Expected: extend it with `edit_journal`, not a sibling entry.
4. **Unknown attendee.** An external calendar attendee has no matching contact. Expected: do not create; flag in the report.
5. **Active-client noise.** A thread only reschedules a routine meeting. Expected: drop it entirely.
6. **Briefing meeting mismatch.** A recent briefing points to a different meeting. Expected: refresh it for the current strategic meeting.
7. **Connector unavailable.** A configured source is down. Expected: stop before writing and report the unavailable source.
8. **Thread-level dedup.** Four messages belong to one exchange. Expected: one interaction.
9. **Cross-type duplicate.** The event is logged as `email`, then proposed as `note`. Expected: reject the second write.
10. **Tense guard.** Source text says the operator should follow up next week. Expected: route to a dated task, not an interaction.
11. **Volume guard.** Five candidate interactions map to one contact. Expected: consolidate before the run completes.
12. **Meeting curation.** Calendar contains a recurring active-client check-in and first discovery on a new scope. Expected: discovery is logged and briefed; the check-in is not a Meeting.
13. **Operational cleanup.** A previous run added a routine cadence as a Meeting. Expected: delete the CRM Meeting row and report the cleanup count.
14. **First cadence instance.** First-ever one-to-one with a new collaborator. Expected: log as strategic; skip later routine instances unless a material event occurs.
15. **Material moment in routine meeting.** A recurring meeting produces a scope shift. Expected: log the scope shift; keep the recurring meeting out of the Meetings layer.
16. **Transcript capture.** A past-day discovery transcript contains commercial and timeline signals. Expected: one interaction, a journal entry, and dated tasks for commitments.
17. **Transcript and email dedup.** A call appears in a transcript and follow-up email. Expected: one interaction.
18. **Prior single-event capture.** Another workflow already logged today's call. Expected: no duplicate interaction.
19. **Operational transcript.** A recurring internal standup contains no new signal. Expected: no write.
20. **Unmatched transcript counterparty.** The transcript names no matching CRM contact. Expected: flag, do not create.
21. **Advice to journal.** The operator recommends an organizational change. Expected: preserve the advice and context in the journal; do not force a stage change.
22. **Forward plan and role.** A client describes a new initiative and the operator's likely role. Expected: journal entry; task only for a dated commitment.
23. **Impact capture.** The counterparty credits prior advice for a measurable result. Expected: journal entry and, when material, a concise interaction.
24. **Pure logistics.** A contact reschedules and acknowledges. Expected: no write anywhere.
25. **Same-day advisory update.** A strategic journal entry exists and another substantive topic arrives. Expected: add a distinct H4 subsection without overwriting the existing read.
