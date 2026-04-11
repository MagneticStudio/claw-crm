import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useColors } from "@/App";
import { KanbanCard } from "./kanban-card";
import type { ContactWithRelations } from "@shared/schema";

interface KanbanColumnProps {
  stage: string;
  contacts: ContactWithRelations[];
  accentColor: string;
  compact?: boolean;
}

export function KanbanColumn({ stage, contacts, accentColor, compact }: KanbanColumnProps) {
  const C = useColors();
  const { setNodeRef, isOver } = useDroppable({ id: stage, data: { stage } });

  // Mobile swimlane layout
  if (compact) {
    return (
      <div
        className="flex overflow-hidden rounded-lg"
        style={{
          backgroundColor: isOver ? `${accentColor}10` : `${C.border}20`,
          border: isOver ? `2px dashed ${accentColor}50` : "2px solid transparent",
          transition: "all 0.2s",
        }}
      >
        {/* Left accent bar */}
        <div className="flex-shrink-0" style={{ width: 4, backgroundColor: accentColor }} />

        <div className="flex-1 min-w-0">
          {/* Stage header */}
          <div className="px-2.5 pt-1.5 pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: C.text }}>
              {stage}
            </span>
          </div>

          {/* Pills row */}
          <div ref={setNodeRef} className="flex gap-1.5 px-2.5 pb-1.5 overflow-x-auto" style={{ minHeight: 40 }}>
            <SortableContext items={contacts.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
              {contacts.map((contact) => (
                <KanbanCard key={contact.id} contact={contact} accentColor={accentColor} compact />
              ))}
            </SortableContext>
            {contacts.length === 0 && (
              <div className="flex items-center text-[11px] px-1" style={{ color: C.muted }}>
                Empty
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Desktop column layout
  return (
    <div
      className="flex-shrink-0 flex flex-col rounded-xl"
      style={{
        width: 280,
        minWidth: 280,
        backgroundColor: isOver ? `${accentColor}08` : `${C.border}30`,
        border: isOver ? `2px dashed ${accentColor}60` : "2px solid transparent",
        transition: "background-color 0.15s, border-color 0.15s",
      }}
    >
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
          <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.text }}>
            {stage}
          </span>
        </div>
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
        >
          {contacts.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto px-2 pb-2"
        style={{ maxHeight: "calc(100vh - 160px)", minHeight: 120 }}
      >
        <SortableContext items={contacts.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {contacts.map((contact) => (
            <KanbanCard key={contact.id} contact={contact} accentColor={accentColor} />
          ))}
        </SortableContext>
        {contacts.length === 0 && (
          <div className="text-xs text-center py-8 rounded-lg" style={{ color: C.muted }}>
            No contacts
          </div>
        )}
      </div>
    </div>
  );
}
