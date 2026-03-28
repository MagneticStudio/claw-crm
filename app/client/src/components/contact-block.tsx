import { useState, useEffect, useCallback } from "react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { ChevronDown, ChevronRight, Square, AlertTriangle, Trash2 } from "lucide-react";
import type { ContactWithRelations } from "@shared/schema";

const STAGE_OPTIONS = ["LEAD", "MEETING", "PROPOSAL", "NEGOTIATION", "LIVE", "HOLD", "PASS", "RELATIONSHIP"] as const;

const FU_PREFIX = /^\/(fu|f|follow|followup|todo|task)\s/i;
const FU_VALID = /^\/(fu|f|follow|followup|todo|task)\s+\d{1,2}\/\d{1,2}/i;

function detectCommand(text: string): { type: "fu" | "stage" | "status" | "none"; isValid: boolean } {
  if (FU_PREFIX.test(text)) {
    return { type: "fu", isValid: FU_VALID.test(text) };
  }
  if (/^\/stage\s/i.test(text)) {
    return { type: "stage", isValid: /^\/stage\s+(LEAD|MEETING|PROPOSAL|NEGOTIATION|LIVE|HOLD|PASS|RELATIONSHIP)\s*$/i.test(text) };
  }
  if (/^\/status\s/i.test(text)) {
    return { type: "status", isValid: /^\/status\s+(ACTIVE|HOLD|PASS)\s*$/i.test(text) };
  }
  return { type: "none", isValid: false };
}

const COMMAND_COLORS: Record<string, string> = {
  fu: "#1a9e96",
  stage: "#2e7d32",
  status: "#d4880f",
};

const C = {
  text: "#1a2f2f",
  muted: "#5a7a7a",
  border: "#d4e8e8",
  accent: "#2bbcb3",
  accentDark: "#1a9e96",
  accentLight: "#e6f7f6",
  stale: "#d4880f",
  staleBg: "#fef7ec",
  red: "#c0392b",
  redBg: "#fde8e8",
};

// Status badge styles matching the original CRM
const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: C.accentLight, color: C.accentDark },
  HOLD: { bg: "#f0ecf8", color: "#6c5ce7" },
  PASS: { bg: C.redBg, color: C.red },
};

interface ContactBlockProps {
  contact: ContactWithRelations;
  accentColor: string;
  onAddInteraction: (content: string, date: string, type?: string) => void;
  onUpdateInteraction: (id: number, data: { content?: string; type?: string }) => void;
  onDeleteInteraction: (id: number) => void;
  onCreateFollowup: (content: string, dueDate: string) => void;
  onUpdateFollowup: (id: number, data: { content?: string; dueDate?: string }) => void;
  onDeleteFollowup: (id: number) => void;
  onCompleteFollowup: (id: number, outcome?: string) => void;
  onUpdateContact: (data: Record<string, unknown>) => void;
}

