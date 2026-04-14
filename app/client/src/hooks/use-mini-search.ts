import { useMemo, useCallback } from "react";
import MiniSearch from "minisearch";
import type { ContactWithRelations } from "@shared/schema";

interface SearchDoc {
  id: number;
  name: string;
  title: string;
  companyName: string;
  background: string;
  location: string;
  source: string;
  email: string;
  interactionContent: string;
  followupContent: string;
}

function buildDoc(c: ContactWithRelations): SearchDoc {
  return {
    id: c.id,
    name: `${c.firstName} ${c.lastName}`,
    title: c.title || "",
    companyName: c.company?.name || "",
    background: c.background || "",
    location: c.location || "",
    source: c.source || "",
    email: c.email || "",
    interactionContent: c.interactions.map((i) => i.content).join(" "),
    followupContent: c.followups.map((f) => f.content).join(" "),
  };
}

const FIELDS: (keyof SearchDoc)[] = [
  "name",
  "title",
  "companyName",
  "background",
  "location",
  "source",
  "email",
  "interactionContent",
  "followupContent",
];

export function useMiniSearch(contacts: ContactWithRelations[]) {
  const ms = useMemo(() => {
    const instance = new MiniSearch<SearchDoc>({
      fields: FIELDS as string[],
      storeFields: [],
      searchOptions: {
        prefix: true,
        fuzzy: 0.2,
        boost: { name: 3, companyName: 2, title: 1.5 },
      },
    });
    instance.addAll(contacts.map(buildDoc));
    return instance;
  }, [contacts]);

  const search = useCallback(
    (query: string) => {
      if (!query.trim()) return [];
      return ms.search(query);
    },
    [ms],
  );

  const getMatchTerms = useCallback(
    (contactId: number, query: string): string[] => {
      if (!query.trim()) return [];
      const results = ms.search(query);
      const match = results.find((r) => r.id === contactId);
      if (!match) return [];
      return [...match.terms];
    },
    [ms],
  );

  return { search, getMatchTerms };
}
