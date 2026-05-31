// Shared validators for interaction content.
//
// Interactions are the timeline of things that HAVE happened — past-tense,
// factual records. Forward-looking action items belong in the tasks layer
// (followups of type "task"). Writers occasionally dual-write the same
// imperative-mood content as both an interaction and a task; the interaction
// is then noise. See issue #124.
//
// We don't reject — that would block legitimate edge cases (a quoted email
// that happens to start "Send me the deck"). Instead we surface a soft
// warning the MCP caller can choose to honor.

// Verbs that, at the *start* of an interaction body, strongly signal a
// forward-looking action item ("Send X", "Follow up with Y") rather than a
// past-tense record of something that happened. Kept tight: every verb here
// must be a clear imperative in business-CRM context with low risk of
// colliding with a noun-form opener ("Email from Bobby...", "Call notes:..."
// would false-positive — those verbs are excluded). Past-tense variants
// (e.g. "Sent proposal", "Followed up") are intentionally excluded too.
const IMPERATIVE_VERBS = [
  "send",
  "follow up",
  "followup",
  "check",
  "reach out",
  "schedule",
  "prep",
  "prepare",
  "draft",
  "remind",
  "confirm",
  "circle back",
  "loop in",
  "introduce",
  "set up",
  "book",
] as const;

const IMPERATIVE_RE = new RegExp(`^\\s*(?:${IMPERATIVE_VERBS.map((v) => v.replace(/ /g, "\\s+")).join("|")})\\b`, "i");

/**
 * Heuristic: does `content` look like a forward-looking action item rather
 * than a past-tense interaction record? Matches when the trimmed content
 * starts with an imperative verb from the curated list. Case-insensitive.
 *
 * Note: this is a soft signal. Some legitimate past-tense narration can
 * begin with these tokens (e.g. "Email from Bobby arrived"); the caller
 * should treat the result as a nudge, not a hard reject.
 */
export function looksLikeForwardAction(content: string): boolean {
  if (!content) return false;
  return IMPERATIVE_RE.test(content);
}

export const IMPERATIVE_VERB_LIST = IMPERATIVE_VERBS;

// --- Same-day paraphrase detector (issue #125) ---
//
// Writers sometimes log a typed interaction (meeting/email/call) for an event
// and then *also* log a `note` paraphrasing it on the same date. The note is
// pure noise — lower-signal restatement of the typed event. Detect by
// comparing proper-noun overlap: capitalized multi-letter tokens that aren't
// sentence-start function words. ≥3 shared proper nouns on the same
// (contactId, date) is a strong paraphrase signal.

// Common capitalized sentence-starters and short tokens we don't want to
// count as proper nouns. Lowercased.
const STOP_PROPER_NOUNS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "he",
  "she",
  "they",
  "we",
  "i",
  "it",
  "this",
  "that",
  "these",
  "those",
  "his",
  "her",
  "their",
  "our",
  "my",
  "your",
  "af",
  "ceo",
  "cto",
  "cfo",
  "vp",
  "svp",
  "evp",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "yes",
  "no",
  "ok",
  "okay",
]);

const PROPER_NOUN_RE = /\b[A-Z][a-zA-Z'-]{2,}\b/g;

/**
 * Extract candidate proper nouns from text. Returns a lowercased Set of
 * tokens that look like proper nouns: capitalized, at least 3 chars, not in
 * the stoplist. Case-insensitive comparison via lowercasing.
 */
export function extractProperNouns(text: string): Set<string> {
  if (!text) return new Set();
  const out = new Set<string>();
  const matches = text.match(PROPER_NOUN_RE) ?? [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (!STOP_PROPER_NOUNS.has(lower)) out.add(lower);
  }
  return out;
}

/**
 * Returns true if `noteContent` shares ≥`threshold` proper nouns with any
 * provided `priorContents`. Used to detect a `note` that paraphrases a
 * same-day typed interaction (meeting/email/call).
 */
export function sharesProperNouns(noteContent: string, priorContents: string[], threshold = 3): boolean {
  const noteNouns = extractProperNouns(noteContent);
  if (noteNouns.size < threshold) return false;
  for (const prior of priorContents) {
    const priorNouns = extractProperNouns(prior);
    let overlap = 0;
    for (const n of noteNouns) {
      if (priorNouns.has(n)) {
        overlap++;
        if (overlap >= threshold) return true;
      }
    }
  }
  return false;
}

/**
 * Same-day means the two interactions fall on the same calendar date in UTC.
 * Interactions are stored at noon-UTC, so a simple yyyy-mm-dd compare works.
 */
export function sameUTCDate(a: Date | string, b: Date | string): boolean {
  const da = typeof a === "string" ? new Date(a) : a;
  const db = typeof b === "string" ? new Date(b) : b;
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}
