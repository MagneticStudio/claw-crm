import { useState, useMemo, useEffect, Fragment } from "react";
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

const COLUMN_ORDER = ["LEAD", "MEETING", "PROPOSAL", "NEGOTIATION", "LIVE", "RELATIONSHIP", "PASS"];

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
}

export function KanbanBoard({ contacts, updateContact }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null);
  const isMobile = useIsMobile();

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

  return (
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
        /* Desktop: horizontal columns */
        <div className="flex gap-3 overflow-x-auto px-4 py-4" style={{ minHeight: "calc(100vh - 120px)" }}>
          {COLUMN_ORDER.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              contacts={grouped[stage]}
              accentColor={STAGE_ACCENT[stage] || "#5a7a7a"}
            />
          ))}
        </div>
      )}
      <DragOverlay>
        {activeContact ? (
          <KanbanCard
            contact={activeContact}
            accentColor={STAGE_ACCENT[activeContact.stage] || "#5a7a7a"}
            isDragOverlay
            compact={isMobile}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
