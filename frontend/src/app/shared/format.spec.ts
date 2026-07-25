import { describe, expect, it } from 'vitest';
import { relativeTime, splitDuration, videoTimestamp } from './format';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it('returns null under a minute so the caller can say "just now"', () => {
    // Intl would otherwise render "in 0 seconds", which is worse than useless.
    expect(relativeTime(ago(30 * SECOND), 'fr', NOW)).toBeNull();
    expect(relativeTime(ago(30 * SECOND), 'en', NOW)).toBeNull();
  });

  it('produces the exact French strings the design copy calls for', () => {
    expect(relativeTime(ago(5 * MINUTE), 'fr', NOW)).toBe('il y a 5 minutes');
    expect(relativeTime(ago(3 * HOUR), 'fr', NOW)).toBe('il y a 3 heures');
    expect(relativeTime(ago(4 * DAY), 'fr', NOW)).toBe('il y a 4 jours');
    expect(relativeTime(ago(25 * DAY), 'fr', NOW)).toBe('il y a 25 jours');
    expect(relativeTime(ago(34 * DAY), 'fr', NOW)).toBe('il y a 1 mois');
    expect(relativeTime(ago(400 * DAY), 'fr', NOW)).toBe('il y a 1 an');
  });

  it('produces the matching English strings', () => {
    expect(relativeTime(ago(5 * MINUTE), 'en', NOW)).toBe('5 minutes ago');
    expect(relativeTime(ago(4 * DAY), 'en', NOW)).toBe('4 days ago');
    expect(relativeTime(ago(34 * DAY), 'en', NOW)).toBe('1 month ago');
    expect(relativeTime(ago(400 * DAY), 'en', NOW)).toBe('1 year ago');
  });

  it('never uses Intl’s word forms for the -1 cases', () => {
    // This is what numeric:'always' buys. With 'auto' these become
    // "le mois dernier" and "yesterday", and the seed copy breaks.
    expect(relativeTime(ago(34 * DAY), 'fr', NOW)).not.toContain('dernier');
    expect(relativeTime(ago(1 * DAY), 'en', NOW)).toBe('1 day ago');
  });

  it('uses a mean month so a 31-day-old post is not promoted early', () => {
    // 31 / 30.44 rounds to 1, and the day bucket only covers < 30 days.
    expect(relativeTime(ago(31 * DAY), 'fr', NOW)).toBe('il y a 1 mois');
    expect(relativeTime(ago(29 * DAY), 'fr', NOW)).toBe('il y a 29 jours');
  });

  it('returns null for unparseable input rather than throwing', () => {
    expect(relativeTime('not-a-date', 'fr', NOW)).toBeNull();
  });
});

describe('splitDuration', () => {
  it('splits minutes into hours and remainder', () => {
    expect(splitDuration(45)).toEqual({ hours: 0, minutes: 45 });
    expect(splitDuration(90)).toEqual({ hours: 1, minutes: 30 });
    expect(splitDuration(120)).toEqual({ hours: 2, minutes: 0 });
    expect(splitDuration(150)).toEqual({ hours: 2, minutes: 30 });
  });
});

describe('videoTimestamp', () => {
  it('pads to mm:ss', () => {
    expect(videoTimestamp(10)).toBe('00:10');
    expect(videoTimestamp(52)).toBe('00:52');
    expect(videoTimestamp(134)).toBe('02:14');
    expect(videoTimestamp(363)).toBe('06:03');
    expect(videoTimestamp(372)).toBe('06:12');
  });

  it('clamps negatives instead of rendering a broken time', () => {
    expect(videoTimestamp(-5)).toBe('00:00');
  });
});
