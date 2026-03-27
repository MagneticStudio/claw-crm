import { useState, useRef, useEffect, useCallback } from "react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { ChevronDown, ChevronRight, Check, AlertTriangle, Mail, Phone, Globe, Calendar, PhoneCall, Pencil, Clock, X, Trash2 } from "lucide-react";
import type { ContactWithRelations } from "@shared/schema";

const STAGE_OPTIONS = ["LEAD", "MEETING", "PROPOSAL", "NEGOTIATION", "LIVE", "HOLD", "PASS", "RELATIONSHIP"] as const;

const INTERACTION_ICON: Record<string, typeof Mail> = {
  email: Mail,
  meeting: Calendar,
  call: PhoneCall,
  note: Pencil,
};

// Detect if the input text is a command
function detectCommand(text: string): { type: "fu" | "stage" | "status" | "none"; isValid: boolean } {
  if (/^\/fu?\s/i.test(text)) {
    const valid = /^\/fu?\s+\d{1,2}\/\d{1,2}/i.test(text);
    return { type: "fu", isValid: valid };
  }
  if (/^\/stage\s/i.test(text)) {
    const valid = /^\/stage\s+(LEAD|MEETING|PROPOSAL|NEGOTIATION|LIVE|HOLD|PASS|RELATIONSHIP)\s*$/i.test(text);
    return { type: "stage", isValid: valid };
  }
  if (/^\/status\s/i.test(text)) {
    const valid = /^\/status\s+(ACTIVE|HOLD|PASS)\s*$/i.test(text);
    return { type: "status", isValid: valid };
  }
  return { type: "none", isValid: false };
}

const COMMAND_COLORS: Record<string, string> = {
  fu: "#7c3aed",
  stage: "#059669",
  status: "#d97706",
};

