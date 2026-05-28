import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { useColors } from "@/App";

export interface SearchBarProps {
  open: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onArrowDown: () => void;
  onArrowUp: () => void;
  onEnter: () => void;
}

/**
 * Top-nav search affordance. When closed, renders a magnifying-glass icon
 * button. When open, renders an inline input with a close (X) button on the
 * right. Keyboard contract:
 *   - Esc:   onClose (parent clears query + collapses)
 *   - Enter: onEnter (parent blurs but keeps filtered list)
 *   - Up/Down: onArrowUp / onArrowDown (parent moves highlight)
 *
 * Cmd+K is handled by the parent at the window level (works from anywhere).
 */
export const SearchBar = forwardRef<HTMLInputElement, SearchBarProps>(function SearchBar(
  { open, query, onQueryChange, onOpen, onClose, onArrowDown, onArrowUp, onEnter },
  ref,
) {
  const C = useColors();

  if (!open) {
    return (
      <button
        onClick={onOpen}
        className="p-2 transition-colors"
        style={{ color: C.muted }}
        title="Search (⌘K)"
        aria-label="Search"
      >
        <Search className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-1">
      <Search className="h-4 w-4 flex-shrink-0" style={{ color: C.muted }} />
      <input
        ref={ref}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            onArrowDown();
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            onArrowUp();
          }
        }}
        placeholder="Search contacts, interactions, tasks…"
        className="flex-1 min-w-0 bg-transparent text-[13px] outline-none px-1 py-1"
        style={{ color: C.text }}
        aria-label="Search contacts"
      />
      <button
        onClick={onClose}
        className="p-1 transition-colors flex-shrink-0"
        style={{ color: C.muted }}
        title="Close search (Esc)"
        aria-label="Close search"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
});
