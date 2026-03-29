import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import type { Rule, RuleViolation, Contact } from "@shared/schema";

const C = {
  text: "#1a2f2f",
  muted: "#5a7a7a",
  border: "#d4e8e8",
  accent: "#2bbcb3",
  accentDark: "#1a9e96",
  accentLight: "#e6f7f6",
  stale: "#d4880f",
  staleBg: "#fef7ec",
  red: "#c0392b",
  redBg: "#fde8e8",
};

type ViolationWithContact = RuleViolation & { contactName?: string };

export default function RulesPage() {
  const { data: rules = [] } = useQuery<Rule[]>({
    queryKey: ["/api/rules"],
  });

  const { data: violations = [] } = useQuery<RuleViolation[]>({
    queryKey: ["/api/violations"],
  });

  // Fetch contacts to map violation contactId to names
  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
    select: (data: any[]) => data.map((c: any) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName })),
  });

  const contactNameMap = new Map(contacts.map((c: any) => [c.id, `${c.firstName} ${c.lastName}`]));

  const toggleRule = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/rules/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/rules"] }),
  });

  const resolveViolation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/violations/${id}/resolve`);
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/violations"] }),
  });

  // Group violations by rule
  const violationsByRule = new Map<number, ViolationWithContact[]>();
  for (const v of violations) {
    const list = violationsByRule.get(v.ruleId) || [];
    list.push({ ...v, contactName: contactNameMap.get(v.contactId) || `Contact ${v.contactId}` });
    violationsByRule.set(v.ruleId, list);
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f0f8f8" }}>
      <header className="sticky top-0 z-50 bg-white" style={{ borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-[640px] mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="transition-colors hover:opacity-70" style={{ color: C.muted }}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-[13px] font-semibold tracking-[0.2em] uppercase" style={{ color: C.text }}>Rules</h1>
          {violations.length > 0 && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: C.staleBg, color: C.stale }}>
              {violations.length} active alert{violations.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-[640px] mx-auto px-4 py-5">
        <p className="text-sm mb-5" style={{ color: C.muted }}>
          Business rules that automatically flag issues in your pipeline. Agents can create, edit, and remove rules.
        </p>

        {/* Rules list */}
        <div className="space-y-3">
          {rules.map((rule) => {
            const ruleViolations = violationsByRule.get(rule.id) || [];
            const condition = rule.condition as any;

            return (
              <div key={rule.id} className="bg-white" style={{ border: `1px solid ${C.border}`, borderRadius: "12px", padding: "1rem 1.25rem" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold" style={{ color: C.text }}>{rule.name}</h3>
                      {!rule.enabled && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: "#f5f5f5", color: "#999" }}>OFF</span>
                      )}
                      {ruleViolations.length > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: C.staleBg, color: C.stale }}>
                          {ruleViolations.length}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1" style={{ color: C.muted }}>{rule.description}</p>

                    {/* Show condition details */}
                    <div className="mt-2 text-[10px] font-mono space-y-0.5" style={{ color: C.muted }}>
                      <div>
                        Condition: <span style={{ color: C.accentDark }}>{condition.type}</span>
                        {condition.params && Object.keys(condition.params).length > 0 && (
                          <span> ({Object.entries(condition.params).map(([k, v]) => `${k}: ${v}`).join(", ")})</span>
                        )}
                      </div>
                      {condition.exceptions?.length > 0 && (
                        <div>
                          Exceptions: {condition.exceptions.map((e: any) => {
                            if (e.type === "stage_in") return `${e.type}(${e.params?.stages?.join(", ")})`;
                            return e.type;
                          }).join(", ")}
                        </div>
                      )}
                    </div>

                    {/* Violations for this rule */}
                    {ruleViolations.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {ruleViolations.map((v) => (
                          <div key={v.id} className="flex items-center gap-2 text-xs rounded px-2 py-1 -mx-1"
                            style={{ backgroundColor: C.staleBg, color: C.stale }}>
                            <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                            <span className="flex-1">{v.contactName}: {v.message}</span>
                            <button onClick={() => resolveViolation.mutate(v.id)}
                              className="hover:opacity-70" style={{ color: C.accentDark }}>dismiss</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {rule.lastEvaluatedAt && (
                      <p className="text-[10px] mt-2" style={{ color: "#bbb" }}>
                        Last evaluated: {new Date(rule.lastEvaluatedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleRule.mutate({ id: rule.id, enabled: !rule.enabled })}
                    className="flex-shrink-0 rounded-full transition-colors"
                    style={{
                      width: 36, height: 20, position: "relative",
                      backgroundColor: rule.enabled ? C.accentDark : "#d1d5db",
                    }}
                  >
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%", backgroundColor: "white",
                      position: "absolute", top: 2,
                      left: rule.enabled ? 18 : 2,
                      transition: "left 0.15s ease",
                    }} />
                  </button>
                </div>
              </div>
            );
          })}

          {rules.length === 0 && (
            <p className="text-center py-12 text-sm" style={{ color: C.muted }}>No rules configured</p>
          )}
        </div>
      </main>
    </div>
  );
}
