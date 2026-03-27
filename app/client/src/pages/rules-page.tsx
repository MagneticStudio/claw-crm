import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowLeft, ToggleLeft, ToggleRight } from "lucide-react";
import { Link } from "wouter";
import type { Rule } from "@shared/schema";

export default function RulesPage() {
  const { data: rules = [] } = useQuery<Rule[]>({
    queryKey: ["/api/rules"],
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const res = await apiRequest("PUT", `/api/rules/${id}`, { enabled });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/rules"] }),
  });

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-stone-100">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="text-stone-400 hover:text-stone-600">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-sm font-semibold tracking-widest text-stone-800 uppercase">Rules</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        <p className="text-xs text-stone-400 mb-6">
          Business rules that automatically flag issues in your pipeline. Agents can create, edit, and remove rules.
        </p>

        <div className="space-y-3">
          {rules.map((rule) => (
            <div key={rule.id} className="border border-stone-100 rounded-lg p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-stone-800">{rule.name}</h3>
                  <p className="text-xs text-stone-500 mt-1">{rule.description}</p>
                  {rule.lastEvaluatedAt && (
                    <p className="text-[10px] text-stone-300 mt-2">
                      Last evaluated: {new Date(rule.lastEvaluatedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => toggleRule.mutate({ id: rule.id, enabled: !rule.enabled })}
                  className={`flex-shrink-0 ${rule.enabled ? "text-emerald-500" : "text-stone-300"}`}
                >
                  {rule.enabled ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                </button>
              </div>
            </div>
          ))}

          {rules.length === 0 && (
            <p className="text-center text-stone-300 py-12 text-sm">No rules configured</p>
          )}
        </div>
      </main>
    </div>
  );
}
