import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import type { ContactWithRelations } from "@shared/schema";
import type { UseMutationResult } from "@tanstack/react-query";

const COLUMN_ORDER = ["LEAD", "MEETING", "PROPOSAL", "NEGOTIATION", "LIVE", "RELATIONSHIP"];

// Desktop: 3 columns, each with 2 stages stacked vertically (snake flow)
const DESKTOP_PAIRS: [string, string][] = [
  ["LEAD", "MEETING"],
  ["PROPOSAL", "NEGOTIATION"],
  ["LIVE", "RELATIONSHIP"],
];

const STAGE_ACCENT: Record<string, string> = {
  LIVE: "#2e7d32",
  NEGOTIATION: "#d4880f",
  PROPOSAL: "#2563eb",
  MEETING: "#2bbcb3",
  LEAD: "#5a7a7a",
  PASS: "#c0392b",
  RELATIONSHIP: "#1a9e96",
};

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

interface KanbanBoardProps {
  contacts: ContactWithRelations[];
  updateContact: UseMutationResult<unknown, Error, { id: number } & Record<string, unknown>>;
  onContactTap?: (contactId: number) => void;
}

export function KanbanBoard({ contacts, updateContact, onContactTap }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const boardRef = useRef<HTMLDivElement>(null);
  const pointerStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const didDrag = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const grouped = useMemo(() => {
    const map: Record<string, ContactWithRelations[]> = {};
    for (const stage of COLUMN_ORDER) map[stage] = [];
    for (const c of contacts) {
      if (map[c.stage]) map[c.stage].push(c);
    }
    return map;
  }, [contacts]);

  const activeContact = useMemo(
    () => (activeId ? contacts.find((c) => c.id === activeId) : undefined),
    [activeId, contacts],
  );

  function handleDragStart(event: DragStartEvent) {
    didDrag.current = true;
    setActiveId(event.active.id as number);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const contactId = active.id as number;
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) return;

    const targetStage = (over.data.current?.stage as string) || (over.id as string);
    if (contact.stage === targetStage) return;
    if (!COLUMN_ORDER.includes(targetStage)) return;

    updateContact.mutate({ id: contactId, stage: targetStage });
  }

  // Tap detection: track pointer at the board level using native DOM events.
  // dnd-kit's PointerSensor uses setPointerCapture which swallows React events,
  // so we use capture-phase native listeners on the board container.
  const onContactTapRef = useRef(onContactTap);
  onContactTapRef.current = onContactTap;

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      didDrag.current = false;
      pointerStart.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (!pointerStart.current || didDrag.current) {
        pointerStart.current = null;
        return;
      }
      const dx = Math.abs(e.clientX - pointerStart.current.x);
      const dy = Math.abs(e.clientY - pointerStart.current.y);
      const dt = Date.now() - pointerStart.current.t;
      pointerStart.current = null;

      if (dx + dy < 5 && dt < 500) {
        // Find the closest card element with a contact ID
        const target = e.target as HTMLElement;
        const cardEl = target.closest("[data-contact-id]");
        if (cardEl) {
          const contactId = Number(cardEl.getAttribute("data-contact-id"));
          if (contactId) onContactTapRef.current?.(contactId);
        }
      }
    };

    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointerup", onUp, true);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointerup", onUp, true);
    };
  }, []);

  return (
    <div ref={boardRef}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {isMobile ? (
          /* Mobile: vertical swimlane strips */
          <div className="flex flex-col gap-1.5 px-3 py-3">
            {COLUMN_ORDER.map((stage) => (
              <Fragment key={stage}>
                <KanbanColumn
                  stage={stage}
                  contacts={grouped[stage]}
                  accentColor={STAGE_ACCENT[stage] || "#5a7a7a"}
                  compact
                />
                {stage === "LIVE" && (
                  <hr className="border-0 my-1" style={{ borderTop: "1px solid #d4e8e830" }} />
                )}
              </Fragment>
            ))}
          </div>
        ) : (
          /* Desktop: 3 columns with stacked stage pairs, compact cards */
          <div className="max-w-[640px] mx-auto px-4 py-4">
            <div className="grid grid-cols-3 gap-2">
              {DESKTOP_PAIRS.map(([top, bottom]) => (
                <div key={top} className="flex flex-col gap-2">
                  <KanbanColumn
                    stage={top}
                    contacts={grouped[top]}
                    accentColor={STAGE_ACCENT[top] || "#5a7a7a"}
                    compact
                  />
                  <KanbanColumn
                    stage={bottom}
                    contacts={grouped[bottom]}
                    accentColor={STAGE_ACCENT[bottom] || "#5a7a7a"}
                    compact
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        <DragOverlay>
          {activeContact ? (
            <KanbanCard
              contact={activeContact}
              accentColor={STAGE_ACCENT[activeContact.stage] || "#5a7a7a"}
              isDragOverlay
              compact
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
