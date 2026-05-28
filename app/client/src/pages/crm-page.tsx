import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCrm } from "@/hooks/use-crm";
import { useSSE } from "@/hooks/use-sse";
import { useAuth } from "@/hooks/use-auth";
import { useContactSearch } from "@/hooks/use-contact-search";
import { ContactBlock } from "@/components/contact-block";
import { SearchBar } from "@/components/search-bar";
import {
  Loader2,
  LogOut,
  Settings,
  Square,
  Activity,
  X,
  ChevronDown,
  Zap,
  LayoutList,
  Kanban,
  SlidersHorizontal,
  Menu,
  Check,
  Clock,
} from "lucide-react";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { Link } from "wouter";
import { format, isPast, isToday, differenceInCalendarDays } from "date-fns";
import type { Followup, ActivityLogEntry, Briefing } from "@shared/schema";
import { fmtDate } from "@/lib/utils";
import { useConfig, useColors } from "@/App";

// Pipeline order (funnel flow, top to bottom)
const STAGES = ["ALL", "LEAD", "MEETING", "PROPOSAL", "NEGOTIATION", "LIVE", "RELATIONSHIP", "PASS"] as const;

const SORT_BUCKET: Record<string, number> = {
  NEGOTIATION: 0,
  PROPOSAL: 0,
  MEETING: 0,
  LEAD: 0,
  LIVE: 1,
  RELATIONSHIP: 2,
  PASS: 3,
};

