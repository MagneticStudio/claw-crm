import type { ContactWithRelations } from "@shared/schema";
import { useColors } from "@/App";

// Mirrors the stage palette used by contact-block and the kanban board.
const STAGE_ACCENT: Record<string, string> = {
  LEAD: "#5a7a7a",
  MEETING: "#2bbcb3",
  PROPOSAL: "#2563eb",
  NEGOTIATION: "#d4880f",
  LIVE: "#2e7d32",
  RELATIONSHIP: "#1a9e96",
  PASS: "#c0392b",
};

const HOLD_COLOR = "#6c5ce7";

interface ContactRowProps {
  contact: ContactWithRelations;
  selected: boolean;
  highlighted?: boolean;
  onSelect: () => void;
}

/** Compact one-line contact row for the desktop master-detail rail. */
export function ContactRow({ contact, selected, highlighted, onSelect }: ContactRowProps) {
  const C = useColors();
  const statusColor = contact.status === "HOLD" ? HOLD_COLOR : C.accent;
  const stageColor = STAGE_ACCENT[contact.stage] || C.accent;

  return (
    <button
      onClick={onSelect}
      data-testid={`contact-row-${contact.id}`}
      className="w-full flex items-center gap-2.5 text-left px-3 py-2.5 transition-colors"
      style={{
        backgroundColor: selected ? C.accentLight : "transparent",
        boxShadow: highlighted ? `inset 0 0 0 2px ${C.accent}` : undefined,
        borderLeft: `3px solid ${statusColor}`,
      }}
    >
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium truncate" style={{ color: selected ? C.accentDark : C.text }}>
          {contact.firstName} {contact.lastName}
        </span>
        {contact.company && (
          <span className="block text-[11px] truncate" style={{ color: C.muted }}>
            {contact.company.name}
          </span>
        )}
      </span>
      <span
        className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
        style={{ backgroundColor: `${stageColor}15`, color: stageColor }}
      >
        {contact.stage}
      </span>
    </button>
  );
}
