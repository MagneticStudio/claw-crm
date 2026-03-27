import { useEffect, useRef } from "react";
import { queryClient } from "@/lib/queryClient";

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events", { withCredentials: true });
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "connected") return;

        // Any CRM data change: refetch contacts
        if (
          data.type?.startsWith("contact_") ||
          data.type?.startsWith("interaction_") ||
          data.type?.startsWith("followup_") ||
          data.type?.startsWith("violation_")
        ) {
          queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
        }

        if (data.type?.startsWith("violation_")) {
          queryClient.invalidateQueries({ queryKey: ["/api/violations"] });
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
    };
  }, []);
}