export default function CrmPage() {
  const C = useColors();
  const {
    contacts,
    isLoading,
    addInteraction,
    updateInteraction,
    deleteInteraction,
    createFollowup,
    updateFollowup,
    deleteFollowup,
    completeFollowup,
    updateContact,
  } = useCrm();
  const { logoutMutation } = useAuth();
  const [activeStage, setActiveStage] = useState<string>("ALL");
  const { orgName, upcomingDays: days } = useConfig();
  const [viewMode, setViewMode] = useState<"list" | "kanban">(
    () => (localStorage.getItem("crm-view-mode") as "list" | "kanban") || "list",
  );
  useEffect(() => {
    localStorage.setItem("crm-view-mode", viewMode);
  }, [viewMode]);
  const [showFilter, setShowFilter] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  // Search state — lives at the CrmPage level because it overrides
  // displayedContacts and forces list view while a query is active.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { search } = useContactSearch(contacts, searchOpen);
  useSSE();

  // Global Cmd+K (Ctrl+K elsewhere) opens search from anywhere on the page.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        // focus on next tick so the input has mounted
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const sortedContacts = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => {
      const aActive = a.status === "ACTIVE" ? 0 : 1;
      const bActive = b.status === "ACTIVE" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      const aBucket = SORT_BUCKET[a.stage] ?? 2;
      const bBucket = SORT_BUCKET[b.stage] ?? 2;
      if (aBucket !== bBucket) return aBucket - bBucket;

      const aNextFu =
        a.followups
          .filter((f) => !f.completed)
          .map((f) => new Date(f.dueDate).getTime())
          .sort((x, y) => x - y)[0] ?? Infinity;
      const bNextFu =
        b.followups
          .filter((f) => !f.completed)
          .map((f) => new Date(f.dueDate).getTime())
          .sort((x, y) => x - y)[0] ?? Infinity;
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

  const kanbanContacts = useMemo(() => contacts.filter((c) => c.status !== "HOLD"), [contacts]);

  // Search results override the normal pipeline view when a query is active.
  // Per spec ("search overrides everything"): we ignore the stage filter and
  // force list mode while results are showing.
  const trimmedQuery = searchQuery.trim();
  const searchResults = useMemo(() => (trimmedQuery ? search(trimmedQuery) : null), [search, trimmedQuery]);
  const isSearching = searchResults !== null;
  const displayedContacts = isSearching ? searchResults : filteredContacts;
  const effectiveViewMode = isSearching ? "list" : viewMode;

  // Clamp the keyboard highlight whenever the result set shrinks.
  useEffect(() => {
    if (highlightedIndex >= displayedContacts.length) {
      setHighlightedIndex(Math.max(0, displayedContacts.length - 1));
    }
  }, [displayedContacts.length, highlightedIndex]);

  // Scroll the highlighted contact into view as the user arrow-keys through
  // results. Mirrors the kanban onContactTap polling approach.
  useEffect(() => {
    if (!isSearching) return;
    const target = displayedContacts[highlightedIndex];
    if (!target) return;
    const el = document.getElementById(`contact-${target.id}`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isSearching, highlightedIndex, displayedContacts]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setHighlightedIndex(0);
  };

  // Follow-ups due within N days (including overdue), sorted by due date
  const allFollowups = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + days);
    const fus: Array<{
      followup: Followup;
      contactName: string;
      companyName: string;
      contactId: number;
      briefing: Briefing | null | undefined;
    }> = [];
    for (const c of contacts) {
      for (const fu of c.followups) {
        if (!fu.completed && new Date(fu.dueDate) <= cutoff) {
          fus.push({
            followup: fu,
            contactName: `${c.firstName} ${c.lastName}`,
            companyName: c.company?.name || "",
            contactId: c.id,
            briefing: c.briefing,
          });
        }
      }
    }
    fus.sort((a, b) => new Date(a.followup.dueDate).getTime() - new Date(b.followup.dueDate).getTime());
    return fus;
  }, [contacts, days]);

  const [completingUpcomingId, setCompletingUpcomingId] = useState<number | null>(null);
  const [completingUpcomingText, setCompletingUpcomingText] = useState("");
  const [showActivityDrawer, setShowActivityDrawer] = useState(false);
  const [expandedMeetingIds, setExpandedMeetingIds] = useState<Set<number>>(new Set());

  const toggleMeetingExpand = (id: number) => {
    setExpandedMeetingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Activity log
  const { data: activityLog = [] } = useQuery<ActivityLogEntry[]>({
    queryKey: ["/api/activity"],
    staleTime: 30_000,
  });

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
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center justify-between gap-2">
          {!searchOpen && (
            <h1 className="text-[13px] font-semibold tracking-[0.2em] uppercase" style={{ color: C.text }}>
              {orgName}
            </h1>
          )}
          <div className={`flex items-center gap-0.5 relative ${searchOpen ? "flex-1" : ""}`}>
            <SearchBar
              ref={searchInputRef}
              open={searchOpen}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onOpen={() => {
                setSearchOpen(true);
                setShowFilter(false);
                setShowMenu(false);
                requestAnimationFrame(() => searchInputRef.current?.focus());
              }}
              onClose={closeSearch}
              onEnter={() => searchInputRef.current?.blur()}
              onArrowDown={() => setHighlightedIndex((i) => Math.min(displayedContacts.length - 1, i + 1))}
              onArrowUp={() => setHighlightedIndex((i) => Math.max(0, i - 1))}
            />
            {/* Filter button — hidden while searching to give the input room */}
            {!searchOpen && (
              <button
                onClick={() => {
                  setShowFilter(!showFilter);
                  setShowMenu(false);
                }}
                className="p-2 transition-colors"
                style={{ color: activeStage !== "ALL" ? C.accent : C.muted }}
                title="Filter by stage"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            )}

            {/* Menu button */}
            <button
              onClick={() => {
                setShowMenu(!showMenu);
                setShowFilter(false);
              }}
              className="p-2 transition-colors"
              style={{ color: C.muted }}
              title="Menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Filter dropdown */}
            {showFilter && (
              <>
                <div className="fixed inset-0 z-[59]" onClick={() => setShowFilter(false)} />
                <div
                  className="absolute right-8 top-10 z-[60] py-1"
                  style={{
                    backgroundColor: "#fff",
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    minWidth: 180,
                  }}
                >
                  {STAGES.map((stage) => {
                    const count = stageCounts[stage] || 0;
                    const isActive = activeStage === stage;
                    const label = stage === "ALL" ? "All" : stage.charAt(0) + stage.slice(1).toLowerCase();
                    return (
                      <button
                        key={stage}
                        onClick={() => {
                          setActiveStage(isActive && stage !== "ALL" ? "ALL" : stage);
                          setShowFilter(false);
                        }}
                        className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] transition-colors hover:bg-gray-50"
                        style={{
                          color: stage !== "ALL" && count === 0 ? `${C.muted}80` : isActive ? C.accent : C.text,
                          fontWeight: isActive ? 600 : 400,
                        }}
                      >
                        <span>{label}</span>
                        <span className="flex items-center gap-2">
                          {stage !== "ALL" && (
                            <span className="text-[11px]" style={{ color: C.muted }}>
                              {count}
                            </span>
                          )}
                          {isActive && <Check className="h-3.5 w-3.5" style={{ color: C.accent }} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Menu dropdown */}
            {showMenu && (
              <>
                <div className="fixed inset-0 z-[59]" onClick={() => setShowMenu(false)} />
                <div
                  className="absolute right-0 top-10 z-[60] py-1"
                  style={{
                    backgroundColor: "#fff",
                    border: `1px solid ${C.border}`,
                    borderRadius: 12,
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    minWidth: 200,
                  }}
                >
                  {/* View toggle */}
                  <button
                    onClick={() => {
                      setViewMode("list");
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-gray-50"
                    style={{ color: viewMode === "list" ? C.accent : C.text }}
                  >
                    <LayoutList className="h-4 w-4" style={{ color: viewMode === "list" ? C.accent : C.muted }} />
                    <span style={{ fontWeight: viewMode === "list" ? 600 : 400 }}>List view</span>
                    {viewMode === "list" && <Check className="h-3.5 w-3.5 ml-auto" style={{ color: C.accent }} />}
                  </button>
                  <button
                    onClick={() => {
                      setViewMode("kanban");
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-gray-50"
                    style={{ color: viewMode === "kanban" ? C.accent : C.text }}
                  >
                    <Kanban className="h-4 w-4" style={{ color: viewMode === "kanban" ? C.accent : C.muted }} />
                    <span style={{ fontWeight: viewMode === "kanban" ? 600 : 400 }}>Kanban view</span>
                    {viewMode === "kanban" && <Check className="h-3.5 w-3.5 ml-auto" style={{ color: C.accent }} />}
                  </button>

                  <div className="my-1" style={{ borderTop: `1px solid ${C.border}` }} />

                  <Link
                    href="/rules"
                    onClick={() => setShowMenu(false)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-gray-50"
                    style={{ color: C.text }}
                  >
                    <Zap className="h-4 w-4" style={{ color: C.muted }} />
                    <span>Rules</span>
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setShowMenu(false)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-gray-50"
                    style={{ color: C.text }}
                  >
                    <Settings className="h-4 w-4" style={{ color: C.muted }} />
                    <span>Settings</span>
                  </Link>
                  <button
                    onClick={() => {
                      setShowActivityDrawer(!showActivityDrawer);
                      setShowMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-gray-50"
                    style={{ color: C.text }}
                  >
                    <Activity className="h-4 w-4" style={{ color: C.muted }} />
                    <span>Activity Log</span>
                  </button>

                  <div className="my-1" style={{ borderTop: `1px solid ${C.border}` }} />

                  <button
                    onClick={() => logoutMutation.mutate()}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors hover:bg-gray-50"
                    style={{ color: C.text }}
                  >
                    <LogOut className="h-4 w-4" style={{ color: C.muted }} />
                    <span>Log out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Activity drawer */}
      {showActivityDrawer && (
        <div className="fixed inset-0 z-[60]" onClick={() => setShowActivityDrawer(false)}>
          <div
            className="absolute right-0 top-0 h-full w-80 bg-white shadow-lg pt-14"
            style={{ borderLeft: `1px solid ${C.border}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: `1px solid ${C.border}` }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.text }}>
                Activity Log
              </span>
              <button onClick={() => setShowActivityDrawer(false)} style={{ color: C.muted }}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto h-[calc(100%-48px)] px-4 py-3">
              {activityLog.length === 0 && (
                <p className="text-xs" style={{ color: C.muted }}>
                  No activity yet
                </p>
              )}
              <div className="space-y-2">
                {activityLog.map((entry) => (
                  <div key={entry.id} className="text-xs" style={{ color: C.text }}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono flex-shrink-0" style={{ color: C.muted }}>
                        {format(new Date(entry.createdAt), "M/d h:mm a")}
                      </span>
                      <span
                        className="font-mono text-[10px] px-1 rounded"
                        style={{ backgroundColor: C.accentLight, color: C.accentDark }}
                      >
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

      {effectiveViewMode === "kanban" ? (
        <KanbanBoard
          contacts={kanbanContacts}
          updateContact={updateContact}
          onContactTap={(id) => {
            setActiveStage("ALL");
            setViewMode("list");
            // Poll for the element to appear in the DOM after React renders the list
            let attempts = 0;
            const tryScroll = () => {
              const el = document.getElementById(`contact-${id}`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
              } else if (attempts++ < 20) {
                requestAnimationFrame(tryScroll);
              }
            };
            requestAnimationFrame(tryScroll);
          }}
        />
      ) : (
        <main className="max-w-[640px] mx-auto px-4 py-5">
          {/* Upcoming — all follow-ups and meetings in one list */}
          {allFollowups.length > 0 && (
            <div
              className="bg-white mb-5"
              style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1rem 1.25rem" }}
            >
              <div className="mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
                  Upcoming
                </span>
              </div>
              <div className="space-y-1.5">
                {allFollowups.map(({ followup: fu, contactName, briefing }) => {
                  const due = new Date(fu.dueDate);
                  // Meetings are scheduled events, not action items — a past meeting has
                  // happened, it's not "overdue". Overdue only applies to tasks.
                  const isOverdue = fu.type !== "meeting" && isPast(due) && !isToday(due);
                  const isTodayDue = isToday(due);
                  // Calendar-day difference — counts midnight crossings, so an item due tomorrow
                  // reads as "1d" regardless of what hour it is today. differenceInDays measures
                  // 24h periods, which is wrong for human-facing "days until".
                  const daysUntil = differenceInCalendarDays(due, new Date());
                  const dateColor = isOverdue ? C.red : isTodayDue ? C.stale : C.accentDark;
                  const isCompleting = completingUpcomingId === fu.id;

                  if (isCompleting) {
                    return (
                      <div
                        key={fu.id}
                        className="rounded-lg px-3 py-2 space-y-2"
                        style={{ backgroundColor: C.accentLight, border: `1px solid ${C.accent}40` }}
                      >
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
                          >
                            Done
                          </button>
                          <button
                            onClick={() => {
                              completeFollowup.mutate({ id: fu.id });
                              setCompletingUpcomingId(null);
                            }}
                            className="text-xs"
                            style={{ color: C.muted }}
                          >
                            Skip note
                          </button>
                          <button
                            onClick={() => setCompletingUpcomingId(null)}
                            className="text-xs"
                            style={{ color: C.muted }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const isMeeting = fu.type === "meeting";
                  const meetingType = (fu.metadata as Record<string, unknown> | null)?.meetingType as
                    | string
                    | undefined;
                  const meetingIcons: Record<string, string> = {
                    call: "📞",
                    video: "📹",
                    "in-person": "🤝",
                    coffee: "☕",
                  };
                  const meetingIcon = isMeeting ? (meetingType && meetingIcons[meetingType]) || "📅" : null;
                  const isTodayMeeting = isMeeting && isTodayDue;
                  const isExp = isTodayMeeting && expandedMeetingIds.has(fu.id);

                  const handleUpcomingSnooze = (days: number) => {
                    const newDate = new Date(due);
                    newDate.setDate(newDate.getDate() + days);
                    updateFollowup.mutate({ id: fu.id, dueDate: newDate.toISOString() });
                  };

                  return (
                    <div key={fu.id} className="group/upcoming py-0.5">
                      <div className="flex items-start gap-2">
                        {isMeeting ? (
                          <span
                            className={`flex-shrink-0 leading-none mt-0.5 ${isTodayMeeting ? "cursor-pointer" : ""}`}
                            onClick={isTodayMeeting ? () => toggleMeetingExpand(fu.id) : undefined}
                          >
                            {meetingIcon}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setCompletingUpcomingId(fu.id);
                              setCompletingUpcomingText(fu.content);
                            }}
                            className="flex-shrink-0 hover:opacity-70 transition-colors mt-1"
                            title="Complete"
                          >
                            <Square className="h-3.5 w-3.5" style={{ color: dateColor }} />
                          </button>
                        )}
                        <div className="flex-1 min-w-0">
                          {/* Meta line — date, time, contact, relative pill, hover snooze */}
                          <div className="flex items-center gap-1.5 text-[11px] leading-tight flex-wrap">
                            <span
                              className="font-semibold whitespace-nowrap"
                              style={{ color: isMeeting ? "#2563eb" : dateColor }}
                            >
                              {fmtDate(due)}
                              {fu.time ? ` ${fu.time}` : ""}
                            </span>
                            {isOverdue && (
                              <span className="font-semibold uppercase tracking-wide" style={{ color: C.red }}>
                                · Overdue
                              </span>
                            )}
                            {isTodayDue && (
                              <span className="font-semibold uppercase tracking-wide" style={{ color: C.stale }}>
                                · Today
                              </span>
                            )}
                            {!isOverdue && !isTodayDue && daysUntil <= 7 && (
                              <span style={{ color: C.muted }}>· {daysUntil}d</span>
                            )}
                            <span style={{ color: C.muted }}>·</span>
                            <span className="truncate" style={{ color: C.muted }}>
                              {contactName}
                            </span>
                            <span className="hidden group-hover/upcoming:inline-flex items-center gap-1 ml-auto">
                              <Clock className="h-3 w-3" style={{ color: C.muted }} />
                              {[1, 7, 14].map((d) => (
                                <button
                                  key={d}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpcomingSnooze(d);
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded-full transition-colors hover:opacity-80"
                                  style={{ backgroundColor: C.accentLight, color: C.accentDark }}
                                  title={`Snooze ${d} day${d > 1 ? "s" : ""}`}
                                >
                                  +{d}d
                                </button>
                              ))}
                            </span>
                          </div>
                          {/* Content line — full width, primary readable */}
                          <div className="text-sm leading-snug mt-0.5" style={{ color: C.text }}>
                            {fu.content}
                            {fu.location ? <span style={{ color: C.muted }}> — {fu.location}</span> : null}
                          </div>
                        </div>
                        {isTodayMeeting && (
                          <ChevronDown
                            className={`h-3.5 w-3.5 flex-shrink-0 mt-1 transition-transform cursor-pointer ${isExp ? "rotate-180" : ""}`}
                            style={{ color: C.muted }}
                            onClick={() => toggleMeetingExpand(fu.id)}
                          />
                        )}
                      </div>
                      {isExp && briefing && (
                        <div
                          className="mt-1.5 ml-6 text-xs rounded-lg px-3 py-2 whitespace-pre-wrap"
                          style={{ backgroundColor: C.accentLight, color: C.text }}
                        >
                          <div
                            className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                            style={{ color: C.accentDark }}
                          >
                            Briefing
                          </div>
                          {briefing.content}
                        </div>
                      )}
                      {isExp && !briefing && (
                        <div className="mt-1.5 ml-6 text-[10px] italic" style={{ color: C.muted }}>
                          No briefing yet
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Contact cards */}
          {displayedContacts.map((contact, idx) => {
            const isHighlighted = isSearching && idx === highlightedIndex;
            return (
              <div
                key={contact.id}
                className="rounded-[10px]"
                style={{
                  boxShadow: isHighlighted ? `0 0 0 2px ${C.accent}` : undefined,
                  transition: "box-shadow 120ms ease-out",
                }}
              >
                <ContactBlock
                  contact={contact}
                  onAddInteraction={(content, date, type) =>
                    addInteraction.mutate({ contactId: contact.id, content, date, type })
                  }
                  onUpdateInteraction={(id, data) => updateInteraction.mutate({ id, ...data })}
                  onDeleteInteraction={(id) => deleteInteraction.mutate(id)}
                  onCreateFollowup={(content, dueDate, opts) =>
                    createFollowup.mutate({ contactId: contact.id, content, dueDate, ...opts })
                  }
                  onUpdateFollowup={(id, data) => updateFollowup.mutate({ id, ...data })}
                  onDeleteFollowup={(id) => deleteFollowup.mutate(id)}
                  onCompleteFollowup={(id, outcome) => completeFollowup.mutate({ id, outcome })}
                  onUpdateContact={(data) => updateContact.mutate({ id: contact.id, ...data })}
                />
              </div>
            );
          })}
          {displayedContacts.length === 0 && (
            <p className="text-center py-16 text-sm" style={{ color: C.muted }}>
              {isSearching ? "No contacts match your search" : "No contacts in this stage"}
            </p>
          )}
        </main>
      )}
    </div>
  );
}
