import { describe, expect, it } from 'vitest';
import { formatDuration, formatNumber, formatPercent, formatRunTimestamp } from './format';

describe('formatNumber', () => {
  it('groups thousands like the portal does', () => {
    expect(formatNumber(1458)).toBe('1,458');
    expect(formatNumber('1221')).toBe('1,221');
  });

  it('passes through what it cannot read', () => {
    expect(formatNumber(null)).toBe('');
    expect(formatNumber(undefined)).toBe('');
    expect(formatNumber('n/a')).toBe('n/a');
  });
});

describe('formatPercent', () => {
  it('renders the endpoint’s empty-category marker as N/A', () => {
    expect(formatPercent('-')).toBe('N/A');
    expect(formatPercent('')).toBe('N/A');
    expect(formatPercent(undefined)).toBe('N/A');
  });

  it('leaves a real percentage alone', () => {
    expect(formatPercent('95%')).toBe('95%');
  });
});

describe('formatRunTimestamp', () => {
  it('reads the artifact’s space-separated timestamp as local wall clock', () => {
    expect(formatRunTimestamp('2026-08-18 01:02:03')).toBe('August 18, 2026, 01:02');
  });

  it('keeps an unparseable value visible instead of showing Invalid Date', () => {
    expect(formatRunTimestamp('not a date')).toBe('not a date');
    expect(formatRunTimestamp(undefined)).toBe('');
  });
});

describe('formatDuration', () => {
  it('prefers the duration the artifact already phrased', () => {
    expect(formatDuration({ executionTime: '2 hours', executionTimeSeconds: 7200 })).toBe(
      '2 hours',
    );
  });

  it('falls back to the seconds count', () => {
    expect(formatDuration({ executionTimeSeconds: 1 })).toBe('1 second');
    expect(formatDuration({ executionTimeSeconds: 45 })).toBe('45 seconds');
    expect(formatDuration({ executionTimeSeconds: 600 })).toBe('10 minutes');
    expect(formatDuration({ executionTimeSeconds: 9000 })).toBe('2.5 hours');
  });

  it('says nothing when the run carried no timing', () => {
    expect(formatDuration(undefined)).toBe('');
    expect(formatDuration({})).toBe('');
  });
});
