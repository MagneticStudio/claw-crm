// Shared logic for relationship_journal: skeleton, validators, hashing, constants.
// Used by both server (storage helper, MCP tools) and potentially client (size hints).

import { createHash } from "node:crypto";

export const JOURNAL_SIZE_LIMIT = 100_000;
// Fraction of the doc that can shrink without tripping destructive_edit.
// Raised from 0.20 to 0.40 — cleanups ("remove one test entry") were hitting the gate.
export const DESTRUCTIVE_SHRINK_THRESHOLD = 0.4;
export const DESTRUCTIVE_MIN_BYTES = 500;
export const SUBSTANTIVE_LENGTH = 40;

// Phrases that are unambiguously relative — they reference a point in time only
// meaningful at the moment of writing. Each phrase is matched with word boundaries.
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
  "this quarter",
  "next quarter",
  "last quarter",
  "this year",
  "next year",
  "last year",
  "recently",
  "a few days ago",
  "a while back",
  "earlier this week",
  "earlier this month",
  "earlier this year",
  "later this week",
  "later this month",
  "later this year",
];

// A day-of-week used relatively means "next Tuesday", "by Friday", etc. — a
// TRIGGER word appears before the day name. Generic usage like "Monday through
// Friday" or "Mon/Wed/Fri cadence" must pass.
const RELATIVE_DAY_OF_WEEK =
  /\b(?:next|this|last|by|on|until|starting|before|after|every|each|coming)\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day(?!\s*[,.-]?\s*\d)\b/i;

// Patterns that qualify as absolute dates for the "substantive content needs a
// date" check. Order doesn't matter; any match is enough.
const ABSOLUTE_DATE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "YYYY-MM-DD", re: /\b\d{4}-\d{2}-\d{2}\b/ },
  { label: "M/D/YYYY", re: /\b\d{1,2}\/\d{1,2}\/\d{4}\b/ },
  {
    label: "Month DD, YYYY",
    re: /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}\b/i,
  },
  {
    // "August 2025" — year-only precision, common for historical summaries.
    label: "Month YYYY",
    re: /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i,
  },
  {
    // "Q3 2025" — useful for quarterly retrospectives.
    label: "Q# YYYY",
    re: /\bQ[1-4]\s+\d{4}\b/i,
  },
];

export const ACCEPTED_DATE_FORMATS = ABSOLUTE_DATE_PATTERNS.map((p) => p.label);

/**
 * Required top-level sections. Every journal has at least these three.
 * Destructive-heading detection only protects `### YYYY-MM-DD:` entry headings;
 * `##` sections are documentation contract, not enforcement.
 */
export const CANONICAL_SECTIONS = ["Key People", "Wins / Case Study Material", "Entries"] as const;

/**
 * Sections an agent MAY add when they have genuine signal that doesn't fit the
 * canonical three. Keep the list short; the journal should favor narrative over
 * structure.
 */
export const OPTIONAL_SECTIONS = ["Open Questions", "Risks", "Next Moves"] as const;

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

// Label for the field that failed validation. Intentionally a plain string so
// callers can use semantic names like "title", "body", "newString", "entry[2].body".
export type ValidationField = string;

export type ValidationReason = "relative_phrase" | "relative_day_of_week" | "no_absolute_date";

export interface ValidationFailure {
  ok: false;
  reason: ValidationReason;
  field: ValidationField;
  offending?: string;
  excerpt?: string;
  position?: number;
  acceptedFormats?: string[];
  message: string;
}

