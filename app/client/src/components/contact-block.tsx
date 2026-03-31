import { useState, useEffect, useCallback } from "react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { ChevronDown, ChevronRight, Square, AlertTriangle, Trash2 } from "lucide-react";
import type { ContactWithRelations } from "@shared/schema";
import { fmtDate, fmtDateInput } from "@/lib/utils";

const STAGE_OPTIONS = ["LEAD", "MEETING", "PROPOSAL", "NEGOTIATION", "LIVE", "PASS", "RELATIONSHIP"] as const;

const TASK_PREFIX = /^\/(fu|f|follow|followup|todo|task)\s/i;
const TASK_VALID = /^\/(fu|f|follow|followup|todo|task)\s+\d{1,2}\/\d{1,2}/i;
const MTG_PREFIX = /^\/(mtg|meeting)\s/i;
const MTG_VALID = /^\/(mtg|meeting)\s+\d{1,2}\/\d{1,2}/i;

function detectCommand(text: string): { type: "fu" | "mtg" | "stage" | "status" | "none"; isValid: boolean } {
  if (TASK_PREFIX.test(text)) return { type: "fu", isValid: TASK_VALID.test(text) };
  if (MTG_PREFIX.test(text)) return { type: "mtg", isValid: MTG_VALID.test(text) };
  if (/^\/stage\s/i.test(text)) return { type: "stage", isValid: /^\/stage\s+(LEAD|MEETING|PROPOSAL|NEGOTIATION|LIVE|PASS|RELATIONSHIP)\s*$/i.test(text) };
  if (/^\/status\s/i.test(text)) return { type: "status", isValid: /^\/status\s+(ACTIVE|HOLD)\s*$/i.test(text) };
  return { type: "none", isValid: false };
}

const COMMAND_COLORS: Record<string, string> = { fu: "#1a9e96", mtg: "#2563eb", stage: "#2e7d32", status: "#d4880f" };

const C = {
  text: "#1a2f2f", muted: "#5a7a7a", border: "#d4e8e8",
  accent: "#2bbcb3", accentDark: "#1a9e96", accentLight: "#e6f7f6",
  stale: "#d4880f", staleBg: "#fef7ec", red: "#c0392b", redBg: "#fde8e8",
};

interface ContactBlockProps {
  contact: ContactWithRelations;
  accentColor: string;
  onAddInteraction: (content: string, date: string, type?: string) => void;
  onUpdateInteraction: (id: number, data: { content?: string; type?: string }) => void;
  onDeleteInteraction: (id: number) => void;
  onCreateFollowup: (content: string, dueDate: string, opts?: { type?: string; time?: string; location?: string }) => void;
  onUpdateFollowup: (id: number, data: { content?: string; dueDate?: string }) => void;
  onDeleteFollowup: (id: number) => void;
  onCompleteFollowup: (id: number, outcome?: string) => void;
  onUpdateContact: (data: Record<string, unknown>) => void;
}

