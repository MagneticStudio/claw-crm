import { useState } from "react";
import { format, isPast, isToday, differenceInDays } from "date-fns";
import { ChevronDown, ChevronRight, Check, AlertTriangle } from "lucide-react";
import type { ContactWithRelations } from "@shared/schema";

interface ContactBlockProps {
  contact: ContactWithRelations;
  stageColor: string;
  onAddInteraction: (content: string, date: string, type?: string) => void;
  onCreateFollowup: (content: string, dueDate: string) => void;
  onCompleteFollowup: (id: number) => void;
  onUpdateContact: (data: Record<string, unknown>) => void;
}

export function ContactBlock({
  contact,
  stageColor,
  onAddInteraction,
  onCreateFollowup,
  onCompleteFollowup,
  onUpdateContact,
}: ContactBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [newNote, setNewNote] = useState("");

  const displayName = contact.additionalContacts
    ? `${contact.firstName} ${contact.lastName}`
    : `${contact.firstName} ${contact.lastName}`;

  const companyName = contact.company?.name || "";
  const hasViolations = contact.violations.length > 0;
  const activeFollowups = contact.followups.filter((f) => !f.completed);
  const overdueFollowups = activeFollowups.filter((f) => isPast(new Date(f.dueDate)) && !isToday(new Date(f.dueDate)));

  const handleNoteSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newNote.trim()) {
      // Parse /fu command
      const fuMatch = newNote.match(/^\/fu?\s+(\d{1,2}\/\d{1,2})\s*(.*)/i);
      if (fuMatch) {
        const [, dateStr, content] = fuMatch;
        const [month, day] = dateStr.split("/").map(Number);
        const year = new Date().getFullYear();
        const dueDate = new Date(year, month - 1, day);
        if (dueDate < new Date()) dueDate.setFullYear(year + 1);
        onCreateFollowup(content || "Follow up", dueDate.toISOString());
        setNewNote("");
        return;
      }

      // Regular interaction note
      onAddInteraction(newNote, new Date().toISOString(), "note");
      setNewNote("");
    }
  };

  return (
    <div className={`py-3 ${hasViolations ? "border-l-2 border-amber-400 pl-3" : "pl-0"}`}>
      {/* Header */}
      <div className="flex items-start gap-2">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-1 text-stone-300 hover:text-stone-500 flex-shrink-0"
        >
          {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-stone-900">
              {displayName}
              {companyName && <span className="text-stone-400 font-normal"> — {companyName}</span>}
            </h2>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stageColor}`}>
              {contact.stage}
            </span>
            {contact.status !== "ACTIVE" && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-400">
                {contact.status}
              </span>
            )}
            {hasViolations && (
              <AlertTriangle className="h-3 w-3 text-amber-500" />
            )}
          </div>

          {/* Contact info line */}
          <div className="text-xs text-stone-400 mt-0.5 flex flex-wrap gap-x-3">
            {contact.title && <span>{contact.title}</span>}
            {contact.location && <span>{contact.location}</span>}
          </div>
          <div className="text-xs text-stone-400 mt-0.5 flex flex-wrap gap-x-3">
            {contact.email && <span>📧 {contact.email}</span>}
            {contact.phone && <span>📞 {contact.phone}</span>}
            {contact.website && <span>🌐 {contact.website}</span>}
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="ml-5 mt-2">
          {/* Background */}
          {contact.background && (
            <p className="text-xs text-stone-500 mb-2 leading-relaxed">{contact.background}</p>
          )}

          {/* Additional contacts */}
          {contact.additionalContacts && (
            <p className="text-xs text-stone-400 mb-2">{contact.additionalContacts}</p>
          )}

          {/* Source */}
          {contact.source && (
            <p className="text-xs text-stone-300 mb-2">Via: {contact.source}</p>
          )}

          {/* Cadence */}
          {contact.cadence && (
            <p className="text-xs text-stone-300 mb-2">Cadence: {contact.cadence}</p>
          )}

          {/* Interactions */}
          {contact.interactions.length > 0 && (
            <div className="space-y-0.5 mb-2">
              {contact.interactions.map((interaction) => (
                <div key={interaction.id} className="text-xs text-stone-600 flex">
                  <span className="text-stone-400 flex-shrink-0 w-12 font-mono">
                    {format(new Date(interaction.date), "M/d")}:
                  </span>
                  <span className="ml-1">{interaction.content}</span>
                </div>
              ))}
            </div>
          )}

          {/* Follow-ups */}
          {activeFollowups.map((fu) => {
            const due = new Date(fu.dueDate);
            const isOverdue = isPast(due) && !isToday(due);
            const daysUntil = differenceInDays(due, new Date());
            return (
              <div
                key={fu.id}
                className={`text-xs flex items-center gap-1.5 mb-1 ${
                  isOverdue ? "text-red-600" : isToday(due) ? "text-amber-600" : "text-stone-500"
                }`}
              >
                <button
                  onClick={() => onCompleteFollowup(fu.id)}
                  className="hover:text-emerald-600 flex-shrink-0"
                  title="Complete follow-up"
                >
                  <Check className="h-3 w-3" />
                </button>
                <span>📌 FU by {format(due, "M/d")}: {fu.content}</span>
                {isOverdue && <span className="text-red-400 font-medium">({Math.abs(daysUntil)}d overdue)</span>}
              </div>
            );
          })}

          {/* Violations */}
          {contact.violations.map((v) => (
            <div key={v.id} className="text-xs text-amber-600 flex items-center gap-1 mb-1">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              <span>{v.message}</span>
            </div>
          ))}

          {/* Inline note input */}
          <input
            type="text"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            onKeyDown={handleNoteSubmit}
            placeholder="Add note or /fu M/D action..."
            className="w-full text-xs text-stone-400 bg-transparent border-none outline-none mt-1 placeholder:text-stone-200"
          />
        </div>
      )}
    </div>
  );
}