interface ContactBlockProps {
  contact: ContactWithRelations;
  accentColor: string;
  onAddInteraction: (content: string, date: string, type?: string) => void;
  onUpdateInteraction: (id: number, data: { content?: string; type?: string }) => void;
  onDeleteInteraction: (id: number) => void;
  onCreateFollowup: (content: string, dueDate: string) => void;
  onUpdateFollowup: (id: number, data: { content?: string; dueDate?: string }) => void;
  onCompleteFollowup: (id: number) => void;
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
  onCompleteFollowup,
  onUpdateContact,
}: ContactBlockProps) {
  const isInactive = contact.status !== "ACTIVE";
  const [isExpanded, setIsExpanded] = useState(!isInactive);
  const [newNote, setNewNote] = useState("");
  const [showStageMenu, setShowStageMenu] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [editingInteractionId, setEditingInteractionId] = useState<number | null>(null);
  const [editingInteractionText, setEditingInteractionText] = useState("");
  const [editingBackground, setEditingBackground] = useState(false);
  const [backgroundText, setBackgroundText] = useState(contact.background || "");
  const [editingFollowupId, setEditingFollowupId] = useState<number | null>(null);
  const [editingFollowupText, setEditingFollowupText] = useState("");

  const companyName = contact.company?.name || "";
  const hasViolations = contact.violations.length > 0;
  const activeFollowups = contact.followups.filter((f) => !f.completed);
  const overdueFollowups = activeFollowups.filter((f) => isPast(new Date(f.dueDate)) && !isToday(new Date(f.dueDate)));
  const upcomingFollowups = activeFollowups.filter((f) => !isPast(new Date(f.dueDate)) || isToday(new Date(f.dueDate)));

  const lastInteraction = contact.interactions.length > 0
    ? contact.interactions[contact.interactions.length - 1]
    : null;
  const daysSinceLastTouch = lastInteraction
    ? differenceInDays(new Date(), new Date(lastInteraction.date))
    : null;

  // Keep background in sync with prop
  useEffect(() => {
    setBackgroundText(contact.background || "");
  }, [contact.background]);

  const showFlash = useCallback((msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2000);
  }, []);

  const handleNoteSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newNote.trim()) {
      const fuMatch = newNote.match(/^\/fu?\s+(\d{1,2}\/\d{1,2})\s*(.*)/i);
      if (fuMatch) {
        const [, dateStr, content] = fuMatch;
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
      if (statusMatch) {
        onUpdateContact({ status: statusMatch[1].toUpperCase() });
        setNewNote("");
        showFlash(`Status → ${statusMatch[1].toUpperCase()}`);
        return;
      }

      const stageMatch = newNote.match(/^\/stage\s+(\w+)/i);
      if (stageMatch) {
        const stage = stageMatch[1].toUpperCase();
        if (STAGE_OPTIONS.includes(stage as any)) {
          onUpdateContact({ stage });
          setNewNote("");
          showFlash(`Stage → ${stage}`);
          return;
        }
      }

      onAddInteraction(newNote, new Date().toISOString(), "note");
      setNewNote("");
      showFlash("Note added");
    }
  };

  const handleStageClick = (stage: string) => {
    onUpdateContact({ stage });
    setShowStageMenu(false);
    showFlash(`Stage → ${stage}`);
  };

  const handleBackgroundSave = () => {
    if (backgroundText !== (contact.background || "")) {
      onUpdateContact({ background: backgroundText });
      showFlash("Background updated");
    }
    setEditingBackground(false);
  };

  const handleInteractionSave = (id: number) => {
    if (editingInteractionText.trim()) {
      onUpdateInteraction(id, { content: editingInteractionText });
      showFlash("Note updated");
    }
    setEditingInteractionId(null);
  };

  const handleFollowupSave = (id: number) => {
    if (editingFollowupText.trim()) {
      onUpdateFollowup(id, { content: editingFollowupText });
      showFlash("Follow-up updated");
    }
    setEditingFollowupId(null);
  };

  // Command detection for input styling
  const command = detectCommand(newNote);
  const inputColor = command.type !== "none" ? COMMAND_COLORS[command.type] : undefined;

  const daysSinceLabel = daysSinceLastTouch === null
    ? null
    : daysSinceLastTouch === 0 ? "today" : `${daysSinceLastTouch}d`;

  const daysSinceUrgency = daysSinceLastTouch === null
    ? ""
    : daysSinceLastTouch > 14 ? "text-red-600 font-semibold"
    : daysSinceLastTouch > 7 ? "text-amber-600 font-medium"
    : "text-stone-400";

  return (
    <div
      className={`relative bg-white rounded-lg mb-2 transition-all group ${isInactive ? "opacity-50 hover:opacity-75" : ""}`}
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      {hasViolations && (
        <div className="absolute inset-0 rounded-lg ring-1 ring-amber-300/60 pointer-events-none" />
      )}

      {/* Flash confirmation */}
      {flash && (
        <div className="absolute top-2 right-4 text-[10px] font-mono font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md z-10 animate-pulse">
          {flash}
        </div>
      )}

      <div className="px-4 py-3">
        {/* Header row */}
        <div className="flex items-start gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-0.5 text-stone-300 hover:text-stone-500 flex-shrink-0 transition-colors"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <h2 className="text-[14px] font-semibold text-stone-900 leading-tight whitespace-nowrap">
                  {contact.firstName} {contact.lastName}
                </h2>
                {companyName && (
                  <span className="text-[12px] text-stone-400 font-medium truncate">{companyName}</span>
                )}
                {isInactive && (
                  <span className="text-[9px] font-mono font-semibold text-stone-400 bg-stone-100 px-1 py-px rounded uppercase">
                    {contact.status}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {!isExpanded && overdueFollowups.length > 0 && (
                  <span className="text-[10px] font-mono text-red-600 bg-red-50 px-1 rounded">
                    {overdueFollowups.length} overdue
                  </span>
                )}
                {!isExpanded && overdueFollowups.length === 0 && upcomingFollowups.length > 0 && (
                  <span className="text-[10px] font-mono text-stone-400">
                    <Clock className="h-2.5 w-2.5 inline -mt-px mr-0.5" />
                    {upcomingFollowups.length}
                  </span>
                )}

                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowStageMenu(!showStageMenu); }}
                    className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded transition-colors hover:opacity-80"
                    style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
                  >
                    {contact.stage}
                  </button>
                  {showStageMenu && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowStageMenu(false)} />
                      <div className="absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-md shadow-lg z-20 py-1 min-w-[130px]">
                        {STAGE_OPTIONS.map((s) => (
                          <button
                            key={s}
                            onClick={() => handleStageClick(s)}
                            className={`block w-full text-left px-3 py-1.5 text-[11px] font-mono hover:bg-stone-50 transition-colors ${
                              s === contact.stage ? "font-semibold text-stone-900 bg-stone-50" : "text-stone-600"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {daysSinceLabel && (
                  <span
                    className={`text-[12px] font-mono tabular-nums min-w-[2.5rem] text-right ${daysSinceUrgency}`}
                    title={lastInteraction ? `Last: ${format(new Date(lastInteraction.date), "MMM d")} - ${lastInteraction.content.slice(0, 60)}` : ""}
                  >
                    {daysSinceLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Subtitle */}
            <div className="flex items-center gap-x-2.5 mt-0.5 text-[11px] text-stone-400 flex-wrap">
              {contact.title && <span>{contact.title}</span>}
              {contact.location && (
                <>
                  {contact.title && <span className="text-stone-200">|</span>}
                  <span>{contact.location}</span>
                </>
              )}
            </div>
            {(contact.email || contact.phone || contact.website) && (
              <div className="flex items-center gap-x-3 mt-0.5 text-[11px] text-stone-400">
                {contact.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3 text-stone-300" />{contact.email}
                  </span>
                )}
                {contact.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3 text-stone-300" />{contact.phone}
                  </span>
                )}
                {contact.website && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3 text-stone-300" />{contact.website}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="ml-6 mt-3">
            {/* Context block - click to edit background */}
            {(contact.background || contact.source || contact.additionalContacts || contact.cadence || editingBackground) && (
              <div className="text-[11px] text-stone-500 mb-3 leading-relaxed space-y-0.5 border-l-2 border-stone-100 pl-3 py-0.5">
                {editingBackground ? (
                  <textarea
                    autoFocus
                    value={backgroundText}
                    onChange={(e) => setBackgroundText(e.target.value)}
                    onBlur={handleBackgroundSave}
                    onKeyDown={(e) => { if (e.key === "Escape") { setEditingBackground(false); setBackgroundText(contact.background || ""); } }}
                    className="w-full text-[11px] text-stone-600 bg-stone-50 border border-stone-200 rounded p-1.5 outline-none focus:border-stone-300 resize-none min-h-[60px]"
                  />
                ) : (
                  <p
                    onClick={() => setEditingBackground(true)}
                    className="cursor-text hover:bg-stone-50 rounded px-1 -mx-1 py-0.5 transition-colors"
                    title="Click to edit"
                  >
                    {contact.background || <span className="text-stone-300 italic">Add background notes...</span>}
                  </p>
                )}
                {contact.additionalContacts && <p className="text-stone-400 italic">{contact.additionalContacts}</p>}
                {contact.source && <p className="text-stone-400">Via {contact.source}</p>}
                {contact.cadence && <p className="text-stone-400 font-medium">{contact.cadence}</p>}
              </div>
            )}

            {/* Interaction timeline */}
            {contact.interactions.length > 0 && (
              <div className="space-y-[2px] mb-3">
                {contact.interactions.map((interaction) => {
                  const Icon = INTERACTION_ICON[interaction.type] || Pencil;
                  const isEditing = editingInteractionId === interaction.id;

                  if (isEditing) {
                    return (
                      <div key={interaction.id} className="flex items-start gap-1.5 text-[11px] leading-snug">
                        <span className="text-stone-400 flex-shrink-0 w-[38px] font-mono text-right tabular-nums pt-[1px]">
                          {format(new Date(interaction.date), "M/d")}
                        </span>
                        <Icon className="h-3 w-3 text-stone-300 flex-shrink-0 mt-[2px]" />
                        <input
                          autoFocus
                          value={editingInteractionText}
                          onChange={(e) => setEditingInteractionText(e.target.value)}
                          onBlur={() => handleInteractionSave(interaction.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleInteractionSave(interaction.id);
                            if (e.key === "Escape") setEditingInteractionId(null);
                          }}
                          className="flex-1 text-[11px] text-stone-600 bg-stone-50 border border-stone-200 rounded px-1.5 py-0.5 outline-none focus:border-stone-300"
                        />
                        <button
                          onClick={() => { onDeleteInteraction(interaction.id); showFlash("Note deleted"); }}
                          className="text-stone-300 hover:text-red-500 transition-colors p-0.5 flex-shrink-0"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={interaction.id}
                      className="flex items-start gap-1.5 text-[11px] leading-snug group/line cursor-text"
                      onClick={() => {
                        setEditingInteractionId(interaction.id);
                        setEditingInteractionText(interaction.content);
                      }}
                    >
                      <span className="text-stone-400 flex-shrink-0 w-[38px] font-mono text-right tabular-nums pt-[1px]">
                        {format(new Date(interaction.date), "M/d")}
                      </span>
                      <Icon className="h-3 w-3 text-stone-300 flex-shrink-0 mt-[2px]" />
                      <span className="text-stone-600 group-hover/line:bg-stone-50 rounded px-0.5 -mx-0.5 transition-colors">
                        {interaction.content}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Follow-ups */}
            {activeFollowups.length > 0 && (
              <div className="mb-2 space-y-1">
                {activeFollowups.map((fu) => {
                  const due = new Date(fu.dueDate);
                  const isOverdue = isPast(due) && !isToday(due);
                  const isTodayDue = isToday(due);
                  const daysUntil = differenceInDays(due, new Date());
                  const isEditingFu = editingFollowupId === fu.id;

                  return (
                    <div
                      key={fu.id}
                      className={`flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1 -mx-2 ${
                        isOverdue
                          ? "bg-red-50 text-red-700 border border-red-100"
                          : isTodayDue
                          ? "bg-amber-50 text-amber-700 border border-amber-100"
                          : "bg-stone-50 text-stone-600 border border-stone-100"
                      }`}
                    >
                      <button
                        onClick={() => onCompleteFollowup(fu.id)}
                        className={`flex-shrink-0 transition-colors rounded p-0.5 ${
                          isOverdue ? "hover:bg-red-100" : isTodayDue ? "hover:bg-amber-100" : "hover:bg-stone-200"
                        }`}
                        title="Mark done"
                      >
                        <Check className="h-3 w-3" />
                      </button>
                      <span className="font-mono tabular-nums flex-shrink-0 font-medium">
                        {format(due, "M/d")}
                      </span>
                      {isEditingFu ? (
                        <input
                          autoFocus
                          value={editingFollowupText}
                          onChange={(e) => setEditingFollowupText(e.target.value)}
                          onBlur={() => handleFollowupSave(fu.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleFollowupSave(fu.id);
                            if (e.key === "Escape") setEditingFollowupId(null);
                          }}
                          className="flex-1 text-[11px] bg-white/80 border border-stone-200 rounded px-1 py-0 outline-none"
                        />
                      ) : (
                        <span
                          className="flex-1 cursor-text hover:underline decoration-dotted underline-offset-2"
                          onClick={() => { setEditingFollowupId(fu.id); setEditingFollowupText(fu.content); }}
                        >
                          {fu.content}
                        </span>
                      )}
                      <span className={`font-mono text-[10px] flex-shrink-0 ${
                        isOverdue ? "text-red-500" : "text-stone-400"
                      }`}>
                        {isOverdue
                          ? `${Math.abs(daysUntil)}d late`
                          : isTodayDue ? "today"
                          : daysUntil <= 14 ? `in ${daysUntil}d` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Violations */}
            {contact.violations.map((v) => (
              <div key={v.id} className="flex items-center gap-1.5 text-[11px] text-amber-700 mb-1 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 -mx-2">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                <span>{v.message}</span>
              </div>
            ))}

            {/* Smart command input */}
            <div className="mt-2 border-t border-dashed border-stone-100 pt-2">
              <div className="relative">
                {/* Command hint overlay */}
                {command.type !== "none" && (
                  <div className="absolute -top-5 left-0 text-[9px] font-mono px-1.5 py-0.5 rounded transition-all"
                    style={{ color: COMMAND_COLORS[command.type], backgroundColor: `${COMMAND_COLORS[command.type]}10` }}
                  >
                    {command.type === "fu" && (command.isValid ? "follow-up ready" : "/fu M/D action text")}
                    {command.type === "stage" && (command.isValid ? "stage ready" : "/stage LEAD|MEETING|PROPOSAL|...")}
                    {command.type === "status" && (command.isValid ? "status ready" : "/status ACTIVE|HOLD|PASS")}
                    {command.isValid && " — press Enter"}
                  </div>
                )}
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  onKeyDown={handleNoteSubmit}
                  placeholder="+ note, /fu 4/15 task, /stage LIVE"
                  className="w-full text-[11px] bg-transparent border-none outline-none transition-colors"
                  style={{
                    color: inputColor || undefined,
                    fontFamily: command.type !== "none" ? "'JetBrains Mono', monospace" : undefined,
                    fontWeight: command.type !== "none" ? 500 : undefined,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
