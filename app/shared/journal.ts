// Shared logic for relationship_journal: skeleton, validators, hashing, constants.
// Used by both server (storage helper, MCP tools) and potentially client (size hints).

import { createHash } from "node:crypto";

export const JOURNAL_SIZE_LIMIT = 100_000;
export const DESTRUCTIVE_SHRINK_THRESHOLD = 0.2;
export const DESTRUCTIVE_MIN_BYTES = 500;
export const SUBSTANTIVE_LENGTH = 40;

export const RELATIVE_TIME_PHRASES = [
  "today",
  "tomorrow",
  "yesterday",
  "this week",
  "next week",
  "last week",
  "this month",
  "next month",
  "last month",
  "recently",
  "soon",
  "shortly",
  "earlier this",
  "later this",
  "a few days ago",
  "a while back",
];

// Bare day-of-week not followed by a date (so "this Friday" / "on Tuesday" triggers,
// but "Tuesday, 2026-04-21" or "Tuesday 4/21" is allowed).
const BARE_DAY_OF_WEEK =
  /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b(?!\s*[,.-]?\s*(?:\d|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)))/i;

const ABSOLUTE_DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/, // 2026-04-18
  /\b\d{1,2}\/\d{1,2}\/\d{4}\b/, // 4/18/2026
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/i,
];

/**
 * Canonical top-level sections. The journal uses exactly these three — no more,
 * no less. Agents must not invent new top-level sections; everything new lands
 * in Entries as a dated `### YYYY-MM-DD: <title>` block.
 */
export const CANONICAL_SECTIONS = ["Key People", "Wins / Case Study Material", "Entries"] as const;

export function JOURNAL_SKELETON(name: string): string {
  return `# ${name}

## Key People
<!-- Roster of stakeholders with roles and the current relationship state. Who matters, what they care about. -->

## Wins / Case Study Material
<!-- Durable wins worth preserving for future BD and case studies. Concrete outcomes, measurable impact, quotable moments. -->

## Entries
<!-- Dated narrative entries, newest at the bottom. Append-only. Each entry: ### YYYY-MM-DD: <title> -->
`;
}

export interface ValidationFailure {
  ok: false;
  reason: "relative_date" | "no_absolute_date";
  offending?: string;
  message: string;
}

export interface ValidationSuccess {
  ok: true;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Reject content containing relative time phrases. Case-insensitive, word-boundary.
 */
export function validateAbsoluteDates(text: string): ValidationResult {
  const haystack = text.toLowerCase();
  for (const phrase of RELATIVE_TIME_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(haystack)) {
      return {
        ok: false,
        reason: "relative_date",
        offending: phrase,
        message: `Rejected: found relative time phrase "${phrase}" in new content. Rewrite with an absolute date (e.g. "2026-04-18"). Relative phrases lose meaning over time.`,
      };
    }
  }
  const dayMatch = text.match(BARE_DAY_OF_WEEK);
  if (dayMatch) {
    return {
      ok: false,
      reason: "relative_date",
      offending: dayMatch[0],
      message: `Rejected: found bare day-of-week "${dayMatch[0]}" without a following date. Use an absolute date (e.g. "2026-04-21 (Tuesday)").`,
    };
  }
  return { ok: true };
}

/**
 * Substantive content (> SUBSTANTIVE_LENGTH chars) must include at least one absolute date.
 * Short annotations are exempt.
 */
export function requiresAbsoluteDate(text: string): boolean {
  if (text.length <= SUBSTANTIVE_LENGTH) return false;
  return !ABSOLUTE_DATE_PATTERNS.some((p) => p.test(text));
}

export function validateJournalContent(text: string): ValidationResult {
  const relative = validateAbsoluteDates(text);
  if (!relative.ok) return relative;
  if (requiresAbsoluteDate(text)) {
    return {
      ok: false,
      reason: "no_absolute_date",
      message:
        'Rejected: substantive content must contain at least one absolute date ("YYYY-MM-DD", "M/D/YYYY", or "Month DD, YYYY"). If unknown, write "[date unknown]".',
    };
  }
  return { ok: true };
}

/**
 * Detects removed or rewritten `### YYYY-MM-DD:` Entry headings.
 * Returns true if any heading present in oldDoc is missing (or altered) in newDoc.
 */
export function hasEntryHeadingChange(oldDoc: string, newDoc: string): boolean {
  const headingRe = /^###\s+\d{4}-\d{2}-\d{2}:.*$/gm;
  const oldHeadings = oldDoc.match(headingRe) ?? [];
  const newHeadingSet = new Set(newDoc.match(headingRe) ?? []);
  for (const h of oldHeadings) {
    if (!newHeadingSet.has(h)) return true;
  }
  return false;
}

export function hashJournal(text: string | null): string {
  return createHash("sha256")
    .update(text ?? "")
    .digest("hex");
}

/**
 * True if `newContent` is destructive vs `oldContent`:
 *  - shrinks by >= 20% (and the difference is at least DESTRUCTIVE_MIN_BYTES), OR
 *  - mutates/removes an existing `### YYYY-MM-DD:` Entry heading.
 */
export function isDestructiveChange(oldContent: string, newContent: string): boolean {
  const oldSize = oldContent.length;
  const newSize = newContent.length;
  if (oldSize > 0 && newSize < oldSize) {
    const delta = oldSize - newSize;
    const shrinkFraction = delta / oldSize;
    if (shrinkFraction >= DESTRUCTIVE_SHRINK_THRESHOLD && delta >= Math.min(DESTRUCTIVE_MIN_BYTES, oldSize)) {
      return true;
    }
  }
  return hasEntryHeadingChange(oldContent, newContent);
}

/**
 * Today's date in ISO YYYY-MM-DD (UTC).
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Append a new Entry to the doc. If `## Entries` section is missing, appends
 * it at the end. Returns the updated doc and the full entry heading.
 */
export function appendJournalEntry(
  doc: string,
  title: string,
  body: string,
): { updated: string; entryHeading: string } {
  const heading = `### ${todayIso()}: ${title.trim()}`;
  const entry = `${heading}\n\n${body.trim()}\n`;

  const sectionRe = /^##\s+Entries\s*$/m;
  if (!sectionRe.test(doc)) {
    const separator = doc.endsWith("\n") ? "" : "\n";
    return {
      updated: `${doc}${separator}\n## Entries\n\n${entry}`,
      entryHeading: heading,
    };
  }

  const lines = doc.split("\n");
  let sectionStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Entries\s*$/.test(lines[i])) {
      sectionStart = i;
      break;
    }
  }
  let insertAt = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) {
      insertAt = i;
      break;
    }
  }

  let tail = insertAt;
  while (tail > sectionStart + 1 && lines[tail - 1].trim() === "") tail--;

  const before = lines.slice(0, tail).join("\n");
  const after = lines.slice(insertAt).join("\n");
  const sep = before.endsWith("\n") ? "" : "\n";
  const trailer = after.length > 0 ? `\n\n${after}` : "\n";
  return {
    updated: `${before}${sep}\n${entry}${trailer}`,
    entryHeading: heading,
  };
}
