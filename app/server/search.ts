import MiniSearch from "minisearch";
import type { ContactWithRelations } from "@shared/schema";
import { storage } from "./storage";

// --- Types ---

export interface SearchSnippet {
  text: string;
  matchRanges: Array<[number, number]>;
  fieldLabel: string;
}

export interface ServerSearchResult {
  contactId: number;
  score: number;
  snippet: SearchSnippet | null;
}

export interface SearchResponse {
  results: ServerSearchResult[];
  totalCount: number;
  hasMore: boolean;
}

interface SearchDoc {
  id: number;
  firstName: string;
  lastName: string;
  companyName: string;
  title: string;
  email: string;
  phone: string;
  background: string;
  location: string;
  source: string;
  interactionText: string;
  followupText: string;
  briefingText: string;
}

// --- Constants ---

const FIELDS: Array<keyof SearchDoc> = [
  "firstName",
  "lastName",
  "companyName",
  "followupText",
  "interactionText",
  "title",
  "email",
  "phone",
  "background",
  "location",
  "source",
  "briefingText",
];

const BOOST: Partial<Record<keyof SearchDoc, number>> = {
  firstName: 5,
  lastName: 5,
  companyName: 5,
  followupText: 3,
  interactionText: 2,
};

const NAME_FIELDS = new Set(["firstName", "lastName", "companyName"]);

const FIELD_LABELS: Partial<Record<string, string>> = {
  interactionText: "Note",
  followupText: "Task",
  briefingText: "Briefing",
  title: "Title",
  email: "Email",
  phone: "Phone",
  background: "Background",
  location: "Location",
  source: "Source",
};

const FIELD_PRIORITY = [
  "followupText",
  "interactionText",
  "briefingText",
  "title",
  "email",
  "background",
  "phone",
  "location",
  "source",
];

// --- Pure helpers (ported from client) ---

function contactToDoc(c: ContactWithRelations): SearchDoc {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    companyName: c.company?.name || "",
    title: c.title || "",
    email: c.email || "",
    phone: c.phone || "",
    background: c.background || "",
    location: c.location || "",
    source: c.source || "",
    interactionText: c.interactions.map((i) => i.content).join("\n"),
    followupText: c.followups.map((f) => f.content).join("\n"),
    briefingText: c.briefing?.content || "",
  };
}

function findMatchRanges(text: string, terms: string[]): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const lower = text.toLowerCase();
  for (const term of terms) {
    const tLower = term.toLowerCase();
    let pos = 0;
    while (pos < lower.length) {
      const idx = lower.indexOf(tLower, pos);
      if (idx === -1) break;
      ranges.push([idx, idx + tLower.length]);
      pos = idx + 1;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    if (merged.length > 0 && r[0] <= merged[merged.length - 1][1]) {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
    } else {
      merged.push([...r]);
    }
  }
  return merged;
}

function extractSnippet(fieldValue: string, terms: string[], fieldKey: string): SearchSnippet | null {
  if (!fieldValue) return null;
  const lower = fieldValue.toLowerCase();

  const lines = fieldValue.split("\n").filter((l) => l.trim());
  let bestLine = fieldValue;
  let bestScore = 0;

  for (const line of lines) {
    const lineLower = line.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lineLower.includes(term.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLine = line;
    }
  }

  if (bestScore === 0) {
    let hasMatch = false;
    for (const term of terms) {
      if (lower.includes(term.toLowerCase())) {
        hasMatch = true;
        break;
      }
    }
    if (!hasMatch) return null;
  }

  const source = bestLine;
  const sourceLower = source.toLowerCase();
  let firstMatchIdx = 0;
  for (const term of terms) {
    const idx = sourceLower.indexOf(term.toLowerCase());
    if (idx !== -1) {
      firstMatchIdx = idx;
      break;
    }
  }

  const WINDOW = 80;
  let start = Math.max(0, firstMatchIdx - Math.floor(WINDOW / 3));
  const end = Math.min(source.length, start + WINDOW);
  if (end - start < WINDOW) start = Math.max(0, end - WINDOW);

  let text = source.slice(start, end).trim();
  if (start > 0) text = "\u2026" + text;
  if (end < source.length) text = text + "\u2026";

  const matchRanges = findMatchRanges(text, terms);
  const label = FIELD_LABELS[fieldKey] || fieldKey;

  return { text, matchRanges, fieldLabel: label };
}

