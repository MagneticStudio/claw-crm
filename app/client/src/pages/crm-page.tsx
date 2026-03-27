import { useState, useMemo } from "react";
import { useCrm } from "@/hooks/use-crm";
import { useSSE } from "@/hooks/use-sse";
import { useAuth } from "@/hooks/use-auth";
import { ContactBlock } from "@/components/contact-block";
import { Loader2, LogOut, Settings } from "lucide-react";
import { Link } from "wouter";
import type { ContactWithRelations } from "@shared/schema";

const STAGES = ["ALL", "NEGOTIATION", "PROPOSAL", "MEETING", "LEAD", "LIVE", "RELATIONSHIP", "HOLD", "PASS"] as const;

// Stage accent colors — teal-family for active stages, muted for inactive
const STAGE_ACCENT: Record<string, string> = {
  LIVE: "#2e7d32",
  NEGOTIATION: "#d4880f",
  PROPOSAL: "#2563eb",
  MEETING: "#2bbcb3",
  LEAD: "#5a7a7a",
  HOLD: "#6c5ce7",
  PASS: "#c0392b",
  RELATIONSHIP: "#1a9e96",
};

// Sort buckets: pipeline contacts first (sorted by nearest follow-up),
// then LIVE (already in execution), then HOLD/PASS
const SORT_BUCKET: Record<string, number> = {
  NEGOTIATION: 0, PROPOSAL: 0, MEETING: 0, LEAD: 0,  // active pipeline
  LIVE: 1,                                             // in execution
  RELATIONSHIP: 2,
  HOLD: 3, PASS: 4,
};

export default function CrmPage() {
  const { contacts, isLoading, addInteraction, updateInteraction, deleteInteraction, createFollowup, updateFollowup, deleteFollowup, completeFollowup, updateContact } = useCrm();
  const { logoutMutation } = useAuth();
  const [activeStage, setActiveStage] = useState<string>("ALL");
  useSSE();

  const sortedContacts = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => {
      // ACTIVE before non-active
      const aActive = a.status === "ACTIVE" ? 0 : 1;
      const bActive = b.status === "ACTIVE" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      // Pipeline contacts before LIVE before HOLD/PASS
      const aBucket = SORT_BUCKET[a.stage] ?? 2;
      const bBucket = SORT_BUCKET[b.stage] ?? 2;
      if (aBucket !== bBucket) return aBucket - bBucket;

      // Within same bucket, sort by nearest upcoming follow-up (soonest first)
      const aNextFu = a.followups
        .filter(f => !f.completed)
        .map(f => new Date(f.dueDate).getTime())
        .sort((x, y) => x - y)[0] ?? Infinity;
      const bNextFu = b.followups
        .filter(f => !f.completed)
        .map(f => new Date(f.dueDate).getTime())
        .sort((x, y) => x - y)[0] ?? Infinity;
      if (aNextFu !== bNextFu) return aNextFu - bNextFu;

      // Tie-break: most recently interacted first
      const aLast = a.interactions.length > 0 ? new Date(a.interactions[a.interactions.length - 1].date).getTime() : 0;
      const bLast = b.interactions.length > 0 ? new Date(b.interactions[b.interactions.length - 1].date).getTime() : 0;
      return bLast - aLast;
    });
    return sorted;
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    if (activeStage === "ALL") return sortedContacts;
    return sortedContacts.filter((c) => c.stage === activeStage);
  }, [sortedContacts, activeStage]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: contacts.length };
    for (const c of contacts) {
      counts[c.stage] = (counts[c.stage] || 0) + 1;
    }
    return counts;
  }, [contacts]);

  const activeCount = contacts.filter((c) => c.status === "ACTIVE").length;
  const overdueCount = contacts.reduce((n, c) => {
    return n + c.followups.filter((f) => !f.completed && new Date(f.dueDate) < new Date()).length;
  }, 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: "#f0f8f8" }}>
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2bbcb3" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f8f8" }}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white" style={{ borderBottom: "1px solid #d4e8e8" }}>
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-[13px] font-semibold tracking-[0.2em] uppercase" style={{ color: "#1a2f2f" }}>
              Magnetic Advisors
            </h1>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: "#5a7a7a" }}>
              {activeCount} active
              {overdueCount > 0 && <span className="ml-2" style={{ color: "#d4880f" }}>{overdueCount} overdue</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/rules" className="p-2 transition-colors" style={{ color: "#5a7a7a" }}>
              <Settings className="h-4 w-4" />
            </Link>
            <button onClick={() => logoutMutation.mutate()} className="p-2 transition-colors" style={{ color: "#5a7a7a" }}>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stage filter pills */}
        <div className="max-w-[640px] mx-auto px-4 pb-2.5 flex gap-1.5 overflow-x-auto">
          {STAGES.map((stage) => {
            const count = stageCounts[stage] || 0;
            if (stage !== "ALL" && count === 0) return null;
            const isActive = activeStage === stage;
            return (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                className="px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-all"
                style={
                  isActive
                    ? { backgroundColor: "#2bbcb3", color: "#ffffff" }
                    : { backgroundColor: "transparent", color: "#5a7a7a", border: "1px solid #d4e8e8" }
                }
              >
                {stage === "ALL" ? "All" : stage.charAt(0) + stage.slice(1).toLowerCase()}
                <span className="ml-1" style={{ opacity: 0.7 }}>{count}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Document body */}
      <main className="max-w-[640px] mx-auto px-4 py-5">
        {filteredContacts.map((contact) => (
          <ContactBlock
            key={contact.id}
            contact={contact}
            accentColor={STAGE_ACCENT[contact.stage] || "#5a7a7a"}
            onAddInteraction={(content, date, type) =>
              addInteraction.mutate({ contactId: contact.id, content, date, type })
            }
            onUpdateInteraction={(id, data) => updateInteraction.mutate({ id, ...data })}
            onDeleteInteraction={(id) => deleteInteraction.mutate(id)}
            onCreateFollowup={(content, dueDate) =>
              createFollowup.mutate({ contactId: contact.id, content, dueDate })
            }
            onUpdateFollowup={(id, data) => updateFollowup.mutate({ id, ...data })}
            onDeleteFollowup={(id) => deleteFollowup.mutate(id)}
            onCompleteFollowup={(id, outcome) => completeFollowup.mutate({ id, outcome })}
            onUpdateContact={(data) => updateContact.mutate({ id: contact.id, ...data })}
          />
        ))}

        {filteredContacts.length === 0 && (
          <p className="text-center py-16 text-sm" style={{ color: "#5a7a7a" }}>No contacts in this stage</p>
        )}
      </main>
    </div>
  );
}
