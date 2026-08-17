import { describe, expect, it } from 'vitest';
import { absoluteDate, decimal, relativeTime, splitDuration, videoTimestamp } from './format';

const NOW = new Date('2026-07-25T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('decimal', () => {
  it('writes the decimal mark the way each language does', () => {
    expect(decimal(10.5, 'fr')).toBe('10,5');
    expect(decimal(10.5, 'en')).toBe('10.5');
  });

  it('never pads a trailing zero by default', () => {
    // "375,0 g" of flour is a quantity nobody writes down.
    expect(decimal(375, 'fr')).toBe('375');
    expect(decimal(375, 'en')).toBe('375');
  });

  it('pads when a minimum is asked for, which is what a rating needs', () => {
    // "4 / 5" and "4,5 / 5" side by side would make the score jump a character
    // wider and narrower as votes land.
    expect(decimal(4, 'fr', 1, 1)).toBe('4,0');
    expect(decimal(4, 'en', 1, 1)).toBe('4.0');
  });

  it('never groups the thousands', () => {
    // The French grouping separator is a narrow no-break space and the English
    // one a comma — and a comma there reads as a decimal mark to a French
    // reader, which is the exact confusion this helper exists to remove.
    expect(decimal(1500, 'fr')).toBe('1500');
    expect(decimal(1500, 'en')).toBe('1500');
  });

  it('rounds to the requested number of decimals rather than truncating', () => {
    expect(decimal(1.239, 'en', 2)).toBe('1.24');
    expect(decimal(1.25, 'en', 1)).toBe('1.3');
  });
});

describe('absoluteDate', () => {
  // The 8th of July: the date that reads as a different day under the other
  // convention rather than merely looking foreign. Every case here uses it.
  const AMBIGUOUS = '2026-07-08T12:00:00.000Z';

  it('spells the month out in both languages', () => {
    expect(absoluteDate(AMBIGUOUS, 'fr')).toBe('8 juillet 2026');
    expect(absoluteDate(AMBIGUOUS, 'en')).toBe('8 July 2026');
  });

  it('is never the American order', () => {
    // `Intl.DateTimeFormat('en', …)` resolves to US conventions and would give
    // "July 8, 2026". This app is en-GB, and the guard is that `absoluteDate`
    // maps through LOCALE_IDS rather than passing the bare tag.
    expect(absoluteDate(AMBIGUOUS, 'en')).not.toContain(',');
    expect(absoluteDate(AMBIGUOUS, 'en')).not.toMatch(/^July/);
  });

  it('never produces a digits-only date, in either language', () => {
    // 08/07/2026 and 7/8/26 are the same instant and opposite readings. If a
    // future edit reaches for `dateStyle: 'short'` this is what should stop it.
    for (const locale of ['fr', 'en'] as const) {
      expect(absoluteDate(AMBIGUOUS, locale)).toMatch(/[a-zA-Zé]{3,}/);
      expect(absoluteDate(AMBIGUOUS, locale)).not.toMatch(/^\d+[/.-]\d+[/.-]\d+$/);
    }
  });

  it('keeps the day the seed data says, not the day after', () => {
    // Midday UTC, so no realistic reader offset moves it across midnight —
    // which is what makes an exact assertion here safe in any timezone.
    expect(absoluteDate('2026-07-21T12:00:00.000Z', 'fr')).toBe('21 juillet 2026');
    expect(absoluteDate('2026-01-01T12:00:00.000Z', 'en')).toBe('1 January 2026');
  });

  it('returns null for unparseable input rather than "Invalid Date"', () => {
    expect(absoluteDate('not-a-date', 'fr')).toBeNull();
  });
});

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
