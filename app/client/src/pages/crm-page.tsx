import { useState, useMemo } from "react";
import { useCrm } from "@/hooks/use-crm";
import { useSSE } from "@/hooks/use-sse";
import { useAuth } from "@/hooks/use-auth";
import { ContactBlock } from "@/components/contact-block";
import { Loader2, LogOut, Settings } from "lucide-react";
import { Link } from "wouter";
import type { ContactWithRelations } from "@shared/schema";

const STAGES = ["ALL", "LIVE", "NEGOTIATION", "PROPOSAL", "MEETING", "LEAD", "RELATIONSHIP", "HOLD", "PASS"] as const;

const STAGE_ACCENT: Record<string, string> = {
  LIVE: "#059669",
  NEGOTIATION: "#d97706",
  PROPOSAL: "#2563eb",
  MEETING: "#7c3aed",
  LEAD: "#78716c",
  HOLD: "#a8a29e",
  PASS: "#dc2626",
  RELATIONSHIP: "#0d9488",
};

const STAGE_ORDER: Record<string, number> = {
  LIVE: 0, NEGOTIATION: 1, PROPOSAL: 2, MEETING: 3, LEAD: 4, RELATIONSHIP: 5, HOLD: 6, PASS: 7,
};

export default function CrmPage() {
  const { contacts, isLoading, addInteraction, updateInteraction, deleteInteraction, createFollowup, updateFollowup, completeFollowup, updateContact } = useCrm();
  const { logoutMutation } = useAuth();
  const [activeStage, setActiveStage] = useState<string>("ALL");
  useSSE();

  const sortedContacts = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => {
      // Active before non-active
      const aActive = a.status === "ACTIVE" ? 0 : 1;
      const bActive = b.status === "ACTIVE" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;

      // Within same status, sort by stage priority
      const aStage = STAGE_ORDER[a.stage] ?? 99;
      const bStage = STAGE_ORDER[b.stage] ?? 99;
      if (aStage !== bStage) return aStage - bStage;

      // Within same stage, most recently interacted first
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
      <div className="flex items-center justify-center min-h-screen bg-stone-50">
        <Loader2 className="h-5 w-5 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-[13px] font-semibold tracking-[0.2em] text-stone-900 uppercase">Magnetic Advisors</h1>
            <p className="text-[11px] text-stone-400 font-mono mt-0.5">
              {activeCount} active
              {overdueCount > 0 && <span className="text-red-500 ml-2">{overdueCount} overdue</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/rules" className="p-2 text-stone-400 hover:text-stone-600 transition-colors">
              <Settings className="h-4 w-4" />
            </Link>
            <button onClick={() => logoutMutation.mutate()} className="p-2 text-stone-400 hover:text-stone-600 transition-colors">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stage filter bar */}
        <div className="max-w-3xl mx-auto px-5 pb-2.5 flex gap-1 overflow-x-auto">
          {STAGES.map((stage) => {
            const count = stageCounts[stage] || 0;
            if (stage !== "ALL" && count === 0) return null;
            const isActive = activeStage === stage;
            const accent = STAGE_ACCENT[stage];
            return (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-stone-900 text-white"
                    : "text-stone-500 hover:bg-stone-100"
                }`}
                style={isActive && accent ? {} : {}}
              >
                {stage === "ALL" ? "All" : stage.charAt(0) + stage.slice(1).toLowerCase()}
                <span className={`ml-1 ${isActive ? "text-white/60" : "text-stone-400"}`}>{count}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Document body */}
      <main className="max-w-3xl mx-auto px-5 py-4">
        {filteredContacts.map((contact) => (
          <ContactBlock
            key={contact.id}
            contact={contact}
            accentColor={STAGE_ACCENT[contact.stage] || "#78716c"}
            onAddInteraction={(content, date, type) =>
              addInteraction.mutate({ contactId: contact.id, content, date, type })
            }
            onUpdateInteraction={(id, data) => updateInteraction.mutate({ id, ...data })}
            onDeleteInteraction={(id) => deleteInteraction.mutate(id)}
            onCreateFollowup={(content, dueDate) =>
              createFollowup.mutate({ contactId: contact.id, content, dueDate })
            }
            onUpdateFollowup={(id, data) => updateFollowup.mutate({ id, ...data })}
            onCompleteFollowup={(id) => completeFollowup.mutate(id)}
            onUpdateContact={(data) => updateContact.mutate({ id: contact.id, ...data })}
          />
        ))}

        {filteredContacts.length === 0 && (
          <p className="text-center text-stone-400 py-16 text-sm">No contacts in this stage</p>
        )}
      </main>
    </div>
  );
}