export function ContactBlock({
  contact, accentColor,
  onAddInteraction, onUpdateInteraction, onDeleteInteraction,
  onCreateFollowup, onUpdateFollowup, onDeleteFollowup, onCompleteFollowup,
  onUpdateContact,
}: ContactBlockProps) {
  const isInactive = contact.status !== "ACTIVE";
  const [isExpanded, setIsExpanded] = useState(!isInactive);
  const [showDetails, setShowDetails] = useState(false);
  const [showAllInteractions, setShowAllInteractions] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [editingInteractionId, setEditingInteractionId] = useState<number | null>(null);
  const [editingInteractionText, setEditingInteractionText] = useState("");
  const [editingBackground, setEditingBackground] = useState(false);
  const [backgroundText, setBackgroundText] = useState(contact.background || "");
  const [editingFollowupId, setEditingFollowupId] = useState<number | null>(null);
  const [editingFollowupText, setEditingFollowupText] = useState("");
  const [editingFollowupDate, setEditingFollowupDate] = useState("");
  const [completingFollowupId, setCompletingFollowupId] = useState<number | null>(null);
  const [completingFollowupText, setCompletingFollowupText] = useState("");

  const companyName = contact.company?.name || "";
  const hasViolations = contact.violations.length > 0;
  const activeFollowups = contact.followups.filter((f) => !f.completed);
  const lastInteraction = contact.interactions.length > 0 ? contact.interactions[contact.interactions.length - 1] : null;
  const daysSinceLastTouch = lastInteraction ? differenceInDays(new Date(), new Date(lastInteraction.date)) : null;
  const isStale = daysSinceLastTouch !== null && daysSinceLastTouch > 14 && contact.status === "ACTIVE";
  const hasDetails = !!(contact.background || contact.source || contact.additionalContacts || contact.cadence || contact.email || contact.phone || contact.website || contact.title);

  useEffect(() => { setBackgroundText(contact.background || ""); }, [contact.background]);

  const showFlash = useCallback((msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 2000); }, []);

  const handleNoteSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newNote.trim()) {
      const fuMatch = newNote.match(/^\/(fu|f|follow|followup|todo|task)\s+(\d{1,2}\/\d{1,2})\s*(.*)/i);
      if (fuMatch) {
        const [, , dateStr, content] = fuMatch;
        const [month, day] = dateStr.split("/").map(Number);
        const year = new Date().getFullYear();
        const dueDate = new Date(year, month - 1, day);
        if (dueDate < new Date()) dueDate.setFullYear(year + 1);
        onCreateFollowup(content || "Follow up", dueDate.toISOString());
        setNewNote(""); showFlash(`Task set for ${month}/${day}`); return;
      }

      // Meeting command: /mtg 4/3 2pm Coffee with Idan @ Century City
      const mtgMatch = newNote.match(/^\/(mtg|meeting)\s+(\d{1,2}\/\d{1,2})\s*(.*)/i);
      if (mtgMatch) {
        const [, , dateStr, rest] = mtgMatch;
        const [month, day] = dateStr.split("/").map(Number);
        const year = new Date().getFullYear();
        const dueDate = new Date(year, month - 1, day);
        if (dueDate < new Date()) dueDate.setFullYear(year + 1);

        // Parse optional time and location: "2pm Coffee with Idan @ Century City"
        let time = "";
        let content = rest.trim();
        let location = "";

        // Extract time (e.g., "2pm", "2:00pm", "14:00")
        const timeMatch = content.match(/^(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+/i);
        if (timeMatch) {
          time = timeMatch[1].trim();
          content = content.slice(timeMatch[0].length);
        }

        // Extract location after @
        const locMatch = content.match(/\s*@\s*(.+)$/);
        if (locMatch) {
          location = locMatch[1].trim();
          content = content.slice(0, -locMatch[0].length).trim();
        }

        onCreateFollowup(content || "Meeting", dueDate.toISOString(), { type: "meeting", time, location });
        setNewNote(""); showFlash(`Meeting set for ${month}/${day}`); return;
      }

      const statusMatch = newNote.match(/^\/status\s+(ACTIVE|HOLD)/i);
      if (statusMatch) { onUpdateContact({ status: statusMatch[1].toUpperCase() }); setNewNote(""); showFlash(`Status → ${statusMatch[1].toUpperCase()}`); return; }
      const stageMatch = newNote.match(/^\/stage\s+(\w+)/i);
      if (stageMatch) { const s = stageMatch[1].toUpperCase(); if (STAGE_OPTIONS.includes(s as any)) { onUpdateContact({ stage: s }); setNewNote(""); showFlash(`Stage → ${s}`); return; } }
      onAddInteraction(newNote, new Date().toISOString(), "note");
      setNewNote(""); showFlash("Note added");
    }
  };

  const handleStageClick = (stage: string) => { onUpdateContact({ stage }); setShowStageMenu(false); showFlash(`Stage → ${stage}`); };
  const handleBackgroundSave = () => { if (backgroundText !== (contact.background || "")) { onUpdateContact({ background: backgroundText }); showFlash("Updated"); } setEditingBackground(false); };
  const handleInteractionSave = (id: number) => { if (editingInteractionText.trim()) { onUpdateInteraction(id, { content: editingInteractionText }); showFlash("Updated"); } setEditingInteractionId(null); };
  const handleFollowupSave = (id: number, origDate: string) => {
    const updates: { content?: string; dueDate?: string } = {};
    if (editingFollowupText.trim()) updates.content = editingFollowupText;
    if (editingFollowupDate && editingFollowupDate !== origDate) updates.dueDate = new Date(editingFollowupDate + "T12:00:00").toISOString();
    if (Object.keys(updates).length > 0) { onUpdateFollowup(id, updates); showFlash("Updated"); }
    setEditingFollowupId(null);
  };

  const command = detectCommand(newNote);
  const inputColor = command.type !== "none" ? COMMAND_COLORS[command.type] : undefined;

  return (
    <div
      className={`relative bg-white mb-2 ${isInactive ? "opacity-50 hover:opacity-75" : ""}`}
      style={{ border: `1px solid ${C.border}`, borderRadius: "10px", padding: "0.75rem 1rem" }}
    >
      {flash && (
        <div className="absolute top-2 right-3 text-[10px] font-medium px-2 py-0.5 rounded z-10 animate-pulse"
          style={{ color: C.accentDark, backgroundColor: C.accentLight }}>
          {flash}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-bold leading-tight" style={{ color: C.text }}>
          {contact.firstName} {contact.lastName}
        </h2>

        {companyName && (
          <span className="text-xs" style={{ color: C.muted }}>{companyName}</span>
        )}

        <div className="relative ml-auto">
          <button onClick={(e) => { e.stopPropagation(); setShowStageMenu(!showStageMenu); }}
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors hover:opacity-80"
            style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
            {contact.stage}
          </button>
          {showStageMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowStageMenu(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg z-20 py-1 min-w-[130px]" style={{ border: `1px solid ${C.border}` }}>
                {STAGE_OPTIONS.map((s) => (
                  <button key={s} onClick={() => handleStageClick(s)}
                    className="block w-full text-left px-3 py-1 text-[11px] transition-colors hover:opacity-70"
                    style={{ color: s === contact.stage ? C.text : C.muted, fontWeight: s === contact.stage ? 600 : 400, backgroundColor: s === contact.stage ? C.accentLight : "transparent" }}>
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {isInactive && contact.status !== contact.stage && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: contact.status === "HOLD" ? "#f0ecf8" : C.redBg, color: contact.status === "HOLD" ? "#6c5ce7" : C.red }}>
            {contact.status}
          </span>
        )}

        {isStale && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: C.stale }} />}
        {hasViolations && !isStale && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" style={{ color: C.stale }} />}
      </div>

      {/* Details preview — first two lines, then "more..." */}
      {hasDetails && (() => {
        const lines: string[] = [];
        if (contact.title) lines.push(contact.title + (contact.location ? ` · ${contact.location}` : ""));
        else if (contact.location) lines.push(contact.location);
        if (contact.source) lines.push(`Via ${contact.source}`);
        if (contact.email) lines.push(contact.email);
        if (contact.cadence) lines.push(contact.cadence);
        const hasMore = lines.length > 2 || contact.background || contact.additionalContacts || contact.phone || contact.website;
        const previewLines = lines.slice(0, 2);

        return (
          <div className="mt-1 text-[11px]" style={{ color: C.muted }}>
            {!showDetails ? (
              <div>
                {previewLines.join(" · ")}
                {hasMore && (
                  <button onClick={() => setShowDetails(true)} className="ml-1 transition-colors hover:opacity-70" style={{ color: C.accentDark }}>
                    more...
                  </button>
                )}
              </div>
            ) : (
              <div className="leading-relaxed space-y-0.5 pl-3" style={{ borderLeft: `2px solid ${C.border}` }}>
                {contact.title && <div>{contact.title}{contact.location ? ` · ${contact.location}` : ""}</div>}
                {!contact.title && contact.location && <div>{contact.location}</div>}
                {contact.email && <div>{contact.email}</div>}
                {contact.phone && <div>{contact.phone}</div>}
                {contact.website && <div>{contact.website}</div>}
                {contact.source && <div>Via {contact.source}</div>}
                {contact.additionalContacts && <div className="italic">{contact.additionalContacts}</div>}
                {contact.cadence && <div className="font-medium">{contact.cadence}</div>}
                {editingBackground ? (
                  <textarea autoFocus value={backgroundText} onChange={(e) => setBackgroundText(e.target.value)}
                    onBlur={handleBackgroundSave}
                    onKeyDown={(e) => { if (e.key === "Escape") { setEditingBackground(false); setBackgroundText(contact.background || ""); } }}
                    className="w-full text-xs rounded p-1.5 outline-none resize-none min-h-[40px] mt-1"
                    style={{ color: C.text, backgroundColor: C.accentLight, border: `1px solid ${C.border}` }} />
                ) : contact.background ? (
                  <div onClick={() => setEditingBackground(true)} className="cursor-text rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-[#e6f7f6] mt-0.5">
                    {contact.background}
                  </div>
                ) : null}
                <button onClick={() => setShowDetails(false)} className="transition-colors hover:opacity-70" style={{ color: C.accentDark }}>
                  less
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Content — always visible */}
      <div className="mt-2">
          {/* Interactions — last 3, "show earlier" above */}
          {contact.interactions.length > 0 && (() => {
            const VISIBLE_COUNT = 3;
            const total = contact.interactions.length;
            const hiddenCount = total - VISIBLE_COUNT;
            const showToggle = total > VISIBLE_COUNT && !showAllInteractions;
            const visibleInteractions = showAllInteractions ? contact.interactions : contact.interactions.slice(-VISIBLE_COUNT);

            return (
              <div className="space-y-0.5 mb-2">
                {showToggle && (
                  <button onClick={() => setShowAllInteractions(true)}
                    className="text-[11px] font-medium mb-0.5 transition-colors hover:opacity-70" style={{ color: C.accentDark }}>
                    Show {hiddenCount} earlier...
                  </button>
                )}
                {showAllInteractions && total > VISIBLE_COUNT && (
                  <button onClick={() => setShowAllInteractions(false)}
                    className="text-[11px] font-medium mb-0.5 transition-colors hover:opacity-70" style={{ color: C.muted }}>
                    Hide earlier
                  </button>
                )}
                {visibleInteractions.map((interaction) => {
                  const isEditing = editingInteractionId === interaction.id;
                  if (isEditing) {
                    return (
                      <div key={interaction.id} className="flex items-start gap-1.5 text-xs">
                        <span className="font-semibold flex-shrink-0 pt-0.5" style={{ color: C.accentDark }}>
                          {fmtDate(interaction.date)}
                        </span>
                        <input autoFocus value={editingInteractionText} onChange={(e) => setEditingInteractionText(e.target.value)}
                          onBlur={() => handleInteractionSave(interaction.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleInteractionSave(interaction.id); if (e.key === "Escape") setEditingInteractionId(null); }}
                          className="flex-1 text-xs rounded px-1.5 py-0.5 outline-none" style={{ color: C.text, backgroundColor: C.accentLight, border: `1px solid ${C.border}` }} />
                        <button onMouseDown={(e) => { e.preventDefault(); onDeleteInteraction(interaction.id); setEditingInteractionId(null); showFlash("Deleted"); }}
                          className="p-0.5 flex-shrink-0 hover:opacity-70" style={{ color: C.red }}><Trash2 className="h-3 w-3" /></button>
                      </div>
                    );
                  }
                  return (
                    <div key={interaction.id} className="flex items-start gap-1.5 text-xs cursor-text group/line"
                      onClick={() => { setEditingInteractionId(interaction.id); setEditingInteractionText(interaction.content); }}>
                      <span className="font-semibold flex-shrink-0 pt-px" style={{ color: C.accentDark }}>
                        {fmtDate(interaction.date)}
                      </span>
                      <span className="group-hover/line:bg-[#e6f7f6] rounded px-0.5 -mx-0.5 transition-colors" style={{ color: C.text }}>
                        {interaction.content}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Follow-ups */}
          {activeFollowups.length > 0 && (
            <div className="space-y-1 mb-2">
              {activeFollowups.map((fu) => {
                const due = new Date(fu.dueDate);
                const isOverdue = isPast(due) && !isToday(due);
                const isTodayDue = isToday(due);
                const daysUntil = differenceInDays(due, new Date());
                const isEditingFu = editingFollowupId === fu.id;
                const isCompleting = completingFollowupId === fu.id;

                if (isCompleting) {
                  return (
                    <div key={fu.id} className="rounded-lg px-2.5 py-2 space-y-1.5" style={{ backgroundColor: C.accentLight, border: `1px solid ${C.accent}40` }}>
                      <div className="text-[10px] font-medium" style={{ color: C.accentDark }}>Completing: {fu.content}</div>
                      <input autoFocus value={completingFollowupText} onChange={(e) => setCompletingFollowupText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && completingFollowupText.trim()) { onCompleteFollowup(fu.id, completingFollowupText.trim()); setCompletingFollowupId(null); showFlash("Done"); }
                          if (e.key === "Escape") setCompletingFollowupId(null);
                        }}
                        placeholder="What happened?" className="w-full text-xs bg-white rounded px-2 py-1 outline-none" style={{ color: C.text, border: `1px solid ${C.accent}40` }} />
                      <div className="flex items-center gap-2">
                        <button onClick={() => { if (completingFollowupText.trim()) { onCompleteFollowup(fu.id, completingFollowupText.trim()); setCompletingFollowupId(null); showFlash("Done"); } }}
                          className="text-[10px] font-medium text-white px-2 py-0.5 rounded" style={{ backgroundColor: C.accentDark }}>Done</button>
                        <button onClick={() => { onCompleteFollowup(fu.id); setCompletingFollowupId(null); showFlash("Completed"); }}
                          className="text-[10px]" style={{ color: C.muted }}>Skip</button>
                        <button onClick={() => setCompletingFollowupId(null)} className="text-[10px]" style={{ color: C.muted }}>Cancel</button>
                      </div>
                    </div>
                  );
                }

                if (isEditingFu) {
                  return (
                    <div key={fu.id} className="flex items-center gap-1.5 text-xs">
                      <input type="date" value={editingFollowupDate} onChange={(e) => setEditingFollowupDate(e.target.value)}
                        className="text-xs rounded px-1 py-0.5 outline-none w-[110px] flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.text }} />
                      <input autoFocus value={editingFollowupText} onChange={(e) => setEditingFollowupText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleFollowupSave(fu.id, editingFollowupDate); if (e.key === "Escape") setEditingFollowupId(null); }}
                        className="flex-1 text-xs rounded px-1.5 py-0.5 outline-none" style={{ border: `1px solid ${C.border}`, color: C.text }} />
                      <button onMouseDown={(e) => { e.preventDefault(); handleFollowupSave(fu.id, editingFollowupDate); }}
                        className="text-[10px] font-medium" style={{ color: C.accentDark }}>Save</button>
                      <button onMouseDown={(e) => { e.preventDefault(); onDeleteFollowup(fu.id); setEditingFollowupId(null); showFlash("Deleted"); }}
                        className="p-0.5 hover:opacity-70" style={{ color: C.red }}><Trash2 className="h-3 w-3" /></button>
                    </div>
                  );
                }

                const fuColor = isOverdue ? C.red : fu.type === "meeting" ? "#2563eb" : C.accentDark;
                const isMeeting = fu.type === "meeting";
                const icon = isMeeting ? "📅" : null;

                return (
                  <div key={fu.id} className="flex items-center gap-1 text-xs">
                    {isMeeting ? (
                      <span className="flex-shrink-0 text-sm" title="Meeting">{icon}</span>
                    ) : (
                      <button onClick={() => { setCompletingFollowupId(fu.id); setCompletingFollowupText(fu.content); }}
                        className="flex-shrink-0 hover:opacity-70" title="Complete" style={{ color: fuColor }}>
                        <Square className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <span className="cursor-pointer hover:underline decoration-dotted underline-offset-2"
                      onClick={() => { setEditingFollowupId(fu.id); setEditingFollowupText(fu.content); setEditingFollowupDate(fmtDateInput(due)); }}>
                      <span className="font-semibold" style={{ color: fuColor }}>
                        {fmtDate(due)}{fu.time ? ` ${fu.time}` : ""}
                      </span>
                      <span style={{ color: isOverdue ? C.red : C.text }}> {fu.content}</span>
                      {fu.location && <span style={{ color: C.muted }}> — {fu.location}</span>}
                      {isOverdue && <span className="font-semibold" style={{ color: C.red }}> OVERDUE</span>}
                      {isTodayDue && <span className="font-semibold" style={{ color: C.stale }}> TODAY</span>}
                      {!isOverdue && !isTodayDue && daysUntil <= 7 && <span style={{ color: C.muted }}> {daysUntil}d</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Violations */}
          {contact.violations.map((v) => (
            <div key={v.id} className="flex items-center gap-1 text-xs mb-0.5" style={{ color: C.stale }}>
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              <span>{v.message}</span>
            </div>
          ))}

          {/* Command input */}
          <div className="mt-1.5 pt-1.5" style={{ borderTop: `1px dashed ${C.border}` }}>
            <div className="relative">
              {command.type !== "none" && (
                <div className="absolute -top-4 left-0 text-[9px] font-mono px-1 py-px rounded"
                  style={{ color: COMMAND_COLORS[command.type], backgroundColor: `${COMMAND_COLORS[command.type]}10` }}>
                  {command.type === "fu" && (command.isValid ? "task ready — Enter" : "/fu M/D action")}
                  {command.type === "mtg" && (command.isValid ? "meeting ready — Enter" : "/mtg M/D time description @ location")}
                  {command.type === "stage" && (command.isValid ? "ready — Enter" : "/stage ...")}
                  {command.type === "status" && (command.isValid ? "ready — Enter" : "/status ...")}
                </div>
              )}
              <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={handleNoteSubmit}
                placeholder="+ note, /fu 4/15 task, /mtg 4/3 2pm meeting"
                className="w-full text-xs bg-transparent border-none outline-none transition-colors"
                style={{ color: inputColor || C.muted, fontWeight: command.type !== "none" ? 500 : undefined,
                  fontFamily: command.type !== "none" ? "'JetBrains Mono', monospace" : undefined }} />
            </div>
          </div>
      </div>
    </div>
  );
}
