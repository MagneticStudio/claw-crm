import { useMemo } from "react";
import MiniSearch from "minisearch";
import type { ContactWithRelations } from "@shared/schema";

/**
 * Frontend full-text search over contacts using MiniSearch (BM25).
 *
 * Lazy: the index is only constructed once `enabled` becomes true (i.e. the
 * search input has been opened at least once). After that, it rebuilds
 * whenever the `contacts` array reference changes — react-query swaps the
 * reference on refetch / SSE-driven invalidation, so this stays fresh
 * automatically.
 *
 * One document per contact. Non-contact fields (interactions, followups,
 * briefing) are flattened into a `body` blob so a hit on any of them ranks
 * the parent contact. relationshipJournal is intentionally excluded — it can
 * be long enough to dominate ranking.
 */
export interface ContactSearch {
  search: (query: string) => ContactWithRelations[];
  ready: boolean;
}

interface IndexedDoc {
  id: number;
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  source: string;
  additionalContacts: string;
  background: string;
  companyName: string;
  companyNotes: string;
  companyWebsite: string;
  body: string;
}

function toDoc(c: ContactWithRelations): IndexedDoc {
  const interactions = c.interactions.map((i) => i.content).join("\n");
  const followups = c.followups.map((f) => f.content).join("\n");
  const briefing = c.briefing?.content ?? "";
  return {
    id: c.id,
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    title: c.title ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    location: c.location ?? "",
    source: c.source ?? "",
    additionalContacts: c.additionalContacts ?? "",
    background: c.background ?? "",
    companyName: c.company?.name ?? "",
    companyNotes: c.company?.notes ?? "",
    companyWebsite: c.company?.website ?? "",
    body: [interactions, followups, briefing].filter(Boolean).join("\n"),
  };
}

const SEARCH_FIELDS: (keyof IndexedDoc)[] = [
  "firstName",
  "lastName",
  "title",
  "email",
  "phone",
  "location",
  "source",
  "additionalContacts",
  "background",
  "companyName",
  "companyNotes",
  "companyWebsite",
  "body",
];

const BOOST = {
  firstName: 5,
  lastName: 5,
  companyName: 5,
  title: 2,
  email: 2,
} as const;

interface IndexBundle {
  mini: MiniSearch<IndexedDoc>;
  lookup: Map<number, ContactWithRelations>;
}

export function useContactSearch(contacts: ContactWithRelations[] | undefined, enabled: boolean): ContactSearch {
  const bundle = useMemo<IndexBundle | null>(() => {
    if (!enabled || !contacts || contacts.length === 0) return null;
    const lookup = new Map<number, ContactWithRelations>();
    for (const c of contacts) lookup.set(c.id, c);
    const mini = new MiniSearch<IndexedDoc>({
      fields: SEARCH_FIELDS as string[],
      storeFields: ["id"],
      idField: "id",
    });
    mini.addAll(contacts.map(toDoc));
    return { mini, lookup };
  }, [enabled, contacts]);

  return {
    ready: bundle !== null,
    search: (query: string) => {
      const q = query.trim();
      if (!q || !bundle) return [];
      const hits = bundle.mini.search(q, {
        prefix: true,
        fuzzy: 0.2,
        boost: BOOST,
      });
      const out: ContactWithRelations[] = [];
      for (const hit of hits) {
        const c = bundle.lookup.get(hit.id as number);
        if (c) out.push(c);
      }
      return out;
    },
  };
}
