import { useState, useMemo } from "react";
import { useCrm } from "@/hooks/use-crm";
import { useSSE } from "@/hooks/use-sse";
import { useAuth } from "@/hooks/use-auth";
import { ContactBlock } from "@/components/contact-block";
import { Loader2, LogOut, Settings } from "lucide-react";
import { Link } from "wouter";
import type { ContactWithRelations } from "@shared/schema";

const STAGES = ["ALL", "LIVE", "NEGOTIATION", "PROPOSAL", "MEETING", "LEAD", "HOLD", "PASS", "RELATIONSHIP"] as const;

const STAGE_COLORS: Record<string, string> = {
  LIVE: "bg-emerald-100 text-emerald-800",
  NEGOTIATION: "bg-amber-100 text-amber-800",
  PROPOSAL: "bg-blue-100 text-blue-800",
  MEETING: "bg-purple-100 text-purple-800",
  LEAD: "bg-stone-100 text-stone-600",
  HOLD: "bg-stone-100 text-stone-400",
  PASS: "bg-red-50 text-red-400",
  RELATIONSHIP: "bg-teal-100 text-teal-700",
};

export default function CrmPage() {
  const { contacts, isLoading, addInteraction, createFollowup, completeFollowup, updateContact } = useCrm();
  const { logoutMutation } = useAuth();
  const [activeStage, setActiveStage] = useState<string>("ALL");
  useSSE();

  const filteredContacts = useMemo(() => {
    if (activeStage === "ALL") return contacts;
    return contacts.filter((c) => c.stage === activeStage);
  }, [contacts, activeStage]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: contacts.length };
    for (const c of contacts) {
      counts[c.stage] = (counts[c.stage] || 0) + 1;
    }
    return counts;
  }, [contacts]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-stone-100">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-widest text-stone-800 uppercase">Magnetic Advisors</h1>
          <div className="flex items-center gap-2">
            <Link href="/rules" className="p-2 text-stone-400 hover:text-stone-600">
              <Settings className="h-4 w-4" />
            </Link>
            <button onClick={() => logoutMutation.mutate()} className="p-2 text-stone-400 hover:text-stone-600">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stage filter pills */}
        <div className="max-w-4xl mx-auto px-4 pb-2 flex gap-1.5 overflow-x-auto">
          {STAGES.map((stage) => {
            const count = stageCounts[stage] || 0;
            if (stage !== "ALL" && count === 0) return null;
            const isActive = activeStage === stage;
            return (
              <button
                key={stage}
                onClick={() => setActiveStage(stage)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-stone-900 text-white"
                    : "bg-stone-50 text-stone-500 hover:bg-stone-100"
                }`}
              >
                {stage} {count > 0 && <span className="opacity-60">{count}</span>}
              </button>
            );
          })}
        </div>
      </header>

      {/* Document body */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="text-xs text-stone-300 mb-6 font-mono">
          {contacts.length} contacts &middot; {contacts.filter(c => c.status === "ACTIVE").length} active
        </div>

        {filteredContacts.map((contact, index) => (
          <div key={contact.id}>
            <ContactBlock
              contact={contact}
              stageColor={STAGE_COLORS[contact.stage] || "bg-stone-100 text-stone-600"}
              onAddInteraction={(content, date, type) =>
                addInteraction.mutate({ contactId: contact.id, content, date, type })
              }
              onCreateFollowup={(content, dueDate) =>
                createFollowup.mutate({ contactId: contact.id, content, dueDate })
              }
              onCompleteFollowup={(id) => completeFollowup.mutate(id)}
              onUpdateContact={(data) => updateContact.mutate({ id: contact.id, ...data })}
            />
            {index < filteredContacts.length - 1 && (
              <hr className="border-stone-100 my-1" />
            )}
          </div>
        ))}

        {filteredContacts.length === 0 && (
          <p className="text-center text-stone-300 py-12 text-sm">No contacts in this stage</p>
        )}
      </main>
    </div>
  );
}
