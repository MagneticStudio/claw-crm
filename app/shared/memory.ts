// Shared logic for relationship_memory: skeleton, validators, hashing, constants.
// Used by both server (storage helper, MCP tools) and potentially client (size hints).

import { createHash } from "node:crypto";

export const MEMORY_SIZE_LIMIT = 100_000;
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

export function MEMORY_SKELETON(name: string): string {
  return `# ${name}

## Overview
<!-- 3–6 sentences. What is this engagement? Scope, cadence, economics. -->

## Key People
<!-- Roster of stakeholders with roles and the current relationship state. -->

## Strategic Direction
<!-- What are we trying to accomplish together? Workstreams, priorities. -->

## Active Workstreams
<!-- What is in flight right now. -->

## Wins / Case Study Material
<!-- Durable wins worth preserving for future BD and for memory. -->

## Current State & Rhythm
<!-- Cadence of interaction, mode (advisor, mentor, hands-on), current phase. -->

## Timeline
<!-- Dated narrative entries, newest at the bottom. Append-only. -->

## Open Threads
<!-- What is unresolved, what are we waiting on, what needs attention. -->
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
    // word boundary on either side
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

export function validateMemoryContent(text: string): ValidationResult {
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
 * Detects removed or rewritten `### YYYY-MM-DD:` Timeline headings.
 * Returns true if any heading present in oldDoc is missing (or altered) in newDoc.
 */
export function hasTimelineHeadingChange(oldDoc: string, newDoc: string): boolean {
  const headingRe = /^###\s+\d{4}-\d{2}-\d{2}:.*$/gm;
  const oldHeadings = oldDoc.match(headingRe) ?? [];
  const newHeadingSet = new Set(newDoc.match(headingRe) ?? []);
  for (const h of oldHeadings) {
    if (!newHeadingSet.has(h)) return true;
  }
  return false;
}

export function hashMemory(text: string | null): string {
  return createHash("sha256")
    .update(text ?? "")
    .digest("hex");
}

/**
 * True if `newContent` is destructive vs `oldContent`:
 *  - shrinks by >= 20% (and the difference is at least DESTRUCTIVE_MIN_BYTES), OR
 *  - mutates/removes an existing `### YYYY-MM-DD:` Timeline heading.
 */
export function isDestructiveChange(oldContent: string, newContent: string): boolean {
  const oldSize = oldContent.length;
  const newSize = newContent.length;
  if (oldSize > 0 && newSize < oldSize) {
    const delta = oldSize - newSize;
    const shrinkFraction = delta / oldSize;
    // Use the smaller of the two thresholds — tiny docs aren't trivially deleted
    // (min bytes gate), large docs can't silently lose a big chunk (fraction gate).
    if (shrinkFraction >= DESTRUCTIVE_SHRINK_THRESHOLD && delta >= Math.min(DESTRUCTIVE_MIN_BYTES, oldSize)) {
      return true;
    }
  }
  return hasTimelineHeadingChange(oldContent, newContent);
}

/**
 * Today's date in ISO YYYY-MM-DD (UTC).
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Append a new Timeline entry to the doc. If `## Timeline` section is missing,
 * appends it at the end. Returns the updated doc and the full entry heading.
 */
export function appendTimelineEntry(
  doc: string,
  title: string,
  body: string,
): { updated: string; entryHeading: string } {
  const heading = `### ${todayIso()}: ${title.trim()}`;
  const entry = `${heading}\n\n${body.trim()}\n`;

  const timelineRe = /^##\s+Timeline\s*$/m;
  if (!timelineRe.test(doc)) {
    const separator = doc.endsWith("\n") ? "" : "\n";
    return {
      updated: `${doc}${separator}\n## Timeline\n\n${entry}`,
      entryHeading: heading,
    };
  }

  // Find the Timeline section and insert before the next `## ` heading (or at end of doc).
  const lines = doc.split("\n");
  let timelineStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Timeline\s*$/.test(lines[i])) {
      timelineStart = i;
      break;
    }
  }
  let insertAt = lines.length;
  for (let i = timelineStart + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) {
      insertAt = i;
      break;
    }
  }

  // Trim trailing empty lines within the Timeline section before appending.
  let tail = insertAt;
  while (tail > timelineStart + 1 && lines[tail - 1].trim() === "") tail--;

  const before = lines.slice(0, tail).join("\n");
  const after = lines.slice(insertAt).join("\n");
  const sep = before.endsWith("\n") ? "" : "\n";
  const trailer = after.length > 0 ? `\n\n${after}` : "\n";
  return {
    updated: `${before}${sep}\n${entry}${trailer}`,
    entryHeading: heading,
  };
}
