import { describe, expect, it } from 'vitest';
import { formatDate } from '../schema/dateFix';

/**
 * CHARACTERIZATION TESTS — `formatDate`
 *
 * Pure function, no database. Pins today's behaviour, including the lenient
 * fallbacks: unparseable input is echoed back verbatim rather than rejected,
 * and strings that already look ISO-ish are returned untouched without
 * normalisation. Both are load-bearing for existing API responses.
 *
 * Note: this module also logs several [DATE DEBUG] lines per call on the hot
 * path of every sync-history response. Flagged for V2 cleanup; not changed
 * here, because PR 0 does not alter behaviour.
 */

describe('formatDate — nullish input', () => {
  it('maps null and undefined to null', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
  });
});

describe('formatDate — Date objects', () => {
  it('converts a Date to an ISO string', () => {
    expect(formatDate(new Date('2026-01-15T10:30:00.000Z'))).toBe(
      '2026-01-15T10:30:00.000Z',
    );
  });

  it('returns the fallback string for an Invalid Date', () => {
    // toISOString() throws, so the catch block stringifies instead.
    expect(formatDate(new Date('not a date'))).toBe('Invalid Date');
  });
});

describe('formatDate — strings', () => {
  it('passes an ISO-looking string through unchanged', () => {
    // Returned as-is: no normalisation, no millisecond padding, and the
    // offset is preserved rather than converted to UTC.
    expect(formatDate('2026-01-15T10:30:00+02:00')).toBe('2026-01-15T10:30:00+02:00');
    expect(formatDate('2026-01-15T10:30:00')).toBe('2026-01-15T10:30:00');
  });

  it('parses a non-ISO but valid date string into ISO', () => {
    expect(formatDate('2026-01-15')).toBe('2026-01-15T00:00:00.000Z');
  });

  it('returns an unparseable string verbatim', () => {
    expect(formatDate('definitely not a date')).toBe('definitely not a date');
  });

  it('returns an empty string verbatim', () => {
    expect(formatDate('')).toBe('');
  });
});

describe('formatDate — other types', () => {
  it('does NOT interpret a numeric epoch timestamp', () => {
    // CHARACTERIZATION: non-string, non-Date input is String()-ified first,
    // and new Date("1736937000000") is Invalid, so the number is echoed back
    // as a string. Numeric timestamps are therefore NOT supported, despite
    // the final branch looking like a general-purpose coercion.
    expect(formatDate(1_736_937_000_000 as unknown as Date)).toBe('1736937000000');
  });

  it('echoes other non-date values back as strings', () => {
    expect(formatDate(true as unknown as Date)).toBe('true');
    expect(formatDate({} as unknown as Date)).toBe('[object Object]');
  });
});
