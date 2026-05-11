import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link, useParams } from "wouter";
import { useColors } from "@/App";
import type { ContactWithRelations } from "@shared/schema";
import { BRIEFING_TEMPLATE, BRIEFING_STALE_DAYS, getBriefingStaleness, briefingAgeDays } from "@shared/briefing";
import { Markdown } from "@/components/markdown";

export default function BriefingPage() {
  const C = useColors();
  const params = useParams<{ contactId: string }>();
  const contactId = parseInt(params.contactId || "0");

  const { data: contact } = useQuery<ContactWithRelations>({
    queryKey: [`/api/contacts/${contactId}`],
    enabled: contactId > 0,
  });

  const briefing = contact?.briefing;
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Init content from briefing
  if (briefing && !editing && content !== briefing.content) {
    setContent(briefing.content);
  }

  const saveBriefing = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("PUT", `/api/briefings/${contactId}`, { content: text });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      setEditing(false);
      setSaveError(null);
    },
    onError: (err: Error) => {
      // apiRequest throws `${status}: ${body}`. Body for validation failures
      // is JSON — pull the message out if we can, otherwise fall through.
      const raw = err.message || "";
      const jsonStart = raw.indexOf("{");
      if (jsonStart > 0) {
        try {
          const parsed = JSON.parse(raw.slice(jsonStart));
          if (parsed?.message) {
            setSaveError(parsed.message);
            return;
          }
        } catch {
          // fall through to raw
        }
      }
      setSaveError(raw || "Failed to save. Check that all 8 sections are present and in order.");
    },
  });

  const contactName = contact ? `${contact.firstName} ${contact.lastName}` : "Loading...";
  const companyName = contact?.company?.name || "";

  // Meeting context for the new staleness check (age + meeting linkage).
  const meetingCtx = (contact?.followups || [])
    .filter((f) => f.type === "meeting")
    .map((f) => ({ id: f.id, dueDate: f.dueDate, completed: f.completed, cancelled: !!f.cancelledAt }));
  const staleness = briefing
    ? getBriefingStaleness({ meetingId: briefing.meetingId, updatedAt: briefing.updatedAt }, meetingCtx)
    : { stale: false, reason: null as null | string };
  const stale = staleness.stale;
  const staleReason = staleness.reason;
  const ageDays = briefing ? briefingAgeDays(briefing.updatedAt) : 0;
  const linkedMeeting = briefing?.meetingId
    ? (contact?.followups || []).find((f) => f.id === briefing.meetingId) || null
    : null;

  // Find upcoming meetings for this contact
  const upcomingMeetings = (contact?.followups || []).filter(
    (f) => f.type === "meeting" && !f.completed && new Date(f.dueDate) >= new Date(),
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f8f8" }}>
      <header className="sticky top-0 z-50 bg-white" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="transition-colors hover:opacity-70" style={{ color: C.muted }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-sm font-semibold" style={{ color: C.text }}>
              {contactName}
              {companyName && (
                <span className="font-normal ml-1.5" style={{ color: C.muted }}>
                  {companyName}
                </span>
              )}
            </h1>
            <p className="text-[11px]" style={{ color: C.muted }}>
              Briefing
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-5">
        {/* Upcoming meetings */}
        {upcomingMeetings.length > 0 && (
          <div className="mb-4 text-xs" style={{ color: C.muted }}>
            {upcomingMeetings.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 mb-1">
                <span>📅</span>
                <span className="font-semibold" style={{ color: C.accentDark }}>
                  {new Date(m.dueDate).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  {m.time && ` ${m.time}`}
                </span>
                <span>{m.content}</span>
                {m.location && <span style={{ color: C.muted }}>— {m.location}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Stale banner — briefing exists but is stale (age OR meeting linkage). */}
        {stale && !editing && (
          <div
            className="mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs"
            style={{ backgroundColor: "#fef3c7", color: "#854d0e", border: "1px solid #fbbf24" }}
          >
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-px" />
            <div>
              <div className="font-semibold">
                {staleReason === "meeting_completed"
                  ? "Stale — the meeting this briefing was for has already happened."
                  : staleReason === "wrong_meeting"
                    ? "Stale — a newer meeting is now next on this contact. This briefing was for a different conversation."
                    : `Stale — last updated ${ageDays} days ago.`}
              </div>
              <div>
                {staleReason === "age"
                  ? `Briefings older than ${BRIEFING_STALE_DAYS} days stop surfacing on contact cards. Refresh with your agent before the next meeting.`
                  : "Refresh with your agent before the next meeting, or delete the briefing if it's no longer useful."}
              </div>
            </div>
          </div>
        )}

        {/* Linked meeting context — small line below the stale banner / above the briefing card. */}
        {linkedMeeting && !editing && (
          <div className="mb-3 text-[11px]" style={{ color: C.muted }}>
            <span className="font-semibold uppercase tracking-wider mr-1.5">For meeting:</span>
            {new Date(linkedMeeting.dueDate).toLocaleDateString()}
            {linkedMeeting.time ? ` ${linkedMeeting.time}` : ""} — {linkedMeeting.content}
            {linkedMeeting.location ? ` · ${linkedMeeting.location}` : ""}
          </div>
        )}

        {/* Briefing content */}
        <div className="bg-white" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1.25rem" }}>
          {editing ? (
            <div>
              <textarea
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full text-sm leading-relaxed rounded-lg p-3 outline-none resize-none min-h-[400px] font-mono"
                style={{ color: C.text, backgroundColor: C.accentLight, border: `1px solid ${C.border}` }}
                placeholder="Fill in each ## section. All 8 are required."
              />
              {saveError && (
                <div
                  className="mt-2 text-xs rounded-lg px-3 py-2"
                  style={{ backgroundColor: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}
                >
                  {saveError}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => saveBriefing.mutate(content)}
                  className="text-xs font-medium text-white px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: C.accentDark }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setContent(briefing?.content || "");
                    setSaveError(null);
                  }}
                  className="text-xs px-3 py-1.5"
                  style={{ color: C.muted }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : briefing ? (
            <div>
              <div className="cursor-text" onClick={() => setEditing(true)}>
                <Markdown>{briefing.content}</Markdown>
              </div>
              <div
                className="flex items-center justify-between mt-4 pt-3"
                style={{ borderTop: `1px dashed ${C.border}` }}
              >
                <span className="text-[10px]" style={{ color: C.muted }}>
                  Updated {new Date(briefing.updatedAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-medium"
                  style={{ color: C.accentDark }}
                >
                  Edit
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm mb-3" style={{ color: C.muted }}>
                No briefing yet
              </p>
              <p className="text-[11px] mb-3" style={{ color: C.muted }}>
                Ask your agent to call <code>prepare_briefing</code> for research-backed prep, or start from the
                template below.
              </p>
              <button
                onClick={() => {
                  setContent(BRIEFING_TEMPLATE(contactName, companyName));
                  setEditing(true);
                }}
                className="text-xs font-medium text-white px-4 py-2 rounded-lg"
                style={{ backgroundColor: C.accentDark }}
              >
                Start from template
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
