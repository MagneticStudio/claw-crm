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
