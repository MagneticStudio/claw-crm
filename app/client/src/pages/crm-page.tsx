import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCrm } from "@/hooks/use-crm";
import { useSSE } from "@/hooks/use-sse";
import { useAuth } from "@/hooks/use-auth";
import { ContactBlock } from "@/components/contact-block";
import { Loader2, LogOut, Settings, Square, Activity, X, ChevronDown } from "lucide-react";
import { Link } from "wouter";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import type { ContactWithRelations, Followup, Meeting, Briefing, ActivityLogEntry } from "@shared/schema";
import { fmtDate } from "@/lib/utils";

const STAGES = ["ALL", "NEGOTIATION", "PROPOSAL", "MEETING", "LEAD", "LIVE", "RELATIONSHIP", "PASS"] as const;

const STAGE_ACCENT: Record<string, string> = {
  LIVE: "#2e7d32",
  NEGOTIATION: "#d4880f",
  PROPOSAL: "#2563eb",
  MEETING: "#2bbcb3",
  LEAD: "#5a7a7a",
  HOLD: "#6c5ce7",
  PASS: "#c0392b",
  RELATIONSHIP: "#1a9e96",
};

const SORT_BUCKET: Record<string, number> = {
  NEGOTIATION: 0, PROPOSAL: 0, MEETING: 0, LEAD: 0,
  LIVE: 1,
  RELATIONSHIP: 2,
  PASS: 3,
};

const C = {
  text: "#1a2f2f",
  muted: "#5a7a7a",
  border: "#d4e8e8",
  accent: "#2bbcb3",
  accentDark: "#1a9e96",
  accentLight: "#e6f7f6",
  stale: "#d4880f",
  red: "#c0392b",
};

