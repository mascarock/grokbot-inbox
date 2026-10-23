import { describe, expect, it } from 'vitest';
import { formatExportTime, formatMessageTime, formatRelativeTime, formatThreadTime } from './dates';

describe('dates', () => {
  const iso = '2026-10-23T13:40:00Z';

  it('formats a message time in the local zone without throwing', () => {
    const formatted = formatMessageTime(iso);
    expect(formatted).toContain('2026');
    expect(formatted.length).toBeGreaterThan(8);
  });

  it('uses a clock for a same-day thread and a date otherwise', () => {
    expect(formatThreadTime(iso, new Date('2026-10-23T18:00:00Z'))).not.toContain('2026');
    expect(formatThreadTime('2026-10-20T09:00:00Z', new Date('2026-10-23T18:00:00Z'))).toMatch(/Oct/);
    expect(formatThreadTime('2024-01-02T00:00:00Z', new Date('2026-10-23T18:00:00Z'))).toContain('2024');
  });

  it('returns the original string when the timestamp is not a date', () => {
    expect(formatMessageTime('not-a-date')).toBe('not-a-date');
    expect(formatExportTime('')).toBe('');
  });

  it('formats relative "updated X ago" labels', () => {
    const now = new Date(iso);
    const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();
    expect(formatRelativeTime(ago(10), now)).toBe('just now');
    expect(formatRelativeTime(ago(4 * 60), now)).toBe('4 min ago');
    expect(formatRelativeTime(ago(2 * 3600), now)).toBe('2 h ago');
    expect(formatRelativeTime(ago(3 * 86400), now)).toBe('3 d ago');
    expect(formatRelativeTime('garbage', now)).toBe('');
  });
});