/**
 * Normalize a date to noon UTC.
 * Dates in the CRM are date-only — "April 15" not "April 15 at 3pm UTC".
 * Storing at noon UTC ensures no timezone can shift it to the wrong day.
 * Times (for meetings) are stored separately as display strings ("2:30 PM").
 */
export function toNoonUTC(input: string | Date): Date {
  const d = new Date(input);
  // If the input is just a date string like "2026-04-15" or "4/15",
  // new Date() may parse it as midnight UTC. Shift to noon.
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

/**
 * Parse a date string that might be M/D or YYYY-MM-DD format.
 * Returns a Date at noon UTC.
 */
export function parseDateToNoonUTC(dateStr: string): Date {
  // M/D format (e.g., "4/15")
  if (/^\d{1,2}\/\d{1,2}$/.test(dateStr)) {
    const [month, day] = dateStr.split("/").map(Number);
    const year = new Date().getFullYear();
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (d < new Date()) d.setUTCFullYear(year + 1);
    return d;
  }
  // ISO or other format — normalize to noon
  return toNoonUTC(dateStr);
}
