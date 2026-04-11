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

        if (
          data.type?.startsWith("contact_") ||
          data.type?.startsWith("interaction_") ||
          data.type?.startsWith("followup_") ||
          data.type?.startsWith("violation_") ||
          data.type?.startsWith("meeting_") ||
          data.type?.startsWith("briefing_")
        ) {
          queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
        }

        if (data.type?.startsWith("violation_")) {
          queryClient.invalidateQueries({ queryKey: ["/api/violations"] });
        }

        if (data.type === "activity_logged") {
          queryClient.invalidateQueries({ queryKey: ["/api/activity"] });
        }
      } catch {
        // ignore
      }
    };

    es.onerror = () => {};

    return () => {
      es.close();
    };
  }, []);
}