// --- SearchService ---

class SearchService {
  private index: MiniSearch<SearchDoc> | null = null;
  private contactCache = new Map<number, ContactWithRelations>();
  private dirty = true;
  private buildPromise: Promise<void> | null = null;

  /** Mark the index as stale. Cheap — no async work. */
  invalidate(): void {
    this.dirty = true;
  }

  /** Ensure the index is fresh before searching. Deduplicates concurrent rebuilds. */
  private async ensureIndex(): Promise<void> {
    if (!this.dirty && this.index) return;
    if (this.buildPromise) {
      await this.buildPromise;
      return;
    }
    this.buildPromise = this.rebuild();
    try {
      await this.buildPromise;
    } finally {
      this.buildPromise = null;
    }
  }

  private async rebuild(): Promise<void> {
    const contacts = await storage.getContactsWithRelations();
    const ms = new MiniSearch<SearchDoc>({
      fields: FIELDS as unknown as string[],
      storeFields: ["id"],
      searchOptions: {
        boost: BOOST as Record<string, number>,
        prefix: true,
        fuzzy: 0.2,
        combineWith: "AND",
      },
    });

    const cache = new Map<number, ContactWithRelations>();
    const docs: SearchDoc[] = [];
    for (const c of contacts) {
      cache.set(c.id, c);
      docs.push(contactToDoc(c));
    }
    ms.addAll(docs);

    this.index = ms;
    this.contactCache = cache;
    this.dirty = false;
  }

  /** Get a cached contact by ID (available after ensureIndex). */
  getContact(id: number): ContactWithRelations | undefined {
    return this.contactCache.get(id);
  }

  /** Get all cached contacts (available after ensureIndex). */
  getAllContacts(): ContactWithRelations[] {
    return [...this.contactCache.values()];
  }

  async search(
    query: string,
    opts?: { stage?: string; status?: string; limit?: number; offset?: number },
  ): Promise<SearchResponse> {
    await this.ensureIndex();
    if (!this.index || query.length < 2) {
      return { results: [], totalCount: 0, hasMore: false };
    }

    const rawResults = this.index.search(query);
    const terms = query
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    let results: ServerSearchResult[] = [];

    for (const result of rawResults) {
      const contact = this.contactCache.get(result.id as number);
      if (!contact) continue;

      // Apply optional stage/status filters
      if (opts?.stage && contact.stage !== opts.stage) continue;
      if (opts?.status && contact.status !== opts.status) continue;

      // Extract snippet — only when the match is NOT on name/company fields
      let snippet: SearchSnippet | null = null;
      const allMatchedFields = new Set<string>();
      for (const fields of Object.values(result.match)) {
        for (const f of fields) allMatchedFields.add(f);
      }
      const hasNameMatch = [...allMatchedFields].some((f) => NAME_FIELDS.has(f));
      const nonNameFields = [...allMatchedFields].filter((f) => !NAME_FIELDS.has(f));

      // If name/company matched, skip snippet — the name is already visible in the card
      if (!hasNameMatch && nonNameFields.length > 0) {
        const doc = contactToDoc(contact);
        for (const field of FIELD_PRIORITY) {
          if (nonNameFields.includes(field)) {
            const value = doc[field as keyof SearchDoc] as string;
            const s = extractSnippet(value, terms, field);
            if (s) {
              snippet = s;
              break;
            }
          }
        }
      }

      results.push({ contactId: contact.id, score: result.score, snippet });
    }

    const totalCount = results.length;
    const limit = opts?.limit || 25;
    const offset = opts?.offset || 0;
    results = results.slice(offset, offset + limit);

    return { results, totalCount, hasMore: offset + limit < totalCount };
  }
}

export const searchService = new SearchService();
