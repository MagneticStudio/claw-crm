import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useColors } from "@/App";
import { fmtDate } from "@/lib/utils";
import type { ContactWithRelations } from "@shared/schema";

interface KanbanCardProps {
  contact: ContactWithRelations;
  accentColor: string;
  isDragOverlay?: boolean;
  compact?: boolean;
}

export function KanbanCard({ contact, accentColor, isDragOverlay, compact }: KanbanCardProps) {
  const C = useColors();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: contact.id, data: { stage: contact.stage } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const nextItem = contact.followups
    .filter((f) => !f.completed && !f.cancelledAt)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];

  const companyFirstWord = contact.company?.name?.split(/\s+/)[0] || "";

  // Compact pill for mobile swimlanes
  if (compact) {
    const bubble = (
      <div
        className="flex-shrink-0 select-none cursor-grab active:cursor-grabbing"
        data-contact-id={contact.id}
        style={{ opacity: isDragging ? 0.4 : 1 }}
      >
        <div
          className="flex flex-col justify-center overflow-hidden"
          style={{
            width: 72,
            height: 36,
            borderRadius: 10,
            padding: "4px 8px",
            background: `linear-gradient(135deg, ${accentColor}18, ${accentColor}06)`,
            border: `1.5px solid ${accentColor}30`,
            boxShadow: isDragOverlay ? `0 8px 24px ${accentColor}30` : "none",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
        >
          <span className="text-[10px] font-bold leading-none overflow-hidden whitespace-nowrap" style={{ color: accentColor }}>
            {contact.firstName}
          </span>
          <span className="text-[9px] leading-none mt-0.5 overflow-hidden whitespace-nowrap" style={{ color: C.muted }}>
            {companyFirstWord}
          </span>
        </div>
      </div>
    );

    if (isDragOverlay) return bubble;

    return (
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        {bubble}
      </div>
    );
  }

  // Full desktop card
  const cardContent = (
    <div
      className="bg-white rounded-xl px-3 py-2.5 mb-2 cursor-grab active:cursor-grabbing select-none"
      data-contact-id={contact.id}
      style={{
        border: `1px solid ${C.border}`,
        boxShadow: isDragOverlay ? "0 8px 24px rgba(0,0,0,0.15)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div className="text-sm font-semibold truncate" style={{ color: C.text }}>
        {contact.firstName} {contact.lastName}
      </div>
      {contact.company && (
        <div className="text-xs truncate mt-0.5" style={{ color: C.muted }}>
          {contact.company.name}
        </div>
      )}
      {nextItem && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px]" style={{ color: accentColor }}>
          <span>{nextItem.type === "meeting" ? "📅" : "☐"}</span>
          <span className="font-medium">{fmtDate(new Date(nextItem.dueDate))}</span>
          <span className="truncate" style={{ color: C.muted }}>{nextItem.content}</span>
        </div>
      )}
    </div>
  );

  if (isDragOverlay) return cardContent;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {cardContent}
    </div>
  );
}