export interface ValidationSuccess {
  ok: true;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

function excerptAround(text: string, position: number, length: number, window = 40): string {
  const start = Math.max(0, position - window);
  const end = Math.min(text.length, position + length + window);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

/**
 * Reject content containing relative time phrases. Returns the exact matched
 * phrase, its position, and a surrounding excerpt so the caller can debug.
 */
export function validateAbsoluteDates(text: string, field: ValidationField = "content"): ValidationResult {
  for (const phrase of RELATIVE_TIME_PHRASES) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const m = re.exec(text);
    if (m && m.index !== undefined) {
      return {
        ok: false,
        reason: "relative_phrase",
        field,
        offending: m[0],
        position: m.index,
        excerpt: excerptAround(text, m.index, m[0].length),
        message: `Rejected ${field}: relative phrase "${m[0]}" at position ${m.index}. Rewrite with an absolute date (e.g. "2026-04-18" or "August 2025"). Relative phrases lose meaning over time.`,
      };
    }
  }
  const dayMatch = RELATIVE_DAY_OF_WEEK.exec(text);
  if (dayMatch && dayMatch.index !== undefined) {
    return {
      ok: false,
      reason: "relative_day_of_week",
      field,
      offending: dayMatch[0],
      position: dayMatch.index,
      excerpt: excerptAround(text, dayMatch.index, dayMatch[0].length),
      message: `Rejected ${field}: day-of-week used relatively — "${dayMatch[0]}" at position ${dayMatch.index}. Translate to an absolute date (e.g. "2026-04-21"). Generic usage like "Mon/Wed/Fri cadence" or "Monday through Friday" is fine — only trigger words like "next/this/last/by/on" before a day name are rejected.`,
    };
  }
  return { ok: true };
}

/**
 * Substantive content (> SUBSTANTIVE_LENGTH chars) must include at least one
 * absolute date pattern. Short annotations are exempt.
 */
export function requiresAbsoluteDate(text: string): boolean {
  if (text.length <= SUBSTANTIVE_LENGTH) return false;
  return !ABSOLUTE_DATE_PATTERNS.some((p) => p.re.test(text));
}

export function validateJournalContent(text: string, field: ValidationField = "content"): ValidationResult {
  const relative = validateAbsoluteDates(text, field);
  if (!relative.ok) return relative;
  if (requiresAbsoluteDate(text)) {
    return {
      ok: false,
      reason: "no_absolute_date",
      field,
      acceptedFormats: ACCEPTED_DATE_FORMATS,
      excerpt: excerptAround(text, 0, Math.min(text.length, 80)),
      message: `Rejected ${field}: substantive content (>${SUBSTANTIVE_LENGTH} chars) must include at least one absolute date. Accepted formats: ${ACCEPTED_DATE_FORMATS.join(", ")}. If the date is genuinely unknown, write "[date unknown]".`,
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
 *  - shrinks by >= DESTRUCTIVE_SHRINK_THRESHOLD AND >= DESTRUCTIVE_MIN_BYTES, OR
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True if `d` parses as a valid ISO YYYY-MM-DD and is within a reasonable range. */
export function isReasonableIsoDate(d: string): boolean {
  if (!ISO_DATE_RE.test(d)) return false;
  const [y, m, day] = d.split("-").map(Number);
  if (y < 1900 || y > 2100) return false;
  const dt = new Date(`${d}T00:00:00Z`);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
}

/**
 * Today's date in ISO YYYY-MM-DD (UTC).
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Append a new Entry to the doc. If `## Entries` is missing, appends it at the
 * end. Caller may supply an explicit ISO `dateIso` to backdate migrated notes;
 * otherwise today's date is used. Returns the updated doc and the full entry
 * heading.
 */
export function appendJournalEntry(
  doc: string,
  title: string,
  body: string,
  dateIso?: string,
): { updated: string; entryHeading: string } {
  const effectiveDate = dateIso && isReasonableIsoDate(dateIso) ? dateIso : todayIso();
  const heading = `### ${effectiveDate}: ${title.trim()}`;
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

/**
 * Return the content of a specific top-level section (between `## Section` and
 * the next `## `). Returns null if the section isn't present.
 */
export function readJournalSection(doc: string, section: string): string | null {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^##\\s+${escaped}\\s*$`, "m");
  const m = re.exec(doc);
  if (!m || m.index === undefined) return null;
  const lines = doc.split("\n");
  // Find the line index where the section header is.
  let startLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (new RegExp(`^##\\s+${escaped}\\s*$`).test(lines[i])) {
      startLine = i;
      break;
    }
  }
  if (startLine === -1) return null;
  let endLine = lines.length;
  for (let i = startLine + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) {
      endLine = i;
      break;
    }
  }
  return lines.slice(startLine, endLine).join("\n").trim();
}

/**
 * Return the last `### YYYY-MM-DD: …` Entry block (heading + body up to the
 * next `### ` or `## ` heading). Null if no dated entry exists yet.
 */
export function peekLastEntry(doc: string): { heading: string; body: string } | null {
  const lines = doc.split("\n");
  let lastEntryLine = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^###\s+\d{4}-\d{2}-\d{2}:/.test(lines[i])) {
      lastEntryLine = i;
      break;
    }
  }
  if (lastEntryLine === -1) return null;
  let endLine = lines.length;
  for (let i = lastEntryLine + 1; i < lines.length; i++) {
    if (/^###\s+\S/.test(lines[i]) || /^##\s+\S/.test(lines[i])) {
      endLine = i;
      break;
    }
  }
  const heading = lines[lastEntryLine];
  const body = lines
    .slice(lastEntryLine + 1, endLine)
    .join("\n")
    .trim();
  return { heading, body };
}
