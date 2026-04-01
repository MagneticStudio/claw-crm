import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "wouter";
import { useColors } from "@/App";
import type { ContactWithRelations } from "@shared/schema";

export default function BriefingPage() {
  const C = useColors();
  const params = useParams<{ contactId: string }>();
  const contactId = parseInt(params.contactId || "0");

  const { data: contact } = useQuery<ContactWithRelations>({
    queryKey: [`/api/contacts/${contactId}`],
    enabled: contactId > 0,
  });

  const briefing = (contact as any)?.briefing;
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState("");

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
    },
  });

  const contactName = contact ? `${contact.firstName} ${contact.lastName}` : "Loading...";
  const companyName = contact?.company?.name || "";

  // Find upcoming meetings for this contact
  const upcomingMeetings = (contact?.followups || []).filter(
    (f: any) => f.type === "meeting" && !f.completed && new Date(f.dueDate) >= new Date()
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
              {companyName && <span className="font-normal ml-1.5" style={{ color: C.muted }}>{companyName}</span>}
            </h1>
            <p className="text-[11px]" style={{ color: C.muted }}>Briefing</p>
          </div>
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-5">
        {/* Upcoming meetings */}
        {upcomingMeetings.length > 0 && (
          <div className="mb-4 text-xs" style={{ color: C.muted }}>
            {upcomingMeetings.map((m: any) => (
              <div key={m.id} className="flex items-center gap-1.5 mb-1">
                <span>📅</span>
                <span className="font-semibold" style={{ color: C.accentDark }}>
                  {new Date(m.dueDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {m.time && ` ${m.time}`}
                </span>
                <span>{m.content}</span>
                {m.location && <span style={{ color: C.muted }}>— {m.location}</span>}
              </div>
            ))}
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
                className="w-full text-sm leading-relaxed rounded-lg p-3 outline-none resize-none min-h-[300px]"
                style={{ color: C.text, backgroundColor: C.accentLight, border: `1px solid ${C.border}` }}
                placeholder="Write your briefing here...&#10;&#10;Talking points:&#10;- &#10;&#10;Open items:&#10;- &#10;&#10;Notes:&#10;- "
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => saveBriefing.mutate(content)}
                  className="text-xs font-medium text-white px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: C.accentDark }}
                >Save</button>
                <button
                  onClick={() => { setEditing(false); setContent(briefing?.content || ""); }}
                  className="text-xs px-3 py-1.5"
                  style={{ color: C.muted }}
                >Cancel</button>
              </div>
            </div>
          ) : briefing ? (
            <div>
              <div
                className="text-sm leading-relaxed whitespace-pre-wrap cursor-text"
                style={{ color: C.text }}
                onClick={() => setEditing(true)}
              >
                {briefing.content}
              </div>
              <div className="flex items-center justify-between mt-4 pt-3" style={{ borderTop: `1px dashed ${C.border}` }}>
                <span className="text-[10px]" style={{ color: C.muted }}>
                  Updated {new Date(briefing.updatedAt).toLocaleDateString()}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-medium"
                  style={{ color: C.accentDark }}
                >Edit</button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm mb-3" style={{ color: C.muted }}>No briefing yet</p>
              <button
                onClick={() => { setContent(""); setEditing(true); }}
                className="text-xs font-medium text-white px-4 py-2 rounded-lg"
                style={{ backgroundColor: C.accentDark }}
              >Create Briefing</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
