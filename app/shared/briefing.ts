// Shared briefing contract: template, required sections, validator, staleness.
// Used by server (MCP tools + REST validation) and client (UI gating).

// Briefings older than this stop surfacing as action links on contact cards.
// Raw content is still retrievable via the briefing page so the user can
// review + refresh — but a stale briefing is not prep material.
export const BRIEFING_STALE_DAYS = 7;

/**
 * The eight canonical sections every briefing must contain, in this order.
 * Enforced by validateBriefingSections and surfaced to agents via the tool
 * description + the template skeleton.
 */
export const BRIEFING_SECTIONS = [
  "TL;DR",
  "About them",
  "About the company",
  "Shared ground",
  "Our history",
  "What to discuss",
  "Offers / asks",
  "Watch-outs",
] as const;

export type BriefingSection = (typeof BRIEFING_SECTIONS)[number];

/**
 * The agent-facing research protocol. Loaded into save_briefing's description
 * and into prepare_briefing's response so the behaviour is attached to the
 * tool contract, not buried in a skill file.
 */
export const BRIEFING_RESEARCH_PROTOCOL = `Before writing, you MUST:
1. Draw on what you already know about your user — their role, expertise, background, what they offer. Every talking point, offer, and ask should ground in their actual capability. If you do not know the user well enough to brief on their behalf, say so and stop.
2. Fetch the contact's LinkedIn if a URL is available on the contact record. Note current role, prior roles, education, skills, recent posts/activity.
3. Web-search the contact by name + company. Note press, writing, talks, GitHub, podcasts — whatever reveals what they care about.
4. Research the company. What they do, stage, size, funding, recent news (last 90 days), strategic context.
5. Cross-reference your user's background against the contact's profile. Flag every overlap: shared schools (years), shared employers (tenure), shared domains, mutual second-degree connections if inferable.
6. Re-read the journal, interactions, and open followups returned by prepare_briefing. Do NOT repeat what's there — reference it.

If a \`previousBriefing\` is returned, treat it as a starting point: preserve what's still true, update what's changed, add what's new. Do not rewrite from scratch when an earlier briefing exists.

If information isn't available for a section, write "Unknown — [what you'd want to know]" rather than inventing.`;

/**
 * Target skeleton the agent fills in. Also prefilled into the UI "Create
 * Briefing" flow so manually-written briefings start in the canonical shape.
 */
export function BRIEFING_TEMPLATE(contactName: string, companyName?: string | null): string {
  const header = companyName ? `# ${contactName} — ${companyName}` : `# ${contactName}`;
  return `${header}

## TL;DR
<!-- 2-3 sentences: who they are, where we stand, what this meeting is for. -->

## About them
<!-- Role, background, recent activity. -->

## About the company
<!-- What they do, stage, size, funding, recent news, strategic context. -->

## Shared ground
<!-- Overlap with the user's background — schools, employers, domains, mutual connections. If none, say so plainly. -->

## Our history
<!-- Stage, first contact, 3-5 key moments, current open items. Reference — don't repeat — the journal and interactions. -->

## What to discuss
<!-- 3-5 specific talking points grounded in the user's expertise and this person's situation. -->

## Offers / asks
<!-- Could offer: ... / Could ask: ... -->

## Watch-outs
<!-- Sensitive topics, past friction, dead-end areas, anything worth flagging. -->
`;
}

export type BriefingValidationFailure = {
  ok: false;
  reason: "missing_sections" | "out_of_order";
  missing?: BriefingSection[];
  firstOutOfOrder?: BriefingSection;
  message: string;
};

export type BriefingValidationSuccess = { ok: true };

export type BriefingValidationResult = BriefingValidationSuccess | BriefingValidationFailure;

/**
 * Every canonical section must appear as a `## Section` heading, and they must
 * appear in the canonical order. Extra `##` sections and `###` subheadings are
 * fine — we only check the canonical eight.
 */
export function validateBriefingSections(content: string): BriefingValidationResult {
  const positions: Array<{ section: BriefingSection; index: number }> = [];
  const missing: BriefingSection[] = [];

  for (const section of BRIEFING_SECTIONS) {
    // Match `## Section` as a standalone header line. Escape regex metachars so
    // sections like "Offers / asks" (with `/`) work. Anchor with ^ and $ via
    // the `m` flag so we don't match prose that happens to quote the header.
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^##\\s+${escaped}\\s*$`, "m");
    const match = re.exec(content);
    if (!match || match.index === undefined) {
      missing.push(section);
    } else {
      positions.push({ section, index: match.index });
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      reason: "missing_sections",
      missing,
      message: `Briefing missing required section(s): ${missing.map((s) => `## ${s}`).join(", ")}. Every briefing must contain all 8 canonical sections in order: ${BRIEFING_SECTIONS.map((s) => `## ${s}`).join(" → ")}. Call prepare_briefing(contactId) to get the template and research protocol.`,
    };
  }

  for (let i = 1; i < positions.length; i++) {
    if (positions[i].index < positions[i - 1].index) {
      return {
        ok: false,
        reason: "out_of_order",
        firstOutOfOrder: positions[i].section,
        message: `Briefing sections out of order: "## ${positions[i].section}" appears before "## ${positions[i - 1].section}". Canonical order: ${BRIEFING_SECTIONS.map((s) => `## ${s}`).join(" → ")}.`,
      };
    }
  }

  return { ok: true };
}

/**
 * A briefing is stale when it hasn't been updated in BRIEFING_STALE_DAYS.
 * Accepts anything Date can consume (Date, ISO string, timestamp) for
 * convenience from the client and the API.
 */
export function isBriefingStale(updatedAt: Date | string | number, now: Date = new Date()): boolean {
  const updated = new Date(updatedAt);
  const ageMs = now.getTime() - updated.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return ageDays > BRIEFING_STALE_DAYS;
}

/**
 * Integer days since the briefing was last updated. Floors to the full day.
 */
export function briefingAgeDays(updatedAt: Date | string | number, now: Date = new Date()): number {
  const updated = new Date(updatedAt);
  const ageMs = now.getTime() - updated.getTime();
  return Math.floor(ageMs / (1000 * 60 * 60 * 24));
}
