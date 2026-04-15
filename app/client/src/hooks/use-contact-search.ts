import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ContactWithRelations } from "@shared/schema";

export interface SearchSnippet {
  text: string;
  matchRanges: Array<[number, number]>;
  fieldLabel: string;
}

export interface SearchResult {
  contact: ContactWithRelations;
  snippet: SearchSnippet | null;
}

interface ServerSearchResult {
  contactId: number;
  score: number;
  snippet: SearchSnippet | null;
}

interface ServerSearchResponse {
  results: ServerSearchResult[];
  totalCount: number;
  hasMore: boolean;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useContactSearch(contacts: ContactWithRelations[], query: string): SearchResult[] {
  const debouncedQuery = useDebouncedValue(query, 150);

  const contactMap = useMemo(() => {
    const map = new Map<number, ContactWithRelations>();
    for (const c of contacts) map.set(c.id, c);
    return map;
  }, [contacts]);

  const searchUrl = `/api/search?q=${encodeURIComponent(debouncedQuery)}`;

  const { data } = useQuery<ServerSearchResponse>({
    queryKey: [searchUrl],
    enabled: debouncedQuery.length >= 2,
    staleTime: 10_000,
  });

  return useMemo(() => {
    if (!data || debouncedQuery.length < 2) return [];
    return data.results
      .map((r) => {
        const contact = contactMap.get(r.contactId);
        if (!contact) return null;
        return { contact, snippet: r.snippet } satisfies SearchResult;
      })
      .filter((r): r is SearchResult => r !== null);
  }, [data, contactMap, debouncedQuery]);
}
