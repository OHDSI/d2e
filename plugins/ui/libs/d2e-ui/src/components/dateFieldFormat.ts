/**
 * ISO date conversion helpers for `D2eDateField`.
 *
 * The model contract is an ISO `YYYY-MM-DD` string or `null`, never a `Date`.
 * These two functions are the only place the component converts between the
 * two. `Date#toISOString()` is deliberately never used: it converts to UTC
 * first, so a local midnight date east of UTC serializes as the previous
 * day. Every conversion here works from the `Date`'s local parts instead.
 */

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Local-date parts to "YYYY-MM-DD". Never uses toISOString(). */
export function toIsoDate(date: Date | null | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

/** "YYYY-MM-DD" to a Date at local midnight. null for anything unparseable. */
export function fromIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;

  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);

  // Reject a syntactically valid but non-existent date (e.g. 2026-02-31),
  // which `Date` silently rolls forward into the next month.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}