export default function CrmPage() {
  const { contacts, isLoading, addInteraction, updateInteraction, deleteInteraction, createFollowup, updateFollowup, deleteFollowup, completeFollowup, updateContact } = useCrm();
  const { logoutMutation } = useAuth();
  const [activeStage, setActiveStage] = useState<string>("ALL");
  useSSE();

  const sortedContacts = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => {
      const aActive = a.status === "ACTIVE" ? 0 : 1;
      const bActive = b.status === "ACTIVE" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      const aBucket = SORT_BUCKET[a.stage] ?? 2;
      const bBucket = SORT_BUCKET[b.stage] ?? 2;
      if (aBucket !== bBucket) return aBucket - bBucket;

      const aNextFu = a.followups.filter(f => !f.completed).map(f => new Date(f.dueDate).getTime()).sort((x, y) => x - y)[0] ?? Infinity;
      const bNextFu = b.followups.filter(f => !f.completed).map(f => new Date(f.dueDate).getTime()).sort((x, y) => x - y)[0] ?? Infinity;
      if (aNextFu !== bNextFu) return aNextFu - bNextFu;

      const aLast = a.interactions.length > 0 ? new Date(a.interactions[a.interactions.length - 1].date).getTime() : 0;
      const bLast = b.interactions.length > 0 ? new Date(b.interactions[b.interactions.length - 1].date).getTime() : 0;
      return bLast - aLast;
    });
    return sorted;
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    if (activeStage === "ALL") return sortedContacts;
    return sortedContacts.filter((c) => c.stage === activeStage);
  }, [sortedContacts, activeStage]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: contacts.length };
    for (const c of contacts) {
      counts[c.stage] = (counts[c.stage] || 0) + 1;
    }
    return counts;
  }, [contacts]);

  // Follow-ups due within 7 days (including overdue), sorted by due date
  const allFollowups = useMemo(() => {
    const sevenDaysOut = new Date();
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
    const fus: Array<{ followup: Followup; contactName: string; contactId: number }> = [];
    for (const c of contacts) {
      for (const fu of c.followups) {
        if (!fu.completed && new Date(fu.dueDate) <= sevenDaysOut) {
          fus.push({ followup: fu, contactName: `${c.firstName} ${c.lastName}`, contactId: c.id });
        }
      }
    }
    fus.sort((a, b) => new Date(a.followup.dueDate).getTime() - new Date(b.followup.dueDate).getTime());
    return fus;
  }, [contacts]);

  const [completingUpcomingId, setCompletingUpcomingId] = useState<number | null>(null);
  const [completingUpcomingText, setCompletingUpcomingText] = useState("");
  const [showActivityDrawer, setShowActivityDrawer] = useState(false);
  const [expandedMeetingIds, setExpandedMeetingIds] = useState<Set<number>>(new Set());

  const toggleMeetingExpand = (id: number) => {
    setExpandedMeetingIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Today's meetings across all contacts
  const todaysMeetings = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const items: Array<{ meeting: Meeting; contactName: string; companyName: string; contactId: number; briefing: Briefing | null }> = [];
    for (const c of contacts) {
      for (const m of c.meetings) {
        const d = new Date(m.date);
        if (d >= startOfDay && d <= endOfDay && !m.cancelledAt) {
          items.push({ meeting: m, contactName: `${c.firstName} ${c.lastName}`, companyName: c.company?.name || "", contactId: c.id, briefing: c.briefing });
        }
      }
    }
    items.sort((a, b) => new Date(a.meeting.date).getTime() - new Date(b.meeting.date).getTime());
    return items;
  }, [contacts]);

  // Activity log
  const { data: activityLog = [] } = useQuery<ActivityLogEntry[]>({
    queryKey: ["/api/activity"],
    staleTime: 30_000,
  });

  const activeCount = contacts.filter((c) => c.status === "ACTIVE").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: "#f0f8f8" }}>
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: C.accent }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f8f8" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-[13px] font-semibold tracking-[0.2em] uppercase" style={{ color: C.text }}>
              Magnetic Advisors
            </h1>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: C.muted }}>
              {activeCount} active
              {todaysMeetings.length > 0 && ` · ${todaysMeetings.length} meeting${todaysMeetings.length !== 1 ? "s" : ""} today`}
              {allFollowups.length > 0 && ` · ${allFollowups.length} follow-up${allFollowups.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowActivityDrawer(!showActivityDrawer)} className="p-2 transition-colors relative" style={{ color: C.muted }}>
              <Activity className="h-4 w-4" />
            </button>
            <Link href="/rules" className="p-2 transition-colors" style={{ color: C.muted }}>
              <Settings className="h-4 w-4" />
            </Link>
            <button onClick={() => logoutMutation.mutate()} className="p-2 transition-colors" style={{ color: C.muted }}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stage filter pills */}
        <div className="max-w-[640px] mx-auto px-4 pb-2.5 flex gap-1.5 overflow-x-auto">
          {STAGES.map((stage) => {
            const count = stageCounts[stage] || 0;
            if (stage !== "ALL" && count === 0) return null;
            const isActive = activeStage === stage;
            return (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                className="px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all"
                style={
                  isActive
                    ? { backgroundColor: C.accent, color: "#ffffff" }
                    : { backgroundColor: "transparent", color: C.muted, border: `1px solid ${C.border}` }
                }
              >
                {stage === "ALL" ? "All" : stage.charAt(0) + stage.slice(1).toLowerCase()}
                <span className="ml-1" style={{ opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Activity drawer */}
      {showActivityDrawer && (
        <div className="fixed inset-0 z-40" onClick={() => setShowActivityDrawer(false)}>
          <div className="absolute right-0 top-0 h-full w-80 bg-white shadow-lg" style={{ borderLeft: `1px solid ${C.border}` }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.text }}>Activity Log</span>
              <button onClick={() => setShowActivityDrawer(false)} style={{ color: C.muted }}><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto h-[calc(100%-48px)] px-4 py-3">
              {activityLog.length === 0 && <p className="text-xs" style={{ color: C.muted }}>No activity yet</p>}
              <div className="space-y-2">
                {activityLog.map((entry) => (
                  <div key={entry.id} className="text-xs" style={{ color: C.text }}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono flex-shrink-0" style={{ color: C.muted }}>
                        {format(new Date(entry.createdAt), "M/d h:mm a")}
                      </span>
                      <span className="font-mono text-[10px] px-1 rounded" style={{ backgroundColor: C.accentLight, color: C.accentDark }}>
                        {entry.source}
                      </span>
                    </div>
                    <p className="mt-0.5">{entry.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-[640px] mx-auto px-4 py-5">
        {/* Today's meetings */}
        {todaysMeetings.length > 0 && (
          <div className="bg-white mb-3" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1rem 1.25rem" }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.stale }}>
              Today
            </div>
            <div className="space-y-1.5">
              {todaysMeetings.map(({ meeting, contactName, companyName, briefing }) => {
                const time = format(new Date(meeting.date), "h:mm a");
                const icon = ({ call: "📞", video: "📹", "in-person": "🤝", coffee: "☕" } as any)[meeting.type] || "📅";
                const isExp = expandedMeetingIds.has(meeting.id);
                return (
                  <div key={meeting.id}>
                    <div className="flex items-center gap-2 text-sm cursor-pointer" onClick={() => toggleMeetingExpand(meeting.id)}>
                      <span className="flex-shrink-0">{icon}</span>
                      <span className="font-bold flex-shrink-0" style={{ color: C.stale }}>{time}</span>
                      <span style={{ color: C.text }}>{contactName}</span>
                      {companyName && <span className="text-xs" style={{ color: C.muted }}>{companyName}</span>}
                      {meeting.location && <span className="ml-auto text-xs" style={{ color: C.muted }}>{meeting.location}</span>}
                      <ChevronDown className={`h-3 w-3 flex-shrink-0 transition-transform ${isExp ? "rotate-180" : ""}`} style={{ color: C.muted }} />
                    </div>
                    {isExp && briefing && (
                      <div className="mt-1.5 ml-6 text-xs rounded-lg px-3 py-2 whitespace-pre-wrap" style={{ backgroundColor: C.accentLight, color: C.text }}>
                        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: C.accentDark }}>Briefing</div>
                        {briefing.content}
                      </div>
                    )}
                    {isExp && meeting.notes && !briefing && (
                      <div className="mt-1.5 ml-6 text-xs" style={{ color: C.muted }}>{meeting.notes}</div>
                    )}
                    {isExp && !briefing && !meeting.notes && (
                      <div className="mt-1.5 ml-6 text-[10px] italic" style={{ color: C.muted }}>No briefing yet</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Upcoming tasks — next 7 days + overdue */}
        {allFollowups.length > 0 && (
          <div className="bg-white mb-5" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1rem 1.25rem" }}>
            <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.muted }}>
              Upcoming
            </div>
            <div className="space-y-1.5">
              {allFollowups.map(({ followup: fu, contactName }) => {
                const due = new Date(fu.dueDate);
                const isOverdue = isPast(due) && !isToday(due);
                const isTodayDue = isToday(due);
                const daysUntil = differenceInDays(due, new Date());
                const dateColor = isOverdue ? C.red : isTodayDue ? C.stale : C.accentDark;
                const isCompleting = completingUpcomingId === fu.id;

                if (isCompleting) {
                  return (
                    <div key={fu.id} className="rounded-lg px-3 py-2 space-y-2" style={{ backgroundColor: C.accentLight, border: `1px solid ${C.accent}40` }}>
                      <div className="text-xs font-medium" style={{ color: C.accentDark }}>
                        Completing: {fmtDate(due)} {fu.content} — {contactName}
                      </div>
                      <input
                        autoFocus
                        value={completingUpcomingText}
                        onChange={(e) => setCompletingUpcomingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && completingUpcomingText.trim()) {
                            completeFollowup.mutate({ id: fu.id, outcome: completingUpcomingText.trim() });
                            setCompletingUpcomingId(null);
                          }
                          if (e.key === "Escape") setCompletingUpcomingId(null);
                        }}
                        placeholder="What happened?"
                        className="w-full text-sm bg-white rounded px-2 py-1 outline-none"
                        style={{ color: C.text, border: `1px solid ${C.accent}40` }}
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            if (completingUpcomingText.trim()) {
                              completeFollowup.mutate({ id: fu.id, outcome: completingUpcomingText.trim() });
                              setCompletingUpcomingId(null);
                            }
                          }}
                          className="text-xs font-medium text-white px-2.5 py-1 rounded"
                          style={{ backgroundColor: C.accentDark }}
                        >Done</button>
                        <button onClick={() => { completeFollowup.mutate({ id: fu.id }); setCompletingUpcomingId(null); }}
                          className="text-xs" style={{ color: C.muted }}>Skip note</button>
                        <button onClick={() => setCompletingUpcomingId(null)}
                          className="text-xs" style={{ color: C.muted }}>Cancel</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={fu.id} className="flex items-start gap-2 text-sm">
                    <button
                      onClick={() => { setCompletingUpcomingId(fu.id); setCompletingUpcomingText(fu.content); }}
                      className="flex-shrink-0 mt-0.5 hover:opacity-70 transition-colors"
                      title="Complete"
                    >
                      <Square className="h-3.5 w-3.5" style={{ color: dateColor }} />
                    </button>
                    <span className="font-bold flex-shrink-0" style={{ color: dateColor }}>
                      {fmtDate(due)}
                    </span>
                    <span style={{ color: C.text }}>{fu.content}</span>
                    <span className="ml-auto text-xs flex-shrink-0 whitespace-nowrap" style={{ color: C.muted }}>
                      {contactName}
                    </span>
                    {isOverdue && (
                      <span className="text-xs font-semibold flex-shrink-0" style={{ color: C.red }}>OVERDUE</span>
                    )}
                    {isTodayDue && (
                      <span className="text-xs font-semibold flex-shrink-0" style={{ color: C.stale }}>TODAY</span>
                    )}
                    {!isOverdue && !isTodayDue && daysUntil <= 7 && (
                      <span className="text-xs flex-shrink-0" style={{ color: C.muted }}>{daysUntil}d</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Contact cards */}
        {filteredContacts.map((contact) => (
          <ContactBlock
            key={contact.id}
            contact={contact}
            accentColor={STAGE_ACCENT[contact.stage] || "#5a7a7a"}
            onAddInteraction={(content, date, type) =>
              addInteraction.mutate({ contactId: contact.id, content, date, type })
            }
            onUpdateInteraction={(id, data) => updateInteraction.mutate({ id, ...data })}
            onDeleteInteraction={(id) => deleteInteraction.mutate(id)}
            onCreateFollowup={(content, dueDate) =>
              createFollowup.mutate({ contactId: contact.id, content, dueDate })
            }
            onUpdateFollowup={(id, data) => updateFollowup.mutate({ id, ...data })}
            onDeleteFollowup={(id) => deleteFollowup.mutate(id)}
            onCompleteFollowup={(id, outcome) => completeFollowup.mutate({ id, outcome })}
            onUpdateContact={(data) => updateContact.mutate({ id: contact.id, ...data })}
          />
        ))}

        {filteredContacts.length === 0 && (
          <p className="text-center py-16 text-sm" style={{ color: C.muted }}>No contacts in this stage</p>
        )}
      </main>
    </div>
  );
}