export function ContactBlock({
  contact,
  accentColor,
  onAddInteraction,
  onUpdateInteraction,
  onDeleteInteraction,
  onCreateFollowup,
  onUpdateFollowup,
  onDeleteFollowup,
  onCompleteFollowup,
  onUpdateContact,
}: ContactBlockProps) {
  const isInactive = contact.status !== "ACTIVE";
  const [isExpanded, setIsExpanded] = useState(!isInactive);
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
  const overdueFollowups = activeFollowups.filter((f) => isPast(new Date(f.dueDate)) && !isToday(new Date(f.dueDate)));

  const lastInteraction = contact.interactions.length > 0
    ? contact.interactions[contact.interactions.length - 1]
    : null;
  const daysSinceLastTouch = lastInteraction
    ? differenceInDays(new Date(), new Date(lastInteraction.date))
    : null;
  const isStale = daysSinceLastTouch !== null && daysSinceLastTouch > 14 && contact.status === "ACTIVE";

  useEffect(() => { setBackgroundText(contact.background || ""); }, [contact.background]);

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2000);
  }, []);

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
        setNewNote("");
        showFlash(`Follow-up set for ${month}/${day}`);
        return;
      }
      const statusMatch = newNote.match(/^\/status\s+(ACTIVE|HOLD|PASS)/i);
      if (statusMatch) { onUpdateContact({ status: statusMatch[1].toUpperCase() }); setNewNote(""); showFlash(`Status → ${statusMatch[1].toUpperCase()}`); return; }
      const stageMatch = newNote.match(/^\/stage\s+(\w+)/i);
      if (stageMatch) { const s = stageMatch[1].toUpperCase(); if (STAGE_OPTIONS.includes(s as any)) { onUpdateContact({ stage: s }); setNewNote(""); showFlash(`Stage → ${s}`); return; } }
      onAddInteraction(newNote, new Date().toISOString(), "note");
      setNewNote("");
      showFlash("Note added");
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
  const statusStyle = STATUS_STYLES[contact.status] || STATUS_STYLES.ACTIVE;

  return (
    <div
      className={`relative bg-white mb-4 ${isInactive ? "opacity-60 hover:opacity-80" : ""}`}
      style={{ border: `1px solid ${C.border}`, borderLeft: `4px solid ${accentColor}`, borderRadius: "12px", padding: "1.25rem" }}
    >
      {flash && (
        <div className="absolute top-3 right-4 text-xs font-medium px-2 py-0.5 rounded-md z-10 animate-pulse"
          style={{ color: C.accentDark, backgroundColor: C.accentLight, border: `1px solid ${C.border}` }}>
          {flash}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start gap-2">
        <button onClick={() => setIsExpanded(!isExpanded)} className="mt-1 flex-shrink-0 transition-colors hover:opacity-70" style={{ color: C.muted }}>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold leading-tight" style={{ color: C.text }}>
              {contact.firstName} {contact.lastName}
            </h2>

            {/* Status badge */}
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
              {contact.status}
            </span>

            {/* Stage badge - clickable */}
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowStageMenu(!showStageMenu); }}
                className="text-xs font-medium px-2 py-0.5 rounded-full transition-colors hover:opacity-80"
                style={{ backgroundColor: `${accentColor}15`, color: accentColor }}>
                {contact.stage}
              </button>
              {showStageMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowStageMenu(false)} />
                  <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg z-20 py-1 min-w-[140px]" style={{ border: `1px solid ${C.border}` }}>
                    {STAGE_OPTIONS.map((s) => (
                      <button key={s} onClick={() => handleStageClick(s)}
                        className="block w-full text-left px-3 py-1.5 text-xs transition-colors hover:opacity-70"
                        style={{ color: s === contact.stage ? C.text : C.muted, fontWeight: s === contact.stage ? 600 : 400, backgroundColor: s === contact.stage ? C.accentLight : "transparent" }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Stale warning */}
            {isStale && (
              <span className="text-xs font-semibold flex items-center gap-1" style={{ color: C.stale }}>
                <AlertTriangle className="h-3.5 w-3.5" /> STALE
              </span>
            )}

            {/* Violations */}
            {hasViolations && !isStale && (
              <span className="text-xs font-semibold flex items-center gap-1" style={{ color: C.stale }}>
                <AlertTriangle className="h-3.5 w-3.5" /> {contact.violations.length} alert{contact.violations.length > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Company - own line */}
          {companyName && (
            <div className="text-[15px] mt-0.5" style={{ color: C.text }}>{companyName}</div>
          )}

          {/* Meta line */}
          <div className="text-sm mt-1 leading-relaxed" style={{ color: C.muted }}>
            {contact.title && <span>{contact.title}</span>}
            {contact.title && contact.location && <span> | </span>}
            {contact.location && <span>{contact.location}</span>}
            {contact.email && <span> &nbsp; ✉️ {contact.email}</span>}
            {contact.phone && <span> | {contact.phone}</span>}
          </div>
          {contact.website && (
            <div className="text-sm" style={{ color: C.muted }}>🌐 {contact.website}</div>
          )}
        </div>
      </div>

      {/* Expanded */}
      {isExpanded && (
        <div className="mt-3 ml-6">
          {/* Background */}
          {(contact.background || contact.source || contact.additionalContacts || contact.cadence || editingBackground) && (
            <div className="text-sm mb-4 leading-relaxed" style={{ color: C.muted }}>
              {editingBackground ? (
                <textarea autoFocus value={backgroundText} onChange={(e) => setBackgroundText(e.target.value)}
                  onBlur={handleBackgroundSave}
                  onKeyDown={(e) => { if (e.key === "Escape") { setEditingBackground(false); setBackgroundText(contact.background || ""); } }}
                  className="w-full text-sm rounded-lg p-2 outline-none resize-none min-h-[60px]"
                  style={{ color: C.text, backgroundColor: C.accentLight, border: `1px solid ${C.border}` }} />
              ) : (
                contact.background && (
                  <p onClick={() => setEditingBackground(true)} className="cursor-text rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-[#e6f7f6]">
                    {contact.background}
                  </p>
                )
              )}
              {contact.additionalContacts && <p>{contact.additionalContacts}</p>}
              {contact.source && <p>Via: {contact.source}</p>}
              {contact.cadence && <p className="font-medium">{contact.cadence}</p>}
            </div>
          )}

          {/* Interactions */}
          {contact.interactions.length > 0 && (() => {
            const VISIBLE_COUNT = 3;
            const total = contact.interactions.length;
            const hiddenCount = total - VISIBLE_COUNT;
            const showToggle = total > VISIBLE_COUNT && !showAllInteractions;
            const visibleInteractions = showAllInteractions
              ? contact.interactions
              : contact.interactions.slice(-VISIBLE_COUNT);

            return (
              <div className="space-y-1.5 mb-4">
                {showToggle && (
                  <button
                    onClick={() => setShowAllInteractions(true)}
                    className="text-xs font-medium transition-colors hover:opacity-70"
                    style={{ color: C.accentDark }}
                  >
                    Show {hiddenCount} earlier note{hiddenCount !== 1 ? "s" : ""}...
                  </button>
                )}
                {showAllInteractions && total > VISIBLE_COUNT && (
                  <button
                    onClick={() => setShowAllInteractions(false)}
                    className="text-xs font-medium transition-colors hover:opacity-70"
                    style={{ color: C.muted }}
                  >
                    Hide earlier
                  </button>
                )}
                {visibleInteractions.map((interaction) => {
                  const isEditing = editingInteractionId === interaction.id;
                  if (isEditing) {
                    return (
                      <div key={interaction.id} className="flex items-start gap-2 text-sm">
                        <span className="font-bold flex-shrink-0 pt-0.5" style={{ color: C.accentDark }}>
                          {format(new Date(interaction.date), "M/d")}:
                        </span>
                        <input autoFocus value={editingInteractionText} onChange={(e) => setEditingInteractionText(e.target.value)}
                          onBlur={() => handleInteractionSave(interaction.id)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleInteractionSave(interaction.id); if (e.key === "Escape") setEditingInteractionId(null); }}
                          className="flex-1 text-sm rounded px-2 py-0.5 outline-none" style={{ color: C.text, backgroundColor: C.accentLight, border: `1px solid ${C.border}` }} />
                        <button onMouseDown={(e) => { e.preventDefault(); onDeleteInteraction(interaction.id); setEditingInteractionId(null); showFlash("Deleted"); }}
                          className="p-0.5 flex-shrink-0 hover:opacity-70" style={{ color: C.red }}><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    );
                  }
                  return (
                    <div key={interaction.id} className="flex items-start gap-2 text-sm cursor-text group/line"
                      onClick={() => { setEditingInteractionId(interaction.id); setEditingInteractionText(interaction.content); }}>
                      <span className="font-bold flex-shrink-0 pt-0.5" style={{ color: C.accentDark }}>
                        {format(new Date(interaction.date), "M/d")}:
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
            <div className="space-y-2 mb-3">
              {activeFollowups.map((fu) => {
                const due = new Date(fu.dueDate);
                const isOverdue = isPast(due) && !isToday(due);
                const isTodayDue = isToday(due);
                const daysUntil = differenceInDays(due, new Date());
                const isEditingFu = editingFollowupId === fu.id;
                const isCompleting = completingFollowupId === fu.id;

                if (isCompleting) {
                  return (
                    <div key={fu.id} className="rounded-lg px-3 py-2 space-y-2" style={{ backgroundColor: C.accentLight, border: `1px solid ${C.accent}40` }}>
                      <div className="text-xs font-medium" style={{ color: C.accentDark }}>Completing: {format(due, "M/d")} {fu.content}</div>
                      <input autoFocus value={completingFollowupText} onChange={(e) => setCompletingFollowupText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && completingFollowupText.trim()) { onCompleteFollowup(fu.id, completingFollowupText.trim()); setCompletingFollowupId(null); showFlash("Done — logged"); }
                          if (e.key === "Escape") setCompletingFollowupId(null);
                        }}
                        placeholder="What happened?" className="w-full text-sm bg-white rounded px-2 py-1 outline-none" style={{ color: C.text, border: `1px solid ${C.accent}40` }} />
                      <div className="flex items-center gap-2">
                        <button onClick={() => { if (completingFollowupText.trim()) { onCompleteFollowup(fu.id, completingFollowupText.trim()); setCompletingFollowupId(null); showFlash("Done — logged"); } }}
                          className="text-xs font-medium text-white px-2.5 py-1 rounded transition-colors" style={{ backgroundColor: C.accentDark }}>Done</button>
                        <button onClick={() => { onCompleteFollowup(fu.id); setCompletingFollowupId(null); showFlash("Completed"); }}
                          className="text-xs" style={{ color: C.muted }}>Skip note</button>
                        <button onClick={() => setCompletingFollowupId(null)} className="text-xs" style={{ color: C.muted }}>Cancel</button>
                      </div>
                    </div>
                  );
                }

                if (isEditingFu) {
                  return (
                    <div key={fu.id} className="flex items-center gap-2 text-sm">
                      <input type="date" value={editingFollowupDate} onChange={(e) => setEditingFollowupDate(e.target.value)}
                        className="text-sm rounded px-1 py-0.5 outline-none w-[130px] flex-shrink-0" style={{ border: `1px solid ${C.border}`, color: C.text }} />
                      <input autoFocus value={editingFollowupText} onChange={(e) => setEditingFollowupText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleFollowupSave(fu.id, editingFollowupDate); if (e.key === "Escape") setEditingFollowupId(null); }}
                        className="flex-1 text-sm rounded px-2 py-0.5 outline-none" style={{ border: `1px solid ${C.border}`, color: C.text }} />
                      <button onMouseDown={(e) => { e.preventDefault(); handleFollowupSave(fu.id, editingFollowupDate); }}
                        className="text-xs font-medium px-2 py-0.5 rounded" style={{ color: C.accentDark }}>Save</button>
                      <button onMouseDown={(e) => { e.preventDefault(); onDeleteFollowup(fu.id); setEditingFollowupId(null); showFlash("Deleted"); }}
                        className="p-0.5 hover:opacity-70" style={{ color: C.red }}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  );
                }

                return (
                  <div key={fu.id} className="flex items-start gap-1 text-sm">
                    <button onClick={() => { setCompletingFollowupId(fu.id); setCompletingFollowupText(fu.content); }}
                      className="flex-shrink-0 mt-0.5 hover:opacity-70" title="Complete" style={{ color: isOverdue ? C.red : C.accentDark }}>
                      <Square className="h-4 w-4" />
                    </button>
                    <span
                      className="cursor-pointer"
                      onClick={() => { setEditingFollowupId(fu.id); setEditingFollowupText(fu.content); setEditingFollowupDate(format(due, "yyyy-MM-dd")); }}
                    >
                      <span className="font-bold" style={{ color: isOverdue ? C.red : C.accentDark }}>
                        📌 FU by {format(due, "M/d")}: </span>
                      <span style={{ color: isOverdue ? C.red : C.text }}>{fu.content}</span>
                      {isOverdue && (
                        <span className="font-semibold ml-1" style={{ color: C.red }}> ⚠️ OVERDUE</span>
                      )}
                      {isTodayDue && (
                        <span className="font-semibold ml-1" style={{ color: C.stale }}> TODAY</span>
                      )}
                      {!isOverdue && !isTodayDue && daysUntil <= 7 && (
                        <span className="ml-1" style={{ color: C.muted }}> (in {daysUntil}d)</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Violations */}
          {contact.violations.map((v) => (
            <div key={v.id} className="flex items-center gap-1.5 text-sm mb-1" style={{ color: C.stale }}>
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{v.message}</span>
            </div>
          ))}

          {/* Command input */}
          <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${C.border}` }}>
            <div className="relative">
              {command.type !== "none" && (
                <div className="absolute -top-5 left-0 text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{ color: COMMAND_COLORS[command.type], backgroundColor: `${COMMAND_COLORS[command.type]}10` }}>
                  {command.type === "fu" && (command.isValid ? "follow-up ready — press Enter" : "/fu M/D action")}
                  {command.type === "stage" && (command.isValid ? "stage ready — press Enter" : "/stage LEAD|MEETING|...")}
                  {command.type === "status" && (command.isValid ? "status ready — press Enter" : "/status ACTIVE|HOLD|PASS")}
                </div>
              )}
              <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} onKeyDown={handleNoteSubmit}
                placeholder="+ note, /fu 4/15 task, /stage LIVE"
                className="w-full text-sm bg-transparent border-none outline-none transition-colors"
                style={{
                  color: inputColor || C.muted,
                  fontWeight: command.type !== "none" ? 500 : undefined,
                  fontFamily: command.type !== "none" ? "'JetBrains Mono', monospace" : undefined,
                }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
