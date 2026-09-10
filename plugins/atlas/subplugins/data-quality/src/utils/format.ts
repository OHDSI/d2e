import type { OverviewTiming } from '../api/dqd';

/**
 * Display helpers shared by the dashboard. formatNumber and the "-" -> "N/A"
 * rule are ports of the portal's overview table (utils/utils.ts and
 * components/DQD/Overview/OverviewTable/OverviewTable.tsx) so both surfaces read
 * the same numbers the same way. The locale is pinned to en-US for the same
 * reason it is there: plugin strings are not translated yet.
 */
const LOCALE = 'en-US';

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString(LOCALE, { maximumFractionDigits: 10 });
}

/** The endpoint sends "-" for a cell with no checks; the portal shows "N/A". */
export function formatPercent(value: string | null | undefined): string {
  return !value || value === '-' ? 'N/A' : value;
}

// The DQD artifact writes "2026-08-18 01:02:03" — valid enough for V8/JSC/Gecko
// but not ISO, so normalise the separator before handing it to Date. Zoneless
// values are read as local time, which keeps the wall clock the run recorded.
const ARTIFACT_TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/;

/** "2026-08-18 01:02:03" -> "August 18, 2026, 01:02"; the raw value if unparseable. */
export function formatRunTimestamp(raw: string | null | undefined): string {
  if (!raw) return '';
  const parsed = new Date(ARTIFACT_TIMESTAMP.test(raw) ? raw.replace(' ', 'T') : raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const date = parsed.toLocaleDateString(LOCALE, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const time = parsed.toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${date}, ${time}`;
}

function pluralize(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'}`;
}

/**
 * Prefer the duration the artifact already phrased ("2 hours"); fall back to the
 * seconds count, which is all older artifacts carry.
 */
export function formatDuration(timing: OverviewTiming | undefined): string {
  if (timing?.executionTime) return timing.executionTime;
  const seconds = timing?.executionTimeSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
  if (seconds < 60) return pluralize(Math.round(seconds), 'second');
  const minutes = seconds / 60;
  if (minutes < 60) return pluralize(Math.round(minutes), 'minute');
  const hours = minutes / 60;
  return `${Number(hours.toFixed(1))} ${hours === 1 ? 'hour' : 'hours'}`;
}
